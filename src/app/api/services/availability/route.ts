import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSuccessRate, calculateNairaPrice } from "@/lib/smspool";
import {
  getPricesByProductGuest,
  listPricesGuest,
  flattenFiveSimPrices,
  normalizeFiveSimProduct,
  calcNairaFromFiveSimRub,
} from "@/lib/fivesim";

const MIN_SUCCESS = Number(process.env.MIN_SUCCESS_RATE || 50);

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
      { data: overrides },
      { data: prov },
    ] = await Promise.all([
      supabase.from("site_settings").select("value").eq("key", "global_margin").maybeSingle(),
      supabase.from("site_settings").select("value").eq("key", "fivesim_margin").maybeSingle(),
      supabase.from("price_overrides").select("*").eq("is_active", true),
      supabase.from("site_settings").select("value").eq("key", "sms_provider").maybeSingle(),
    ]);

    const activeProvider =
      prov?.value?.active === "fivesim" ? "fivesim" : "smspool";

    const smspoolMarkup = Number(marginRow?.value?.markup_percent ?? 150);
    const usdNgnRate = Number(process.env.FALLBACK_USD_NGN_RATE) || 1600;
    const fivesimMarkup = Number(fivesimMarginRow?.value?.markup_percent ?? 100);
    const rubNgnRate = Number(fivesimMarginRow?.value?.rub_ngn_rate ?? 18);

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
      let prices: any = null;
      try {
        prices = await getPricesByProductGuest(product);
      } catch {
        try {
          const all = await listPricesGuest();
          prices = {};
          for (const [country, products] of Object.entries(all || {})) {
            if ((products as any)?.[product]) {
              prices[country] = { [product]: (products as any)[product] };
            }
          }
        } catch (e) {
          console.error(e);
        }
      }

      // prices by product endpoint may return { usa: { any: { cost, count } } } or nested
      const countries: any[] = [];
      if (prices && typeof prices === "object") {
        for (const [country, val] of Object.entries(prices)) {
          let cost = NaN;
          let count = 0;
          const v = val as any;
          // shapes: { any: { cost, count } } or { product: { any: {...} } } or { cost, count }
          const ops =
            v?.[product] && typeof v[product] === "object"
              ? v[product]
              : v;
          if (ops && typeof ops === "object") {
            if (ops.cost != null) {
              cost = Number(ops.cost);
              count = Number(ops.count || 0);
            } else {
              for (const op of Object.values(ops)) {
                const c = Number((op as any)?.cost ?? NaN);
                const n = Number((op as any)?.count ?? 0);
                if (!Number.isNaN(c) && (Number.isNaN(cost) || c < cost)) {
                  cost = c;
                }
                if (n > count) count = n;
              }
            }
          }
          if (Number.isNaN(cost) || count <= 0) continue;

          const code = String(country).toUpperCase();
          const name = String(country);
          const oKey = `${product}-${code}`;
          const override = overrideMap[oKey] ?? overrideMap[`${service.toLowerCase()}-${code}`];
          const priceNaira =
            override != null
              ? Number(override)
              : calcNairaFromFiveSimRub(cost, rubNgnRate, fivesimMarkup);

          countries.push({
            id: country,
            code,
            name: name.charAt(0).toUpperCase() + name.slice(1),
            priceNaira,
            successRate: 100,
            stock: count,
            costRub: cost,
          });
        }
      }

      countries.sort((a, b) => a.name.localeCompare(b.name));

      return NextResponse.json({
        provider: "fivesim",
        service,
        product,
        countries,
        total: countries.length,
      });
    }

    // SMSPool path
    if (!process.env.SMSPOOL_API_KEY) {
      return NextResponse.json({ provider: "smspool", service, countries: [], total: 0 });
    }

    let rates: any[] = [];
    try {
      const res = await getSuccessRate(service);
      rates = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
    } catch (e) {
      console.error("success_rate error", e);
    }

    const countries = rates
      .map((r: any) => {
        const code = String(r.short_name || r.country || r.ID || "").toUpperCase();
        const name = r.name || r.country_name || code;
        const success = Number(r.success_rate ?? r.success ?? 0);
        const priceUsd = Number(r.price ?? r.cost ?? 0);
        if (!code || success < MIN_SUCCESS) return null;
        const oKey = `${String(service).toLowerCase()}-${code}`;
        const override = overrideMap[oKey];
        const priceNaira =
          override != null
            ? Number(override)
            : calculateNairaPrice(priceUsd, smspoolMarkup, null, null, usdNgnRate);
        return {
          id: r.ID || r.id || code,
          code,
          name,
          priceNaira,
          successRate: success,
          stock: r.stock ?? 1,
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
    });
  } catch (error: any) {
    console.error("Availability error:", error);
    return NextResponse.json(
      { error: error.message || "Failed" },
      { status: 500 }
    );
  }
}
