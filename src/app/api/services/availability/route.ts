import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getSuccessRate,
  calculateNairaPrice,
} from "@/lib/smspool";

/**
 * SMSPool-only availability for a selected service.
 * Returns countries that have stock (success rate filter applied).
 */
export async function GET(req: NextRequest) {
  try {
    const service = (req.nextUrl.searchParams.get("service") || "").trim();
    if (!service) {
      return NextResponse.json({ error: "service required" }, { status: 400 });
    }

    const minSuccess = Number(
      req.nextUrl.searchParams.get("minSuccess") || 50
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
        if (s === keySvc && c === keyC && o.price_naira != null) {
          return Number(o.price_naira);
        }
      }
      return null;
    };

    // Resolve service id for SMSPool success_rate endpoint
    let serviceId: string | number = service;
    try {
      const { data: manuals } = await supabase
        .from("sms_manual_services")
        .select("*")
        .or("provider.eq.smspool,provider.is.null");
      for (const m of manuals || []) {
        const name = String(m.name || m.service_name || "").toLowerCase();
        if (name === service.toLowerCase() && m.service_id) {
          serviceId = m.service_id;
          break;
        }
      }
    } catch {
      /* optional */
    }

    const countries: any[] = [];
    try {
      const rates = await getSuccessRate(serviceId);
      const list = Array.isArray(rates)
        ? rates
        : rates?.data || rates?.countries || [];

      for (const row of list) {
        const successRate = Number(
          row.success_rate ?? row.success ?? row.rate ?? 0
        );
        if (successRate < minSuccess) continue;

        const code = String(
          row.short_name || row.code || row.country_code || row.country || ""
        ).toUpperCase();
        const name = String(row.name || row.country_name || code).trim();
        const priceUsd = Number(
          row.price ?? row.high_price ?? row.low_price ?? 0
        );
        if (!code) continue;

        const override = overrideFor(service, code);
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
          id: row.country ?? row.country_id ?? code,
          code,
          name: name || code,
          priceNaira,
          finalNaira: priceNaira,
          successRate,
          stock: successRate > 0 ? 1 : 0,
          priceUsd: priceUsd || null,
          _provider: "smspool",
        });
      }
    } catch (e) {
      console.error("SMSPool success_rate", e);
    }

    countries.sort((a, b) => {
      // Higher success first, then name
      if (b.successRate !== a.successRate) return b.successRate - a.successRate;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      provider: "smspool",
      service,
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
