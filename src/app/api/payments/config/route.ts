import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Public payment config for the checkout UI.
 * Returns which gateway is active + its public key.
 * Switch is stored in site_settings.payment_provider (or env fallback).
 */
export async function GET() {
  try {
    let active =
      process.env.NEXT_PUBLIC_PAYMENT_PROVIDER ||
      process.env.PAYMENT_PROVIDER ||
      "paystack";

    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "payment_provider")
        .maybeSingle();
      const fromDb = data?.value?.active || data?.value?.provider;
      if (fromDb === "paystack" || fromDb === "flutterwave") {
        active = fromDb;
      }
    } catch {
      /* use env */
    }

    if (active !== "paystack" && active !== "flutterwave") {
      active = "paystack";
    }

    const paystackPublic = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "";
    const flutterwavePublic =
      process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY || "";

    const publicKey =
      active === "flutterwave" ? flutterwavePublic : paystackPublic;

    return NextResponse.json({
      provider: active,
      publicKey,
      configured: {
        paystack: !!(
          process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY &&
          process.env.PAYSTACK_SECRET_KEY
        ),
        flutterwave: !!(
          process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY &&
          process.env.FLUTTERWAVE_SECRET_KEY
        ),
      },
      minFundNaira: 1000,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Config failed" },
      { status: 500 }
    );
  }
}
