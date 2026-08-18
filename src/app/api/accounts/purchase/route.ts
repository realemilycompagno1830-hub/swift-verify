import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  calcNairaFromRub,
  createOrder,
  softOrderDownload,
  softOrderStatus,
} from "@/lib/darkstore";

async function tryFetchDelivery(orderId: string | number) {
  let deliveryLink: string | null = null;
  let deliveryText: string | null = null;

  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));

    const st = await softOrderStatus(orderId);
    const stData = st.json?.data || st.json;
    const stName = String(stData?.status || "").toLowerCase();
    if (["canceled", "cancelled", "error", "refund"].includes(stName)) {
      return { deliveryLink, deliveryText, status: stName };
    }

    const dl = await softOrderDownload(orderId);
    const dlData = dl.json?.data || dl.json;
    const link = dlData?.link || dl.json?.link;
    if (link) {
      deliveryLink = String(link);
      try {
        const fileRes = await fetch(deliveryLink, { cache: "no-store" });
        if (fileRes.ok) {
          const text = (await fileRes.text()).trim();
          if (text && text.length < 80000) deliveryText = text;
        }
      } catch {
        /* keep link */
      }
      return { deliveryLink, deliveryText, status: "completed" };
    }
  }
  return { deliveryLink, deliveryText, status: "pending" };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const productId = body.productId as string;
    const quantity = Math.max(1, Math.min(10, Number(body.quantity) || 1));

    if (!productId) {
      return NextResponse.json({ error: "Missing product" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Please log in first" }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: product, error: prodErr } = await admin
      .from("account_products")
      .select("*")
      .eq("id", productId)
      .eq("is_active", true)
      .single();

    if (prodErr || !product) {
      return NextResponse.json({ error: "Product not available" }, { status: 404 });
    }
    if (Number(product.stock) < quantity) {
      return NextResponse.json(
        { error: "Out of stock. Try another product." },
        { status: 400 }
      );
    }

    const { data: pricingRow } = await admin
      .from("site_settings")
      .select("value")
      .eq("key", "accounts_pricing")
      .single();

    const rate = Number(pricingRow?.value?.rub_ngn_rate ?? 18);
    const markup = Number(pricingRow?.value?.markup_percent ?? 100);
    const unitPrice = calcNairaFromRub(
      Number(product.cost_rub),
      rate,
      markup,
      product.override_price_naira
    );
    const total = unitPrice * quantity;
    const displayName = product.display_name || product.name;

    const { data: profile } = await admin
      .from("profiles")
      .select("balance")
      .eq("id", user.id)
      .single();

    const balance = Number(profile?.balance ?? 0);
    if (balance < total) {
      return NextResponse.json(
        {
          error: `Insufficient balance. You need ₦${total.toLocaleString()}. Please fund your wallet first.`,
          need: total,
          balance,
        },
        { status: 400 }
      );
    }

    const newBalance = Math.round((balance - total) * 100) / 100;
    const { error: balErr } = await admin
      .from("profiles")
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    if (balErr) {
      return NextResponse.json({ error: "Could not update wallet" }, { status: 500 });
    }

    await admin.from("transactions").insert({
      user_id: user.id,
      type: "purchase",
      amount: -total,
      balance_after: newBalance,
      description: `Account: ${displayName} x${quantity}`,
      reference: `acc_${product.darkstore_id}_${Date.now()}`,
    });

    const refund = async (reason: string) => {
      const { data: p2 } = await admin
        .from("profiles")
        .select("balance")
        .eq("id", user.id)
        .single();
      const bal = Number(p2?.balance ?? 0);
      const restored = Math.round((bal + total) * 100) / 100;
      await admin
        .from("profiles")
        .update({ balance: restored, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      await admin.from("transactions").insert({
        user_id: user.id,
        type: "refund",
        amount: total,
        balance_after: restored,
        description: `Refund account: ${reason}`.slice(0, 200),
        reference: `acc_refund_${Date.now()}`,
      });
      return restored;
    };

    let dsResult: any;
    try {
      dsResult = await createOrder(
        Number(product.darkstore_id),
        quantity,
        `sv_${user.id}_${product.darkstore_id}_${Date.now()}`
      );
    } catch (e: any) {
      const msg = e?.message || "Supplier order failed";
      await refund(msg);
      await admin.from("account_orders").insert({
        user_id: user.id,
        product_id: product.id,
        darkstore_product_id: product.darkstore_id,
        product_name: displayName,
        quantity,
        cost_naira: total,
        status: "refunded",
        error_message: msg.slice(0, 500),
      });
      const stockish = /stock|наличии|available/i.test(msg);
      return NextResponse.json(
        {
          error: stockish
            ? "Out of stock at supplier. Your wallet was refunded."
            : `Order failed: ${msg}. Your wallet was refunded.`,
        },
        { status: 400 }
      );
    }

    const data = dsResult?.data || dsResult;
    const orderIdRaw =
      data?.id ??
      data?.order_id ??
      data?.orderId ??
      dsResult?.id ??
      dsResult?.order_id;
    const orderId = orderIdRaw != null ? String(orderIdRaw) : null;
    let deliveryLink =
      data?.link || data?.download_link || dsResult?.link
        ? String(data?.link || data?.download_link || dsResult?.link)
        : null;
    let deliveryText: string | null = null;
    let finalStatus = "pending";

    if (data?.status === "ok" || data?.status === "completed") {
      finalStatus = "completed";
    }

    if (orderId) {
      const got = await tryFetchDelivery(orderId);
      if (got.deliveryLink) deliveryLink = got.deliveryLink;
      if (got.deliveryText) deliveryText = got.deliveryText;
      if (got.status === "completed" || deliveryLink || deliveryText) {
        finalStatus = "completed";
      }
      if (["canceled", "error", "refund"].includes(got.status)) {
        await refund(`Supplier status: ${got.status}`);
        await admin.from("account_orders").insert({
          user_id: user.id,
          product_id: product.id,
          darkstore_product_id: product.darkstore_id,
          darkstore_order_id: orderId,
          product_name: displayName,
          quantity,
          cost_naira: total,
          status: "refunded",
          error_message: `Supplier: ${got.status}`,
        });
        return NextResponse.json(
          { error: "Supplier cancelled the order. Wallet refunded." },
          { status: 400 }
        );
      }
    }

    // ALWAYS save order row when DarkStore accepted payment
    const { data: saved, error: saveErr } = await admin
      .from("account_orders")
      .insert({
        user_id: user.id,
        product_id: product.id,
        darkstore_product_id: product.darkstore_id,
        darkstore_order_id: orderId,
        product_name: displayName,
        quantity,
        cost_naira: total,
        status: finalStatus === "pending" ? "pending" : "completed",
        delivery_text: deliveryText,
        delivery_link: deliveryLink,
      })
      .select()
      .single();

    if (saveErr) {
      console.error("account_orders insert failed", saveErr);
      // Still return delivery if we have it — critical for user
      return NextResponse.json({
        success: true,
        warning:
          "Order placed at supplier but history save failed. Save your credentials now.",
        deliveryText,
        deliveryLink,
        darkstoreOrderId: orderId,
        balance: newBalance,
        message: deliveryText
          ? "Account delivered. Copy your credentials below."
          : deliveryLink
          ? "Use the download link below and save it."
          : `Order #${orderId} placed. Check DarkStore if needed.`,
      });
    }

    await admin
      .from("account_products")
      .update({
        stock: Math.max(0, Number(product.stock) - quantity),
        updated_at: new Date().toISOString(),
      })
      .eq("id", product.id);

    return NextResponse.json({
      success: true,
      order: saved,
      deliveryText,
      deliveryLink,
      darkstoreOrderId: orderId,
      balance: newBalance,
      redirectTo: "/dashboard?tab=accounts",
      message: deliveryText
        ? "Account delivered. Copy your credentials below."
        : deliveryLink
        ? "Order ready. Open the download link and save your file."
        : "Order placed. It will appear in your dashboard shortly.",
    });
  } catch (e: any) {
    console.error("account purchase", e);
    return NextResponse.json(
      { error: e.message || "Purchase failed" },
      { status: 500 }
    );
  }
}
