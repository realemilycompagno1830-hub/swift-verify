import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServices, getCountries, calculateNairaPrice } from "@/lib/smspool";

/**
 * SMSPool-only services catalog.
 * Returns services + countries + pricing config for the OrderWidget.
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();

    const [{ data: marginRow }, { data: overridesRows }] = await Promise.all([
      supabase
        .from("site_settings")
        .select("value")
        .eq("key", "global_margin")
        .maybeSingle(),
      supabase.from("price_overrides").select("*"),
    ]);

    const globalMarkup = Number(
      marginRow?.value?.markup_percent ??
        marginRow?.value?.percent ??
        150
    );
    const usdNgnRate = Number(
      marginRow?.value?.usd_ngn_rate ?? 1600
    );

    const overrides: Record<string, number> = {};
    for (const o of overridesRows || []) {
      const provider = (o as any).provider || "smspool";
      if (provider !== "smspool") continue;
      const svc = String(o.service_name || o.service_id || "").toLowerCase();
      const ctry = String(o.country_code || "").toUpperCase();
      if (!svc || !ctry) continue;
      if (o.price_naira != null && Number(o.price_naira) > 0) {
        overrides[`${svc}-${ctry}`] = Number(o.price_naira);
      }
    }

    // Live SMSPool services
    let services: { id: string; name: string }[] = [];
    try {
      const raw = await getServices();
      const list = Array.isArray(raw) ? raw : raw?.data || raw?.services || [];
      const seen = new Set<string>();
      for (const s of list) {
        const name = String(s.name || s.service || s.title || "").trim();
        // Prefer numeric SMSPool ID — required for success_rate / purchase
        const id = String(
          s.ID ?? s.id ?? s.service_id ?? s.service ?? name
        ).trim();
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        services.push({ id, name });
      }
      services.sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      console.error("SMSPool getServices", e);
    }

    // Manual services (smspool only)
    try {
      const { data: manuals } = await supabase
        .from("sms_manual_services")
        .select("*")
        .or("provider.eq.smspool,provider.is.null");
      for (const m of manuals || []) {
        const name = String(m.name || m.service_name || "").trim();
        const id = String(m.service_id || m.id || name).trim();
        if (!name) continue;
        if (!services.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
          services.push({ id, name });
        }
      }
      services.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      /* table may not exist */
    }

    // Countries
    let countries: { id: string | number; code: string; name: string }[] = [];
    try {
      const raw = await getCountries();
      const list = Array.isArray(raw) ? raw : raw?.data || raw?.countries || [];
      for (const c of list) {
        const code = String(
          c.short_name || c.code || c.iso || c.ID || c.id || ""
        ).toUpperCase();
        const name = String(c.name || c.country || code).trim();
        const id = c.ID ?? c.id ?? code;
        if (!code && !name) continue;
        countries.push({ id, code: code || name, name: name || code });
      }
      countries.sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      console.error("SMSPool getCountries", e);
    }

    return NextResponse.json({
      provider: "smspool",
      services,
      countries,
      globalMarkup,
      usdNgnRate,
      overrides,
      totalServices: services.length,
      totalCountries: countries.length,
    });
  } catch (err: any) {
    console.error("services route", err);
    return NextResponse.json(
      { error: err.message || "Failed to load services" },
      { status: 500 }
    );
  }
}
