import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { purchaseSMS } from "@/lib/smspool";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      serviceName,
      serviceId,
      countryCode,
      countryName,
      priceNaira,
    } = body;

    if (!serviceName || !countryCode || !priceNaira) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use admin client for balance deduction (atomic-ish)
    const admin = createAdminClient();

    // 1. Check & lock balance
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("balance")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const balance = Number(profile.balance);
    if (balance < priceNaira) {
      return NextResponse.json(
        { error: "Insufficient balance", balance, required: priceNaira },
        { status: 402 }
      );
    }

    // 2. Deduct balance
    const newBalance = balance - priceNaira;
    const { error: updateErr } = await admin
      .from("profiles")
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    if (updateErr) {
      return NextResponse.json(
        { error: "Failed to deduct balance" },
        { status: 500 }
      );
    }

    // 3. Log transaction
    await admin.from("transactions").insert({
      user_id: user.id,
      type: "purchase",
      amount: -priceNaira,
      balance_after: newBalance,
      description: `Purchase ${serviceName} (${countryCode})`,
      metadata: { serviceName, countryCode, priceNaira },
    });

    // 4. Call SMSPool
    let smspoolResult: any = null;
    let phoneNumber: string | null = null;
    let smspoolOrderId: string | null = null;
    let status = "pending";

    try {
      if (process.env.SMSPOOL_API_KEY) {
        smspoolResult = await purchaseSMS({
          country: countryCode,
          service: serviceId || serviceName,
          pricing_option: 1,
        });

        // SMSPool response shapes vary; adjust based on real payload
        smspoolOrderId =
          smspoolResult?.order_id ||
          smspoolResult?.orderid ||
          smspoolResult?.id ||
          null;
        phoneNumber =
          smspoolResult?.number ||
          smspoolResult?.phonenumber ||
          smspoolResult?.phone ||
          null;

        if (smspoolOrderId) {
          status = "waiting_sms";
        } else {
          // Unexpected response → refund
          throw new Error(
            smspoolResult?.message || "SMSPool did not return an order id"
          );
        }
      } else {
        // Demo mode when no key
        smspoolOrderId = `DEMO_${Date.now()}`;
        phoneNumber = `+1${Math.floor(1000000000 + Math.random() * 9000000000)}`;
        status = "waiting_sms";
      }
    } catch (smsErr: any) {
      // Refund on failure
      await admin
        .from("profiles")
        .update({ balance: balance, updated_at: new Date().toISOString() })
        .eq("id", user.id);

      await admin.from("transactions").insert({
        user_id: user.id,
        type: "refund",
        amount: priceNaira,
        balance_after: balance,
        description: `Refund: SMSPool purchase failed – ${smsErr.message}`,
      });

      const raw = String(smsErr?.message || "");
      const lower = raw.toLowerCase();
      let friendly = raw;
      if (
        lower.includes("out_of_stock") ||
        lower.includes("no numbers") ||
        lower.includes("out of stock") ||
        lower.includes("try again later")
      ) {
        friendly =
          "No numbers available for this service/country right now. Please try another country or try again later. Your balance has been refunded.";
      } else {
        // Strip HTML
        friendly = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        if (friendly.length > 200) friendly = friendly.slice(0, 200) + "…";
        friendly = `Number purchase failed: ${friendly}. Your balance has been refunded.`;
      }

      return NextResponse.json({ error: friendly }, { status: 502 });
    }

    // 5. Create order record
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const { data: order, error: orderErr } = await admin
      .from("orders")
      .insert({
        user_id: user.id,
        smspool_order_id: smspoolOrderId,
        service_name: serviceName,
        service_id: serviceId || null,
        country_code: countryCode,
        country_name: countryName || null,
        phone_number: phoneNumber,
        cost_naira: priceNaira,
        status,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (orderErr) {
      console.error("Order insert error", orderErr);
      // Still return success to user if number was obtained; log for admin
    }

    return NextResponse.json({
      orderId: order?.id || smspoolOrderId,
      smspoolOrderId,
      phone_number: phoneNumber,
      status,
      expires_at: expiresAt,
      newBalance,
    });
  } catch (err: any) {
    console.error("Purchase error", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
