import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calcNairaFromRub } from "@/lib/darkstore";

export async function GET() {
  try {
    const supabase = await createClient();

    const [{ data: products }, { data: pricingRow }, { data: pageRow }] =
      await Promise.all([
        supabase
          .from("account_products")
          .select(
            "id, darkstore_id, name, display_name, description, category_name, image_url, stock, cost_rub, override_price_naira, is_active"
          )
          .eq("is_active", true)
          .gt("stock", 0)
          .order("category_name")
          .order("name"),
        supabase
          .from("site_settings")
          .select("value")
          .eq("key", "accounts_pricing")
          .single(),
        supabase
          .from("site_settings")
          .select("value")
          .eq("key", "accounts_page")
          .single(),
      ]);

    const rate = Number(pricingRow?.value?.rub_ngn_rate ?? 18);
    const markup = Number(pricingRow?.value?.markup_percent ?? 100);

    const list = (products || []).map((p: any) => ({
      id: p.id,
      name: p.display_name || p.name,
      description: p.description,
      category: p.category_name || "Other",
      imageUrl: p.image_url,
      stock: p.stock,
      priceNaira: calcNairaFromRub(
        Number(p.cost_rub),
        rate,
        markup,
        p.override_price_naira
      ),
    }));

    const preferred = ["facebook", "instagram", "tiktok"];
    const groups: Record<string, typeof list> = {};
    for (const item of list) {
      const key = item.category || "Other";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      const ai = preferred.findIndex((p) => a.toLowerCase().includes(p));
      const bi = preferred.findIndex((p) => b.toLowerCase().includes(p));
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

    return NextResponse.json({
      page: pageRow?.value || {
        title: "Buy Social Media Accounts",
        subtitle: "Facebook, Instagram, TikTok and more.",
        enabled: true,
      },
      groups: sortedKeys.map((k) => ({ category: k, items: groups[k] })),
      total: list.length,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e.message || "Failed to load products" },
      { status: 500 }
    );
  }
}
