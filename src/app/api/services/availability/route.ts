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
  getServicePriceUsd,
  getCountryServicePrices,
  getCount,
  calcNairaFromUsd,
} from "@/lib/smspva";

const MIN_SUCCESS = Number(process.env.MIN_SUCCESS_RATE || 50);

const PRETTY_COUNTRY: Record<string, string> = {
  usa: "United States",
  us: "United States",
  england: "United Kingdom",
  uk: "United Kingdom",
  gb: "United Kingdom",
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
};

function prettyName(code: string, fallback?: string) {
  const k = String(code || "").toLowerCase();
  return (
    PRETTY_COUNTRY[k] ||
    fallback ||
    code.charAt(0).toUpperCase() + code.slice(1).toLowerCase()
  );
}

export async function GET(req: NextRequest) {
  try {
    const service =
      req.nextUrl.searchParams.get("service") ||
      req.nextUrl.searchParams.get("serviceId");
    // Customer-facing mode: voip (virtual) | real — never expose supplier names
    const modeParam = (
      req.nextUrl.searchParams.get("mode") || "voip"
    ).toLowerCase();
    const mode = modeParam === "real" ? "real" : "voip";

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
    ]);

    const smspoolMarkup = Number(marginRow?.value?.markup_percent ?? 150);
    const usdNgnRate = Number(process.env.FALLBACK_USD_NGN_RATE) || 1600;
    const fivesimMarkup = Number(
      fivesimMarginRow?.value?.markup_percent ?? 100
    );
    const fivesimUsdNgn = Number(
      fivesimMarginRow?.value?.usd_ngn_rate ??
        (fivesimMarginRow?.value?.rub_ngn_rate &&
        Number(fivesimMarginRow.value.rub_ngn_rate) > 100
          ? fivesimMarginRow.value.rub_ngn_rate
          : null) ??
        usdNgnRate
    );
    const smspvaMarkup = Number(smspvaMarginRow?.value?.markup_percent ?? 100);
    const smspvaUsdNgn = Number(
      smspvaMarginRow?.value?.usd_ngn_rate ?? usdNgnRate
    );

    const overrideFor = (provider: string, serviceName: string, code: string) => {
      for (const o of overrides || []) {
        const oProv = o.provider || "smspool";
        if (oProv !== provider) continue;
        const key = `${(o.service_name || "").toLowerCase()}-${(
          o.country_code || ""
        ).toUpperCase()}`;
        const k2 = `${serviceName.toLowerCase()}-${code.toUpperCase()}`;
        if (
          o.override_price_naira &&
          (key === k2 ||
            key === `${serviceName.toLowerCase()}-${code.toUpperCase()}`)
        ) {
          return Number(o.override_price_naira);
        }
      }
      return null;
    };

    // ——— REAL NUMBERS = SMSPVA only (never say SMSPVA to client) ———
    if (mode === "real") {
      const product = normalizeSmspvaService(service).toLowerCase();
      const countries: any[] = [];

      // Parallel batch (limit concurrency) — min operator price per country
      const batchSize = 8;
      for (let i = 0; i < SMSPVA_COUNTRIES.length; i += batchSize) {
        const batch = SMSPVA_COUNTRIES.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (c) => {
            try {
              const priceMap = await getCountryServicePrices(c.code);
              const hit = priceMap.get(product);
              let costUsd = hit?.minUsd || 0;
              if (costUsd <= 0) {
                costUsd = await getServicePriceUsd(c.code, product);
              }
              if (costUsd <= 0) return null;

              let count = 1;
              try {
                const countRes = await getCount(c.code, product);
                const n = Number(
                  countRes?.online ?? countRes?.total ?? countRes?.count ?? 0
                );
                if (!Number.isNaN(n) && n > 0) count = n;
                else if (countRes?.response != null) {
                  const r = Number(countRes.response);
                  if (!Number.isNaN(r) && r > 1 && r < 1_000_000) count = r;
                }
              } catch {
                /* keep 1 */
              }

              const override =
                overrideFor("smspva", product, c.code) ??
                overrideFor("smspva", service, c.code);
              const priceNaira =
                override != null
                  ? Number(override)
                  : calcNairaFromUsd(costUsd, smspvaUsdNgn, smspvaMarkup);

              return {
                id: c.code,
                code: c.code,
                name: c.name,
                priceNaira,
                finalNaira: priceNaira,
                successRate: 100,
                stock: count,
                priceUsd: costUsd,
                _provider: "smspva",
              };
            } catch {
              return null;
            }
          })
        );
        for (const row of results) {
          if (row) countries.push(row);
        }
      }

      countries.sort((a, b) => a.name.localeCompare(b.name));
      return NextResponse.json({
        mode: "real",
        service,
        product,
        countries,
        total: countries.length,
        pricing: {
          markupPercent: smspvaMarkup,
          usdNgnRate: smspvaUsdNgn,
          note: "Uses cheapest operator price (same as SMSPVA 'from $X')",
        },
      });
    }

    // ——— VOIP / VIRTUAL = SMSPool + 5sim, pick better per country ———
    type Cand = {
      id: string | number;
      code: string;
      name: string;
      priceNaira: number;
      finalNaira: number;
      successRate: number;
      stock: number;
      priceUsd?: number;
      _provider: "smspool" | "fivesim";
    };

    const byCode = new Map<string, Cand>();

    // SMSPool
    if (process.env.SMSPOOL_API_KEY) {
      try {
        const res = await getSuccessRate(service);
        const rates = Array.isArray(res)
          ? res
          : Array.isArray(res?.data)
          ? res.data
          : [];
        for (const r of rates) {
          const code = String(
            r.short_name || r.country || r.ID || ""
          ).toUpperCase();
          const name = r.name || r.country_name || prettyName(code);
          const success = Number(r.success_rate ?? r.success ?? 0);
          const priceUsd = Number(r.price ?? r.cost ?? 0);
          if (!code || success < MIN_SUCCESS) continue;
          const override =
            overrideFor("smspool", service, code) ??
            overrideFor("smspool", String(service).toLowerCase(), code);
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
          const cand: Cand = {
            id: r.ID || r.id || code,
            code,
            name,
            priceNaira,
            finalNaira: priceNaira,
            successRate: success,
            stock: Number(r.stock ?? 1),
            priceUsd,
            _provider: "smspool",
          };
          const prev = byCode.get(code);
          if (
            !prev ||
            cand.successRate > prev.successRate ||
            (cand.successRate === prev.successRate && cand.stock > prev.stock)
          ) {
            byCode.set(code, cand);
          }
        }
      } catch (e) {
        console.error("voip smspool availability", e);
      }
    }

    // 5sim
    try {
      const product = normalizeFiveSimProduct(service);
      let raw: any = null;
      try {
        raw = await getPricesByProductGuest(product);
      } catch {
        /* */
      }
      let byCountry: Record<string, any> = {};
      if (raw && typeof raw === "object") {
        if (raw[product] && typeof raw[product] === "object") {
          byCountry = raw[product];
        } else {
          byCountry = raw;
        }
      }
      if (Object.keys(byCountry).length === 0) {
        try {
          const all = await listPricesGuest();
          for (const [country, products] of Object.entries(all || {})) {
            const p = (products as any)?.[product];
            if (p) byCountry[country] = p;
          }
        } catch {
          /* */
        }
      }

      for (const [country, operators] of Object.entries(byCountry)) {
        if (!operators || typeof operators !== "object") continue;
        let bestCost = Infinity;
        let bestCount = 0;
        if ((operators as any).cost != null) {
          bestCost = Number((operators as any).cost);
          bestCount = Number((operators as any).count || 0);
        } else {
          for (const op of Object.values(operators as any)) {
            if (!op || typeof op !== "object") continue;
            const cost = Number((op as any).cost);
            const count = Number((op as any).count || 0);
            if (Number.isNaN(cost) || count <= 0) continue;
            if (cost < bestCost) {
              bestCost = cost;
              bestCount = count;
            }
          }
        }
        if (!(bestCost < Infinity) || bestCount <= 0) continue;

        // Normalize 5sim country slug → ISO-ish code for merge
        const slug = String(country).toLowerCase();
        let code = String(country).toUpperCase().slice(0, 3);
        if (slug === "usa" || slug === "us") code = "US";
        else if (slug === "england" || slug === "uk") code = "UK";
        else if (slug.length === 2) code = slug.toUpperCase();
        else code = slug.toUpperCase().slice(0, 2);

        const name = prettyName(slug, country);
        const override =
          overrideFor("fivesim", product, code) ??
          overrideFor("fivesim", service, code);
        const priceNaira =
          override != null
            ? Number(override)
            : calcNairaFromFiveSimUsd(bestCost, fivesimUsdNgn, fivesimMarkup);

        const cand: Cand = {
          id: country,
          code,
          name,
          priceNaira,
          finalNaira: priceNaira,
          successRate: 85, // 5sim has no success % in this feed — treat as solid mid-high
          stock: bestCount,
          priceUsd: bestCost,
          _provider: "fivesim",
        };
        const prev = byCode.get(code);
        if (
          !prev ||
          cand.successRate > prev.successRate ||
          (cand.successRate === prev.successRate && cand.stock > prev.stock)
        ) {
          byCode.set(code, cand);
        }
      }
    } catch (e) {
      console.error("voip fivesim availability", e);
    }

    const countries = Array.from(byCode.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return NextResponse.json({
      mode: "voip",
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
