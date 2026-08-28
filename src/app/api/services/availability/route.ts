import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSuccessRate, calculateNairaPrice } from "@/lib/smspool";
import {
  getPricesByProductGuest,
  listPricesGuest,
  normalizeFiveSimProduct,
  calcNairaFromFiveSimUsd,
} from "@/lib/fivesim";
import {
  SMSPVA_COUNTRIES,
  normalizeSmspvaService,
  getServicePrice,
  getCount,
  calcNairaFromUsd,
} from "@/lib/smspva";

const MIN_SUCCESS = Number(process.env.MIN_SUCCESS_RATE || 50);

const PRETTY_COUNTRY: Record<string, string> = {
  usa: "United States",
  england: "United Kingdom",
  russia: "Russia",
  canada: "Canada",
  germany: "Germany",
  france: "France",
  netherlands: "Netherlands",
  nigeria: "Nigeria",
  india: "India",
  indonesia: "Indonesia",
  philippines: "Philippines",
  australia: "Australia",
  brazil: "Brazil",
  mexico: "Mexico",
  spain: "Spain",
  italy: "Italy",
  turkey: "Turkey",
  ukraine: "Ukraine",
  kenya: "Kenya",
  southafrica: "South Africa",
  poland: "Poland",
  reunion: "Reunion",
};


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

    const [
      { data: marginRow },
      { data: fivesimMarginRow },
      { data: smspvaMarginRow },
      { data: overrides },
      { data: prov },
    ] = await Promise.all([
      supabase
        .from("site_settings")
        .select("value")
        .eq("key", "global_margin")
        .maybeSingle(),
      supabase
        .from("site_settings")
        .select("value")
        .eq("key", "fivesim_margin")
        .maybeSingle(),
      supabase
        .from("site_settings")
        .select("value")
        .eq("key", "smspva_margin")
        .maybeSingle(),
      supabase.from("price_overrides").select("*").eq("is_active", true),
      supabase
        .from("site_settings")
        .select("value")
        .eq("key", "sms_provider")
        .maybeSingle(),
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
    const fivesimMarkup = Number(
      fivesimMarginRow?.value?.markup_percent ?? 100
    );
    // 5sim guest prices are in USD (same as their website $ display)
    const fivesimUsdNgn = Number(
      fivesimMarginRow?.value?.usd_ngn_rate ??
        fivesimMarginRow?.value?.rub_ngn_rate ?? // legacy key if set to ~1600
        usdNgnRate
    );

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

    if (activeProvider === "fivesim") {
      const product = normalizeFiveSimProduct(service);
      let raw: any = null;

      try {
        raw = await getPricesByProductGuest(product);
      } catch (e) {
        console.error("5sim product prices failed", e);
      }

      // Response shapes we handle:
      // A) { facebook: { usa: { virtual34: { cost, count } } } }
      // B) { usa: { virtual34: { cost, count } } }
      // C) full guest/prices filtered
      let byCountry: Record<string, any> = {};

      if (raw && typeof raw === "object") {
        if (raw[product] && typeof raw[product] === "object") {
          byCountry = raw[product];
        } else if (
          Object.values(raw).some((v: any) => {
            if (!v || typeof v !== "object") return false;
            if (v.cost != null) return true;
            const first = Object.values(v)[0] as any;
            return first != null && typeof first === "object" && first.cost != null;
          })
        ) {
          // might be country -> operators already
          const firstKey = Object.keys(raw)[0];
          const firstVal: any = raw[firstKey];
          if (firstVal?.cost != null || firstVal?.virtual34 || firstVal?.any) {
            byCountry = raw;
          } else if (raw[product]) {
            byCountry = raw[product];
          } else {
            byCountry = raw;
          }
        }
      }

      // Fallback: scan full price list
      if (Object.keys(byCountry).length === 0) {
        try {
          const all = await listPricesGuest();
          // all: { country: { product: { op: { cost, count } } } }
          for (const [country, products] of Object.entries(all || {})) {
            const p = (products as any)?.[product];
            if (p) byCountry[country] = p;
          }
        } catch (e) {
          console.error("5sim full prices fallback failed", e);
        }
      }

      const countries: any[] = [];

      for (const [country, operators] of Object.entries(byCountry)) {
        if (!operators || typeof operators !== "object") continue;

        let bestCost = Infinity;
        let bestCount = 0;

        // operators is either { cost, count } or { virtual34: { cost, count }, ... }
        if ((operators as any).cost != null) {
          bestCost = Number((operators as any).cost);
          bestCount = Number((operators as any).count || 0);
        } else {
          for (const op of Object.values(operators as any)) {
            if (!op || typeof op !== "object") continue;
            const cost = Number((op as any).cost);
            const count = Number((op as any).count || 0);
            if (Number.isNaN(cost)) continue;
            if (count <= 0) continue;
            if (cost < bestCost) {
              bestCost = cost;
              bestCount = count;
            } else if (cost === bestCost && count > bestCount) {
              bestCount = count;
            }
          }
        }

        if (!(bestCost < Infinity) || bestCount <= 0) continue;

        const code = String(country).toUpperCase();
        const name = String(country);
        const oKey = `${product}-${code}`;
        const oKey2 = `${String(service).toLowerCase()}-${code}`;
        const override = overrideMap[oKey] ?? overrideMap[oKey2];

        const priceNaira =
          override != null
            ? Number(override)
            : calcNairaFromFiveSimUsd(bestCost, fivesimUsdNgn, fivesimMarkup);

        countries.push({
          id: country,
          code,
          name:
            PRETTY_COUNTRY[String(country).toLowerCase()] ||
            name.charAt(0).toUpperCase() + name.slice(1),
          priceNaira,
          finalNaira: priceNaira,
          successRate: 100,
          stock: bestCount,
          costUsd: bestCost,
          priceUsd: bestCost,
        });
      }

      countries.sort((a, b) => a.name.localeCompare(b.name));

      return NextResponse.json({
        provider: "fivesim",
        service,
        product,
        countries,
        total: countries.length,
        pricing: {
          markupPercent: fivesimMarkup,
          usdNgnRate: fivesimUsdNgn,
          note: "5sim costs treated as USD",
        },
      });
    }


    if (activeProvider === "smspva") {
      const product = normalizeSmspvaService(service);
      const markup = Number(smspvaMarginRow?.value?.markup_percent ?? 100);
      const rate = Number(
        smspvaMarginRow?.value?.usd_ngn_rate ?? usdNgnRate
      );
      const countries: any[] = [];

      // Query price/count for each known country (limited concurrency)
      const list = SMSPVA_COUNTRIES;
      for (const c of list) {
        try {
          let costUsd = 0;
          let count = 0;
          try {
            const priceRes = await getServicePrice(c.code, product);
            const p = Number(
              priceRes?.price ?? priceRes?.data?.price ?? priceRes?.response
            );
            if (!Number.isNaN(p) && p > 0) costUsd = p;
          } catch { /* */ }
          try {
            const countRes = await getCount(c.code, product);
            // response can be number or { response: "123" }
            const n = Number(
              countRes?.online ??
                countRes?.total ??
                countRes?.count ??
                countRes?.response ??
                0
            );
            if (!Number.isNaN(n)) count = n;
          } catch { /* */ }

          // If we got a price, include even if count unknown; skip if both empty
          if (costUsd <= 0 && count <= 0) continue;
          if (costUsd <= 0) costUsd = 0.5; // fallback display so country shows

          const oKey = `${product}-${c.code}`;
          const oKey2 = `${String(service).toLowerCase()}-${c.code}`;
          const override = overrideMap[oKey] ?? overrideMap[oKey2];
          const priceNaira =
            override != null
              ? Number(override)
              : calcNairaFromUsd(costUsd, rate, markup);

          countries.push({
            id: c.code,
            code: c.code,
            name: c.name,
            priceNaira,
            finalNaira: priceNaira,
            successRate: 100,
            stock: count > 0 ? count : 1,
            priceUsd: costUsd,
          });
        } catch {
          /* skip country */
        }
      }

      countries.sort((a, b) => a.name.localeCompare(b.name));
      return NextResponse.json({
        provider: "smspva",
        service,
        product,
        countries,
        total: countries.length,
        pricing: { markupPercent: markup, usdNgnRate: rate },
      });
    }

    // ——— SMSPool only below ———
    if (!process.env.SMSPOOL_API_KEY) {
      return NextResponse.json({
        provider: "smspool",
        service,
        countries: [],
        total: 0,
      });
    }

    let rates: any[] = [];
    try {
      const res = await getSuccessRate(service);
      rates = Array.isArray(res)
        ? res
        : Array.isArray(res?.data)
        ? res.data
        : [];
    } catch (e) {
      console.error("success_rate error", e);
    }

    const countries = rates
      .map((r: any) => {
        const code = String(
          r.short_name || r.country || r.ID || ""
        ).toUpperCase();
        const name = r.name || r.country_name || code;
        const success = Number(r.success_rate ?? r.success ?? 0);
        const priceUsd = Number(r.price ?? r.cost ?? 0);
        if (!code || success < MIN_SUCCESS) return null;
        const oKey = `${String(service).toLowerCase()}-${code}`;
        const override = overrideMap[oKey];
        const priceNaira =
          override != null
            ? Number(override)
            : calculateNairaPrice(
                priceUsd,
                smspoolMarkup,
                null,
                null,
                usdNgnRate
              );
        return {
          id: r.ID || r.id || code,
          code,
          name,
          priceNaira,
          finalNaira: priceNaira,
          successRate: success,
          stock: r.stock ?? 1,
          priceUsd,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.successRate - a.successRate);

    return NextResponse.json({
      provider: "smspool",
      service,
      countries,
      total: countries.length,
      minSuccessRate: MIN_SUCCESS,
      pricing: {
        markupPercent: smspoolMarkup,
        usdNgnRate,
      },
    });
  } catch (error: any) {
    console.error("Availability error:", error);
    return NextResponse.json(
      { error: error.message || "Failed" },
      { status: 500 }
    );
  }
}
