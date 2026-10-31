import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { purchaseSMS, calculateNairaPrice } from "@/lib/smspool";

const EXPIRE_MS = 15 * 60 * 1000; // 15 minutes

/**
 * SMSPool-only number purchase.
 * Deducts wallet → buys number → saves order → returns phone for OTP polling.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      serviceId,
      serviceName,
      countryCode,
      countryName,
      priceNaira,
    } = body;

    if (!serviceName || !countryCode) {
      return NextResponse.json(
        { error: "Service and country are required" },
        { status: 400 }
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

    // Pricing from admin config
    const { data: marginRow } = await admin
      .from("site_settings")
      .select("value")
      .eq("key", "global_margin")
      .maybeSingle();

    const globalMarkup = Number(
      marginRow?.value?.markup_percent ?? marginRow?.value?.percent ?? 150
    );
    const usdNgnRate = Number(marginRow?.value?.usd_ngn_rate ?? 1600);

    // Override price if set
    let cost = Number(priceNaira) || 0;
    try {
      const { data: ov } = await admin
        .from("price_overrides")
        .select("*")
        .or("provider.eq.smspool,provider.is.null");
      for (const o of ov || []) {
        const s = String(o.service_name || o.service_id || "").toLowerCase();
        const c = String(o.country_code || "").toUpperCase();
        if (
          s === String(serviceName).toLowerCase() &&
          c === String(countryCode).toUpperCase() &&
          o.price_naira != null
        ) {
          cost = Number(o.price_naira);
          break;
        }
      }
    } catch {
      /* optional */
    }

    if (!cost || cost <= 0) {
      cost = calculateNairaPrice(0.2, globalMarkup, null, null, usdNgnRate);
    }
    cost = Math.ceil(cost);

    const { data: profile } = await admin
      .from("profiles")
      .select("balance")
      .eq("id", user.id)
      .single();

    const balance = Number(profile?.balance ?? 0);
    if (balance < cost) {
      return NextResponse.json(
        {
          error: `Insufficient balance. You need ₦${cost.toLocaleString()}. Fund your wallet first.`,
          need: cost,
          balance,
          requireFund: true,
        },
        { status: 400 }
      );
    }

    // Deduct wallet first
    const newBalance = Math.round((balance - cost) * 100) / 100;
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
      amount: -cost,
      balance_after: newBalance,
      description: `Purchase ${serviceName} (${countryCode})`,
      reference: `sms_${user.id}_${Date.now()}`,
      metadata: { serviceName, countryCode, priceNaira: cost, provider: "smspool" },
    });

    // Resolve SMSPool service id
    let poolService: string | number = serviceId || serviceName;
    try {
      const { data: manuals } = await admin
        .from("sms_manual_services")
        .select("*")
        .or("provider.eq.smspool,provider.is.null");
      for (const m of manuals || []) {
        const name = String(m.name || m.service_name || "").toLowerCase();
        if (name === String(serviceName).toLowerCase() && m.service_id) {
          poolService = m.service_id;
          break;
        }
      }
    } catch {
      /* optional */
    }

    let externalOrderId = "";
    let phoneNumber = "";
    let status = "waiting_sms";

    try {
      const result = await purchaseSMS({
        country: countryCode,
        service: poolService,
        pricing_option: 1, // highest success
      });

      externalOrderId = String(
        result?.order_id || result?.orderid || result?.id || ""
      );
      phoneNumber = String(
        result?.number || result?.phone || result?.phonenumber || ""
      );

      if (!externalOrderId || !phoneNumber) {
        throw new Error(
          result?.message ||
            result?.error ||
            "SMSPool did not return a number. Try another country."
        );
      }
    } catch (smsErr: any) {
      // Refund
      const { data: profile2 } = await admin
        .from("profiles")
        .select("balance")
        .eq("id", user.id)
        .single();
      const cur = Number(profile2?.balance || 0);
      const restored = Math.round((cur + cost) * 100) / 100;
      await admin
        .from("profiles")
        .update({ balance: restored, updated_at: new Date().toISOString() })
        .eq("id", user.id);

      await admin.from("transactions").insert({
        user_id: user.id,
        type: "refund",
        amount: cost,
        balance_after: restored,
        description: `Refund: purchase failed – ${(smsErr.message || "").slice(0, 120)}`,
        reference: `fail_${user.id}_${Date.now()}`,
      });

      const raw = String(smsErr?.message || "");
      const lower = raw.toLowerCase();
      let friendly = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      if (
        lower.includes("out_of_stock") ||
        lower.includes("no numbers") ||
        lower.includes("out of stock") ||
        lower.includes("no free phones")
      ) {
        friendly =
          "No numbers available for this service/country right now. Please try another country or try again later. Your balance has been refunded.";
      } else {
        if (friendly.length > 200) friendly = friendly.slice(0, 200) + "…";
        friendly = `Number purchase failed: ${friendly}. Your balance has been refunded.`;
      }

      return NextResponse.json({ error: friendly }, { status: 502 });
    }

    const expiresAt = new Date(Date.now() + EXPIRE_MS).toISOString();

    const { data: order, error: orderErr } = await admin
      .from("orders")
      .insert({
        user_id: user.id,
        smspool_order_id: externalOrderId,
        service_name: serviceName,
        service_id: serviceId || null,
        country_code: countryCode,
        country_name: countryName || null,
        phone_number: phoneNumber,
        cost_naira: cost,
        status,
        expires_at: expiresAt,
        provider: "smspool",
      })
      .select()
      .single();

    if (orderErr) {
      console.error("Order insert error", orderErr);
    }

    return NextResponse.json({
      orderId: order?.id || externalOrderId,
      smspoolOrderId: externalOrderId,
      phone_number: phoneNumber,
      status,
      expires_at: expiresAt,
      newBalance,
      provider: "smspool",
    });
  } catch (err: any) {
    console.error("Purchase error", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
