import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { purchaseSMS } from "@/lib/smspool";
import {
  buyActivation,
  normalizeFiveSimCountry,
  normalizeFiveSimProduct,
} from "@/lib/fivesim";

const EXPIRE_MS = 15 * 60 * 1000;

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

    const admin = createAdminClient();

    // Active SMS provider from settings
    const { data: provRow } = await admin
      .from("site_settings")
      .select("value")
      .eq("key", "sms_provider")
      .maybeSingle();
    const provider: "smspool" | "fivesim" =
      provRow?.value?.active === "fivesim" ? "fivesim" : "smspool";

    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("balance")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const balance = Number(profile.balance);
    const cost = Math.round(Number(priceNaira) * 100) / 100;
    if (balance < cost) {
      return NextResponse.json(
        { error: "Insufficient balance", balance, required: cost },
        { status: 402 }
      );
    }

    // Deduct only if still has enough (soft race guard)
    const newBalance = Math.round((balance - cost) * 100) / 100;
    const { data: deducted, error: updateErr } = await admin
      .from("profiles")
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("id", user.id)
      .gte("balance", cost)
      .select("balance")
      .maybeSingle();

    if (updateErr || !deducted) {
      return NextResponse.json(
        { error: "Insufficient balance or could not deduct" },
        { status: 402 }
      );
    }

    await admin.from("transactions").insert({
      user_id: user.id,
      type: "purchase",
      amount: -cost,
      balance_after: newBalance,
      description: `Purchase ${serviceName} (${countryCode}) via ${provider}`,
      metadata: { serviceName, countryCode, priceNaira: cost, provider },
    });

    let externalOrderId: string | null = null;
    let phoneNumber: string | null = null;
    let status = "pending";

    try {
      if (provider === "fivesim") {
        if (!process.env.FIVESIM_API_KEY) {
          throw new Error("5sim is selected but FIVESIM_API_KEY is not set");
        }
        const country = normalizeFiveSimCountry(
          String(countryCode || countryName || "")
        );
        const product = normalizeFiveSimProduct(
          String(serviceId || serviceName || "")
        );
        const result = await buyActivation(country, product, "any");
        externalOrderId =
          result?.id != null ? String(result.id) : null;
        phoneNumber = result?.phone || result?.number || null;
        if (!externalOrderId) {
          throw new Error(
            result?.message || "Supplier did not return an order id"
          );
        }
        status = "waiting_sms";
      } else {
        if (!process.env.SMSPOOL_API_KEY) {
          // Demo
          externalOrderId = `DEMO_${Date.now()}`;
          phoneNumber = `+1${Math.floor(1000000000 + Math.random() * 9000000000)}`;
          status = "waiting_sms";
        } else {
          const smspoolResult = await purchaseSMS({
            country: countryCode,
            service: serviceId || serviceName,
            pricing_option: 1,
          });
          externalOrderId =
            smspoolResult?.order_id ||
            smspoolResult?.orderid ||
            smspoolResult?.id ||
            null;
          phoneNumber =
            smspoolResult?.number ||
            smspoolResult?.phonenumber ||
            smspoolResult?.phone ||
            null;
          if (!externalOrderId) {
            throw new Error(
              smspoolResult?.message || "Supplier did not return an order id"
            );
          }
          status = "waiting_sms";
        }
      }
    } catch (smsErr: any) {
      // Exact refund of what was deducted — once
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
        provider,
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
      provider,
    });
  } catch (err: any) {
    console.error("Purchase error", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
