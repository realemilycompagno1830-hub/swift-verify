import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServices, getCountries, calculateNairaPrice } from "@/lib/smspool";

/**
 * GET /api/services
 * Loads real services & countries from SMSPool, then applies:
 * - Global profit margin
 * - Admin price overrides (these take priority)
 */
export async function GET() {
  try {
    const supabase = await createClient();

    // 1. Load admin settings
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

    // 2. Fetch live data from SMSPool
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
        console.error("SMSPool live fetch failed:", err);
      }
    }

    // 3. Build country list
    const countries =
      smspoolCountries.length > 0
        ? smspoolCountries.map((c: any) => ({
            code: String(c.short_name || c.ID || c.id || "").toUpperCase(),
            name: c.name || c.country_name || String(c.ID),
            id: c.ID || c.id,
          }))
        : [
            { code: "US", name: "United States", id: 1 },
            { code: "GB", name: "United Kingdom", id: 2 },
            { code: "NG", name: "Nigeria", id: 19 },
            { code: "CA", name: "Canada", id: 36 },
            { code: "NL", name: "Netherlands", id: 3 },
          ];

    // 4. Build service list
    // Priority 1: Admin price overrides
    const priced: any[] = (overrides || []).map((o: any) => {
      const price = Number(o.override_price_naira) || 0;
      return {
        serviceId: o.service_id || o.service_name,
        serviceName: o.service_name,
        countryCode: o.country_code,
        countryName: o.country_name || o.country_code,
        baseUsd: 0,
        finalNaira: price,
        label: `${o.service_name} (${o.country_code}) - ₦${price.toLocaleString()}`,
        source: "override",
      };
    });

    // Priority 2: Add popular services from SMSPool
    const popularNames = [
      "WhatsApp",
      "Telegram",
      "Google",
      "Facebook",
      "Instagram",
      "Twitter",
      "Discord",
      "TikTok",
      "OpenAI",
      "Microsoft",
      "Amazon",
      "Apple",
      "Uber",
      "Netflix",
      "PayPal",
      "Binance",
      "Coinbase",
      "Signal",
      "Viber",
      "WeChat",
    ];

    if (smspoolServices.length > 0) {
      const existingKeys = new Set(
        priced.map((p) => `${p.serviceName.toLowerCase()}-${p.countryCode}`)
      );

      const majorCountries = ["US", "GB", "CA", "NL", "DE", "FR"];

      for (const svc of smspoolServices) {
        const name = svc.name || svc.service_name || "";
        if (!name) continue;

        const isPopular = popularNames.some(
          (p) => name.toLowerCase() === p.toLowerCase()
        );
        if (!isPopular) continue;

        for (const cc of majorCountries) {
          const key = `${name.toLowerCase()}-${cc}`;
          if (existingKeys.has(key)) continue;

          const estimatedUsd =
            name.toLowerCase().includes("whatsapp")
              ? 0.35
              : name.toLowerCase().includes("telegram")
              ? 0.08
              : name.toLowerCase().includes("google")
              ? 0.2
              : 0.15;

          const finalNaira = calculateNairaPrice(
            estimatedUsd,
            globalMarkup,
            null,
            null,
            usdNgnRate
          );

          priced.push({
            serviceId: String(svc.ID || svc.id || name),
            serviceName: name,
            countryCode: cc,
            countryName:
              countries.find((c) => c.code === cc)?.name || cc,
            baseUsd: estimatedUsd,
            finalNaira,
            label: `${name} (${cc}) - ₦${finalNaira.toLocaleString()}`,
            source: "smspool",
          });

          existingKeys.add(key);
        }
      }
    }

    // Final fallback
    if (priced.length === 0) {
      priced.push(
        {
          serviceId: "WhatsApp",
          serviceName: "WhatsApp",
          countryCode: "US",
          countryName: "United States",
          baseUsd: 0.35,
          finalNaira: calculateNairaPrice(0.35, globalMarkup, null, null, usdNgnRate),
          label: `WhatsApp (US) - ₦${calculateNairaPrice(0.35, globalMarkup, null, null, usdNgnRate)}`,
          source: "fallback",
        },
        {
          serviceId: "Telegram",
          serviceName: "Telegram",
          countryCode: "GB",
          countryName: "United Kingdom",
          baseUsd: 0.08,
          finalNaira: calculateNairaPrice(0.08, globalMarkup, null, null, usdNgnRate),
          label: `Telegram (GB) - ₦${calculateNairaPrice(0.08, globalMarkup, null, null, usdNgnRate)}`,
          source: "fallback",
        }
      );
    }

    // Sort: overrides first
    priced.sort((a, b) => {
      if (a.source === "override" && b.source !== "override") return -1;
      if (b.source === "override" && a.source !== "override") return 1;
      return a.label.localeCompare(b.label);
    });

    return NextResponse.json({
      services: priced,
      countries,
      globalMarkup,
      usdNgnRate,
      liveFromSmsPool: smspoolServices.length > 0,
      totalSmsPoolServices: smspoolServices.length,
    });
  } catch (error: any) {
    console.error("Services API error:", error);
    return NextResponse.json(
      { error: "Failed to load services", details: error.message },
      { status: 500 }
    );
  }
}
