import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  calcNairaFromRub,
  createOrder,
  orderDownload,
  orderStatus,
} from "@/lib/darkstore";

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

    const { data: product } = await admin
      .from("account_products")
      .select("*")
      .eq("id", productId)
      .eq("is_active", true)
      .single();

    if (!product) {
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

    const { data: profile } = await admin
      .from("profiles")
      .select("balance")
      .eq("id", user.id)
      .single();

    const balance = Number(profile?.balance ?? 0);
    if (balance < total) {
      return NextResponse.json(
        {
          error: `Insufficient balance. You need ₦${total.toLocaleString()}. Please fund your wallet.`,
          need: total,
          balance,
        },
        { status: 400 }
      );
    }

    const newBalance = Math.round((balance - total) * 100) / 100;
    await admin
      .from("profiles")
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    await admin.from("transactions").insert({
      user_id: user.id,
      type: "purchase",
      amount: -total,
      balance_after: newBalance,
      description: `Account: ${product.name} x${quantity}`,
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
        description: `Refund account order: ${reason}`,
        reference: `acc_refund_${Date.now()}`,
      });
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
        product_name: product.name,
        quantity,
        cost_naira: total,
        status: "refunded",
        error_message: msg,
      });
      const stockish =
        /stock|наличии|available/i.test(msg);
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
    const orderId = data?.id;
    let deliveryLink = data?.link || null;
    let deliveryText: string | null = null;
    let status =
      data?.status === "ok" || data?.status === "completed"
        ? "completed"
        : "pending";

    if (orderId) {
      try {
        if (data?.status === "pending") {
          await new Promise((r) => setTimeout(r, 2000));
          const st = await orderStatus(orderId);
          const stData = st?.data || st;
          if (stData?.status === "completed" || stData?.status === "ok") {
            status = "completed";
          }
        }
        const dl = await orderDownload(orderId);
        const dlData = dl?.data || dl;
        if (dlData?.link) deliveryLink = dlData.link;

        if (deliveryLink) {
          try {
            const fileRes = await fetch(deliveryLink, { cache: "no-store" });
            if (fileRes.ok) {
              const text = await fileRes.text();
              if (text && text.length < 50000) deliveryText = text.trim();
            }
          } catch {
            /* link only */
          }
        }
      } catch {
        /* soft */
      }
    }

    if (!deliveryLink && !deliveryText && !orderId) {
      await refund("No delivery from supplier");
      await admin.from("account_orders").insert({
        user_id: user.id,
        product_id: product.id,
        darkstore_product_id: product.darkstore_id,
        product_name: product.name,
        quantity,
        cost_naira: total,
        status: "refunded",
        error_message: "No delivery",
      });
      return NextResponse.json(
        { error: "Could not deliver account. Wallet refunded." },
        { status: 400 }
      );
    }

    const { data: saved } = await admin
      .from("account_orders")
      .insert({
        user_id: user.id,
        product_id: product.id,
        darkstore_product_id: product.darkstore_id,
        darkstore_order_id: orderId ? String(orderId) : null,
        product_name: product.name,
        quantity,
        cost_naira: total,
        status: status === "pending" ? "pending" : "completed",
        delivery_text: deliveryText,
        delivery_link: deliveryLink,
      })
      .select()
      .single();

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
      balance: newBalance,
      message: deliveryText
        ? "Account delivered. Copy your credentials below."
        : deliveryLink
        ? "Order ready. Use the download link below."
        : "Order placed. Check your order history shortly.",
    });
  } catch (e: any) {
    console.error("account purchase", e);
    return NextResponse.json(
      { error: e.message || "Purchase failed" },
      { status: 500 }
    );
  }
}
