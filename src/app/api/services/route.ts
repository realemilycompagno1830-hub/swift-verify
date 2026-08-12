import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServices, getCountries, calculateNairaPrice } from "@/lib/smspool";

/**
 * GET /api/services
 * Returns priced service list for the Order Widget.
 * Applies global margin + any price_overrides from Supabase.
 *
 * In production you should cache this (Redis / Vercel KV / Supabase) for 1-5 min
 * because SMSPool has rate limits and the list is large (1200+ services).
 */
export async function GET() {
  try {
    const supabase = await createClient();

    // 1. Load settings & overrides
    const [{ data: marginRow }, { data: overrides }] = await Promise.all([
      supabase.from("site_settings").select("value").eq("key", "global_margin").single(),
      supabase.from("price_overrides").select("*").eq("is_active", true),
    ]);

    const globalMarkup = marginRow?.value?.markup_percent ?? 150;
    const usdNgnRate = Number(process.env.FALLBACK_USD_NGN_RATE) || 1600;

    // 2. Fetch live from SMSPool (or return mock when key missing)
    let services: any[] = [];
    let countries: any[] = [];

    if (process.env.SMSPOOL_API_KEY) {
      try {
        [services, countries] = await Promise.all([
          getServices(),
          getCountries(),
        ]);
      } catch (err) {
        console.error("SMSPool fetch failed, falling back to demo data", err);
      }
    }

    // 3. Build priced list (demo data when live data unavailable)
    // Real implementation would map SMSPool prices properly.
    // For now we surface the overrides + a few popular ones so the UI works.

    const priced = (overrides || []).map((o: any) => ({
      serviceId: o.service_id || o.service_name,
      serviceName: o.service_name,
      countryCode: o.country_code,
      countryName: o.country_name || o.country_code,
      baseUsd: 0.2, // placeholder – replace with real price from SMSPool pricing endpoint
      finalNaira: o.override_price_naira
        ? Number(o.override_price_naira)
        : calculateNairaPrice(0.2, globalMarkup, null, o.custom_margin_percent, usdNgnRate),
      label: `${o.service_name} (${o.country_code}) - ₦${Math.ceil(
        o.override_price_naira || calculateNairaPrice(0.2, globalMarkup, null, null, usdNgnRate)
      )}`,
    }));

    // Ensure at least the screenshot examples appear
    if (priced.length === 0) {
      priced.push(
        {
          serviceId: "WhatsApp",
          serviceName: "WhatsApp",
          countryCode: "US",
          countryName: "United States",
          baseUsd: 0.25,
          finalNaira: 800,
          label: "WhatsApp (US) - ₦800",
        },
        {
          serviceId: "WhatsApp",
          serviceName: "WhatsApp",
          countryCode: "GB",
          countryName: "United Kingdom",
          baseUsd: 0.2,
          finalNaira: 600,
          label: "WhatsApp (GB) - ₦600",
        },
        {
          serviceId: "Telegram",
          serviceName: "Telegram",
          countryCode: "GB",
          countryName: "United Kingdom",
          baseUsd: 0.2,
          finalNaira: 600,
          label: "Telegram (GB) - ₦600",
        },
        {
          serviceId: "OpenAI",
          serviceName: "OpenAI",
          countryCode: "US",
          countryName: "United States",
          baseUsd: 0.3,
          finalNaira: 950,
          label: "OpenAI (US) - ₦950",
        }
      );
    }

    return NextResponse.json({
      services: priced,
      countries: countries.length
        ? countries.map((c: any) => ({
            code: c.short_name || c.ID,
            name: c.name,
            id: c.ID,
          }))
        : [
            { code: "US", name: "USA", id: 1 },
            { code: "GB", name: "UK", id: 2 },
            { code: "NG", name: "Nigeria", id: 19 },
          ],
      globalMarkup,
      usdNgnRate,
    });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to load services", details: error.message },
      { status: 500 }
    );
  }
}
