import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServices, getCountries } from "@/lib/smspool";
import {
  listPricesGuest,
  flattenFiveSimPrices,
} from "@/lib/fivesim";
import { SMSPVA_SERVICES, SMSPVA_COUNTRIES } from "@/lib/smspva";

/**
 * GET /api/services
 * Returns services/countries for the ACTIVE SMS provider (smspool | fivesim)
 * plus margins and overrides for that provider.
 */
export async function GET() {
  try {
    const supabase = await createClient();

    const [
      { data: marginRow },
      { data: fivesimMarginRow },
      { data: smspvaMarginRow },
      { data: overrides },
      { data: prov },
    ] = await Promise.all([
      supabase.from("site_settings").select("value").eq("key", "global_margin").maybeSingle(),
      supabase.from("site_settings").select("value").eq("key", "fivesim_margin").maybeSingle(),
      supabase.from("site_settings").select("value").eq("key", "smspva_margin").maybeSingle(),
      supabase.from("price_overrides").select("*").eq("is_active", true),
      supabase.from("site_settings").select("value").eq("key", "sms_provider").maybeSingle(),
    ]);

    const rawActive = prov?.value?.active;
    const activeProvider =
      rawActive === "fivesim"
        ? "fivesim"
        : rawActive === "smspva"
        ? "smspva"
        : "smspool";

    const smspoolMarkup = Number(marginRow?.value?.markup_percent ?? 150);
    const usdNgnRate = Number(process.env.FALLBACK_USD_NGN_RATE) || 1600;

    const fivesimMarkup = Number(fivesimMarginRow?.value?.markup_percent ?? 100);
    // 5sim prices are USD on their site; use usd_ngn_rate (fallback: env rate, not 18)
    const rubNgnRate = Number(
      fivesimMarginRow?.value?.usd_ngn_rate ??
      (fivesimMarginRow?.value?.rub_ngn_rate && Number(fivesimMarginRow.value.rub_ngn_rate) > 100
        ? fivesimMarginRow.value.rub_ngn_rate
        : null) ??
      process.env.FALLBACK_USD_NGN_RATE ??
      1600
    );

    // Overrides for active provider (provider column optional — treat null as smspool)
    const overrideMap: Record<string, number> = {};
    (overrides || []).forEach((o: any) => {
      const oProv = o.provider || "smspool";
      if (oProv !== activeProvider) return;
      const key = `${(o.service_name || "").toLowerCase()}-${(
        o.country_code || ""
      ).toUpperCase()}`;
      if (o.override_price_naira) {
        overrideMap[key] = Number(o.override_price_naira);
      }
    });

    let services: { id: string; name: string; manual?: boolean }[] = [];
    let countries: { id: string | number; code: string; name: string }[] = [];
    let priceMap: Record<string, { cost: number; count: number }> = {};
    let live = false;

    if (activeProvider === "fivesim") {
      try {
        const prices = await listPricesGuest();
        const flat = flattenFiveSimPrices(prices);
        services = flat.services;
        countries = flat.countries;
        priceMap = flat.priceMap;
        live = services.length > 0;
      } catch (err) {
        console.error("5sim prices failed:", err);
      }
    } else if (activeProvider === "smspva") {
      services = SMSPVA_SERVICES.map((s) => ({ id: s.id, name: s.name }));
      countries = SMSPVA_COUNTRIES.map((c) => ({
        id: c.code,
        code: c.code,
        name: c.name,
      }));
      live = services.length > 0;
    } else if (process.env.SMSPOOL_API_KEY) {
      try {
        const [svcRes, ctryRes] = await Promise.all([
          getServices(),
          getCountries(),
        ]);
        const smspoolServices = Array.isArray(svcRes)
          ? svcRes
          : Array.isArray(svcRes?.data)
          ? svcRes.data
          : [];
        const smspoolCountries = Array.isArray(ctryRes)
          ? ctryRes
          : Array.isArray(ctryRes?.data)
          ? ctryRes.data
          : [];

        services = smspoolServices
          .map((s: any) => ({
            id: String(s.ID || s.id || s.name),
            name: String(s.name || s.service_name || "Unknown"),
          }))
          .filter((s: { id: string; name: string }) => s.name && s.name !== "Unknown")
          .sort((a: { name: string }, b: { name: string }) =>
            a.name.localeCompare(b.name)
          );

        countries = smspoolCountries
          .map((c: any) => ({
            id: c.ID || c.id,
            code: String(c.short_name || c.ID || "").toUpperCase(),
            name: String(c.name || c.country_name || String(c.ID)),
          }))
          .filter(
            (c: { id: any; code: string; name: string }) => c.code && c.name
          )
          .sort((a: { name: string }, b: { name: string }) =>
            a.name.localeCompare(b.name)
          );

        live = services.length > 0;
      } catch (err) {
        console.error("SMSPool fetch failed:", err);
      }
    }

    // Manual services for active provider
    try {
      const { data: manuals } = await supabase
        .from("sms_manual_services")
        .select("*")
        .eq("is_active", true)
        .eq("provider", activeProvider);
      for (const m of manuals || []) {
        if (
          !services.find(
            (s) =>
              String(s.id) === String(m.service_id) ||
              s.name === m.service_name
          )
        ) {
          services.push({
            id: String(m.service_id),
            name: m.service_name,
            manual: true,
          });
        }
      }
      services.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      /* table may not exist yet */
    }

    if (services.length === 0) {
      services = [
        { id: "whatsapp", name: "WhatsApp" },
        { id: "telegram", name: "Telegram" },
        { id: "facebook", name: "Facebook" },
        { id: "instagram", name: "Instagram" },
        { id: "google", name: "Google" },
        { id: "discord", name: "Discord" },
        { id: "tiktok", name: "TikTok" },
      ];
    }

    return NextResponse.json({
      provider: activeProvider,
      services,
      countries,
      priceMap,
      overrides: overrideMap,
      globalMarkup:
        activeProvider === "fivesim"
          ? fivesimMarkup
          : activeProvider === "smspva"
          ? Number(smspvaMarginRow?.value?.markup_percent ?? 100)
          : smspoolMarkup,
      smspvaMarkup: Number(smspvaMarginRow?.value?.markup_percent ?? 100),
      usdNgnRate,
      rubNgnRate,
      fivesimMarkup,
      smspoolMarkup,
      liveFromProvider: live,
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
