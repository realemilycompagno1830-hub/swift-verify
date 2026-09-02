import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  calcNairaFromRub,
  createOrder,
  getBalance as getDarkBalance,
  softOrderDownload,
  softOrderStatus,
} from "@/lib/darkstore";

/** Never expose supplier brand names to end users */
function publicError(msg: string) {
  return String(msg || "Order failed")
    .replace(/dark\s*store/gi, "supplier")
    .replace(/darkstore/gi, "supplier")
    .replace(/dark\.shopping/gi, "supplier")
    .replace(/smspool/gi, "provider")
    .slice(0, 280);
}

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

    // Sometimes create response already had link in status payload
    const stLink = stData?.link;
    if (stLink) {
      deliveryLink = String(stLink);
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

    if (!process.env.DARKSTORE_API_KEY) {
      return NextResponse.json(
        { error: "Account supplier is not configured. Contact support." },
        { status: 503 }
      );
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
      return NextResponse.json(
        { error: "Product not found or inactive" },
        { status: 404 }
      );
    }

    if (Number(product.stock) < quantity) {
      return NextResponse.json(
        { error: "Not enough stock for this product" },
        { status: 400 }
      );
    }

    // Optional: warn if supplier balance looks empty (non-blocking if API fails)
    try {
      const { balance: dsBal } = await getDarkBalance();
      if (dsBal <= 0) {
        console.error("DarkStore balance is 0 or negative:", dsBal);
        return NextResponse.json(
          {
            error:
              "Supplier account has no balance. Top up the supplier wallet, then try again.",
          },
          { status: 503 }
        );
      }
    } catch (balErr: any) {
      console.error("Could not read supplier balance", balErr?.message);
      // continue — order may still work
    }

    const { data: marginRow } = await admin
      .from("site_settings")
      .select("value")
      .eq("key", "accounts_margin")
      .maybeSingle();

    const markup = Number(marginRow?.value?.markup_percent ?? 50);
    const rubNgn = Number(marginRow?.value?.rub_ngn_rate ?? 18);

    const unitPrice =
      product.override_price_naira != null &&
      Number(product.override_price_naira) > 0
        ? Number(product.override_price_naira)
        : calcNairaFromRub(Number(product.cost_rub) || 0, rubNgn, markup);

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

    let created: Awaited<ReturnType<typeof createOrder>>;
    try {
      created = await createOrder(
        Number(product.darkstore_id),
        quantity,
        `sv_${user.id}_${product.darkstore_id}_${Date.now()}`
      );
    } catch (e: any) {
      const msg = publicError(e?.message || "Supplier order failed");
      console.error("createOrder failed", e?.message, e);
      await refund(msg);
      await admin.from("account_orders").insert({
        user_id: user.id,
        product_id: product.id,
        darkstore_product_id: product.darkstore_id,
        product_name: displayName,
        quantity,
        cost_naira: total,
        status: "refunded",
        error_message: msg.slice(0, 300),
      });
      return NextResponse.json(
        {
          error: `Order failed: ${msg}. Your wallet was refunded.`,
        },
        { status: 400 }
      );
    }

    const orderId = created.orderId;
    let deliveryLink = created.link;
    let deliveryText: string | null = null;
    let finalStatus = created.status || "pending";

    // If we already have a download link from create, try to read the file
    if (deliveryLink) {
      try {
        const fileRes = await fetch(deliveryLink, { cache: "no-store" });
        if (fileRes.ok) {
          const text = (await fileRes.text()).trim();
          if (text && text.length < 80000) deliveryText = text;
        }
      } catch {
        /* keep link only */
      }
      finalStatus = "completed";
    } else if (orderId) {
      const got = await tryFetchDelivery(orderId);
      deliveryLink = got.deliveryLink;
      deliveryText = got.deliveryText;
      finalStatus = got.status;

      if (["canceled", "cancelled", "error", "refund"].includes(got.status)) {
        await refund(`Supplier: ${got.status}`);
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

    if (!orderId && !deliveryLink) {
      await refund("No order id from supplier");
      return NextResponse.json(
        {
          error:
            "Order failed: supplier did not return an order id. Your wallet was refunded.",
        },
        { status: 400 }
      );
    }

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
          : `Order #${orderId} placed. Delivery will appear in your dashboard shortly.`,
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
      { error: publicError(e.message || "Purchase failed") },
      { status: 500 }
    );
  }
}
