import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServices, getCountries, calculateNairaPrice } from "@/lib/smspool";

/**
 * GET /api/services
 * Returns:
 * - Full list of services from SMSPool
 * - Full list of countries from SMSPool
 * - Admin price overrides
 * - Global margin settings
 *
 * Frontend will combine Service + Country and calculate price.
 */
export async function GET() {
  try {
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

    let smspoolServices: any[] = [];
    let smspoolCountries: any[] = [];

    if (process.env.SMSPOOL_API_KEY) {
      try {
        const [svcRes, ctryRes] = await Promise.all([
          getServices(),
          getCountries(),
        ]);

        smspoolServices = Array.isArray(svcRes)
          ? svcRes
          : Array.isArray(svcRes?.data)
          ? svcRes.data
          : [];

        smspoolCountries = Array.isArray(ctryRes)
          ? ctryRes
          : Array.isArray(ctryRes?.data)
          ? ctryRes.data
          : [];
      } catch (err) {
        console.error("SMSPool fetch failed:", err);
      }
    }

    // Clean services list
    const services: { id: string; name: string; manual?: boolean }[] =
      smspoolServices.length > 0
        ? smspoolServices
            .map((s: any) => ({
              id: String(s.ID || s.id || s.name),
              name: s.name || s.service_name || "Unknown",
            }))
            .filter((s) => s.name && s.name !== "Unknown")
            .sort((a, b) => a.name.localeCompare(b.name))
        : [
            { id: "WhatsApp", name: "WhatsApp" },
            { id: "Telegram", name: "Telegram" },
            { id: "Facebook", name: "Facebook" },
            { id: "Instagram", name: "Instagram" },
            { id: "Google", name: "Google" },
            { id: "Discord", name: "Discord" },
            { id: "TikTok", name: "TikTok" },
            { id: "OpenAI", name: "OpenAI" },
          ];

    // Clean countries list
    const countries =
      smspoolCountries.length > 0
        ? smspoolCountries
            .map((c: any) => ({
              id: c.ID || c.id,
              code: String(c.short_name || c.ID || "").toUpperCase(),
              name: c.name || c.country_name || String(c.ID),
            }))
            .filter((c) => c.code && c.name)
            .sort((a, b) => a.name.localeCompare(b.name))
        : [
            { id: 1, code: "US", name: "United States" },
            { id: 2, code: "GB", name: "United Kingdom" },
            { id: 19, code: "NG", name: "Nigeria" },
            { id: 36, code: "CA", name: "Canada" },
            { id: 3, code: "NL", name: "Netherlands" },
          ];

    // Format overrides for easy lookup
    const overrideMap: Record<string, number> = {};
    (overrides || []).forEach((o: any) => {
      const key = `${(o.service_name || "").toLowerCase()}-${(
        o.country_code || ""
      ).toUpperCase()}`;
      if (o.override_price_naira) {
        overrideMap[key] = Number(o.override_price_naira);
      }
    });

    
    // Active provider + manual services
    let activeProvider = "smspool";
    try {
      const { data: prov } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "sms_provider")
        .maybeSingle();
      if (prov?.value?.active === "fivesim") activeProvider = "fivesim";
    } catch {}

    try {
      const { data: manuals } = await supabase
        .from("sms_manual_services")
        .select("*")
        .eq("is_active", true)
        .eq("provider", activeProvider);
      for (const m of manuals || []) {
        if (!services.find((s: any) => String(s.id) === String(m.service_id) || s.name === m.service_name)) {
          services.push({ id: String(m.service_id), name: m.service_name, manual: true });
        }
      }
      services.sort((a: any, b: any) => a.name.localeCompare(b.name));
    } catch {}

    return NextResponse.json({
      provider: activeProvider,
      services,
      countries,
      overrides: overrideMap,
      globalMarkup,
      usdNgnRate,
      liveFromSmsPool: smspoolServices.length > 0,
      totalServices: services.length,
      totalCountries: countries.length,
    });
  } catch (error: any) {
    console.error("Services API error:", error);
    return NextResponse.json(
      { error: "Failed to load services", details: error.message },
      { status: 500 }
    );
  }
}
