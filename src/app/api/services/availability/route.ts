import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getSuccessRate,
  getCountries,
  calculateNairaPrice,
} from "@/lib/smspool";

/**
 * SMSPool-only availability for a selected service.
 * Prefer numeric service ID (from SMSPool), fall back to name.
 */
export async function GET(req: NextRequest) {
  try {
    const serviceParam = (req.nextUrl.searchParams.get("service") || "").trim();
    const serviceIdParam = (req.nextUrl.searchParams.get("serviceId") || "").trim();
    const serviceNameParam = (req.nextUrl.searchParams.get("serviceName") || "").trim();

    // What the client selected
    const serviceName = serviceNameParam || serviceParam;
    const serviceId = serviceIdParam || serviceParam;

    if (!serviceName && !serviceId) {
      return NextResponse.json({ error: "service required" }, { status: 400 });
    }

    // Default: show anything with success > 0 (was 50 — too strict)
    const minSuccess = Number(
      req.nextUrl.searchParams.get("minSuccess") ?? 1
    );

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
      marginRow?.value?.markup_percent ?? marginRow?.value?.percent ?? 150
    );
    const usdNgnRate = Number(marginRow?.value?.usd_ngn_rate ?? 1600);

    const overrideFor = (svc: string, country: string) => {
      const keySvc = svc.toLowerCase();
      const keyC = country.toUpperCase();
      for (const o of overridesRows || []) {
        const oProv = (o as any).provider || "smspool";
        if (oProv !== "smspool") continue;
        const s = String(o.service_name || o.service_id || "").toLowerCase();
        const c = String(o.country_code || "").toUpperCase();
        if (
          (s === keySvc || s === String(serviceId).toLowerCase()) &&
          c === keyC &&
          o.price_naira != null
        ) {
          return Number(o.price_naira);
        }
      }
      return null;
    };

    // Try success_rate with ID first, then name
    const tryKeys: (string | number)[] = [];
    if (serviceId && /^\d+$/.test(String(serviceId))) {
      tryKeys.push(Number(serviceId));
    }
    if (serviceId && !tryKeys.includes(serviceId as any)) {
      tryKeys.push(serviceId);
    }
    // Short name variants help e.g. "Facebook / Meta Viewpoints" → "Facebook"
    if (serviceName) {
      tryKeys.push(serviceName);
      const short = serviceName.split(/[\/|\-–—]/)[0].trim();
      if (short && short.toLowerCase() !== serviceName.toLowerCase()) {
        tryKeys.push(short);
      }
    }

    let list: any[] = [];
    let usedKey: string | number | null = null;

    for (const key of tryKeys) {
      try {
        const rates = await getSuccessRate(key);
        const batch = Array.isArray(rates)
          ? rates
          : rates?.data || rates?.countries || [];
        if (Array.isArray(batch) && batch.length > 0) {
          list = batch;
          usedKey = key;
          break;
        }
      } catch (e) {
        console.error("SMSPool success_rate try", key, e);
      }
    }

    const countries: any[] = [];

    for (const row of list) {
      const successRate = Number(
        row.success_rate ?? row.success ?? row.rate ?? 0
      );
      // Keep countries at or above minSuccess (default 1 = any positive)
      if (successRate < minSuccess) continue;

      const code = String(
        row.short_name || row.code || row.country_code || ""
      ).toUpperCase();
      const name = String(row.name || row.country_name || code).trim();
      const priceUsd = Number(
        row.price ?? row.high_price ?? row.low_price ?? 0
      );
      if (!code && !name) continue;

      const countryCode = code || name;
      const override =
        overrideFor(serviceName || String(serviceId), countryCode) ??
        overrideFor(String(usedKey || ""), countryCode);

      const priceNaira =
        override != null
          ? override
          : calculateNairaPrice(
              priceUsd > 0 ? priceUsd : 0.15,
              globalMarkup,
              null,
              null,
              usdNgnRate
            );

      countries.push({
        id: row.country ?? row.country_id ?? countryCode,
        code: countryCode,
        name: name || countryCode,
        priceNaira,
        finalNaira: priceNaira,
        successRate,
        stock: successRate > 0 ? 1 : 0,
        priceUsd: priceUsd || null,
        _provider: "smspool",
      });
    }

    // Fallback: if SMSPool returned nothing, still list main countries
    // so the UI is not completely blocked (buy may still work / refund)
    if (countries.length === 0) {
      try {
        const raw = await getCountries();
        const all = Array.isArray(raw) ? raw : raw?.data || [];
        const popular = ["US", "GB", "CA", "NG", "DE", "FR", "NL", "IN", "PH", "AU"];
        for (const c of all) {
          const code = String(
            c.short_name || c.code || c.iso || ""
          ).toUpperCase();
          const name = String(c.name || c.country || code).trim();
          if (!code) continue;
          // Prefer popular ones first in fallback
          const override = overrideFor(
            serviceName || String(serviceId),
            code
          );
          const priceNaira =
            override != null
              ? override
              : calculateNairaPrice(0.2, globalMarkup, null, null, usdNgnRate);

          countries.push({
            id: c.ID ?? c.id ?? code,
            code,
            name: name || code,
            priceNaira,
            finalNaira: priceNaira,
            successRate: popular.includes(code) ? 50 : 10,
            stock: 1,
            priceUsd: null,
            _provider: "smspool",
            _fallback: true,
          });
        }
      } catch (e) {
        console.error("fallback countries", e);
      }
    }

    countries.sort((a, b) => {
      if (b.successRate !== a.successRate) return b.successRate - a.successRate;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      provider: "smspool",
      service: serviceName || serviceId,
      serviceKeyUsed: usedKey,
      countries,
      total: countries.length,
      pricing: {
        markupPercent: globalMarkup,
        usdNgnRate,
      },
    });
  } catch (err: any) {
    console.error("availability", err);
    return NextResponse.json(
      { error: err.message || "Availability check failed" },
      { status: 500 }
    );
  }
}
