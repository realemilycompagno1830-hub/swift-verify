import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSuccessRate, calculateNairaPrice } from "@/lib/smspool";

/**
 * GET /api/services/availability?service=WhatsApp
 * or ?serviceId=123
 *
 * Returns countries that SMSPool currently lists for this service
 * (with price + success_rate). Used to hide out-of-stock combinations.
 */
export async function GET(req: NextRequest) {
  try {
    const service =
      req.nextUrl.searchParams.get("service") ||
      req.nextUrl.searchParams.get("serviceId");

    if (!service) {
      return NextResponse.json(
        { error: "Missing service parameter" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const [{ data: marginRow }, { data: overrides }] = await Promise.all([
      supabase
        .from("site_settings")
        .select("value")
        .eq("key", "global_margin")
        .single(),
      supabase
        .from("price_overrides")
        .select("*")
        .eq("is_active", true),
    ]);

    const globalMarkup = Number(marginRow?.value?.markup_percent ?? 150);
    const usdNgnRate = Number(process.env.FALLBACK_USD_NGN_RATE) || 1600;

    if (!process.env.SMSPOOL_API_KEY) {
      return NextResponse.json({
        countries: [],
        available: false,
        message: "SMSPool not configured",
      });
    }

    let raw: any = null;
    try {
      raw = await getSuccessRate(service);
    } catch (err: any) {
      console.error("success_rate failed", err);
      return NextResponse.json({
        countries: [],
        available: false,
        message: "Could not check stock right now. Try again.",
      });
    }

    const list: any[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.data)
      ? raw.data
      : [];

    const overrideMap: Record<string, number> = {};
    (overrides || []).forEach((o: any) => {
      const key = `${(o.service_name || "").toLowerCase()}-${(
        o.country_code || ""
      ).toUpperCase()}`;
      if (o.override_price_naira) {
        overrideMap[key] = Number(o.override_price_naira);
      }
    });

    const serviceNameLower = String(service).toLowerCase();

    const countries = list
      .map((row: any) => {
        const code = String(
          row.short_name || row.code || ""
        ).toUpperCase();
        const name = row.name || row.country_name || code;
        const countryId = row.country_id || row.country || row.ID || row.id;
        const priceUsd = Number(row.price || row.low_price || 0);
        const successRate = Number(row.success_rate || 0);

        if (!code && !name) return null;

        const overrideKey = `${serviceNameLower}-${code}`;
        const finalNaira =
          overrideMap[overrideKey] ||
          (priceUsd > 0
            ? calculateNairaPrice(priceUsd, globalMarkup, null, null, usdNgnRate)
            : 0);

        return {
          id: countryId,
          code: code || String(countryId),
          name,
          priceUsd,
          successRate,
          finalNaira,
          // Treat very low success as weak stock signal but still show
          inStock: true,
        };
      })
      .filter(Boolean)
      // Prefer higher success rate, then lower price
      .sort((a: any, b: any) => {
        if (b.successRate !== a.successRate) return b.successRate - a.successRate;
        return a.finalNaira - b.finalNaira;
      });

    return NextResponse.json({
      service,
      countries,
      available: countries.length > 0,
      total: countries.length,
      message:
        countries.length === 0
          ? "No numbers available for this service right now. Try another service."
          : undefined,
    });
  } catch (error: any) {
    console.error("Availability API error", error);
    return NextResponse.json(
      { error: error.message || "Failed to check availability" },
      { status: 500 }
    );
  }
}
