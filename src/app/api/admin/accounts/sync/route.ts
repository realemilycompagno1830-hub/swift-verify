import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import {
  extractProductList,
  isPreferredSocial,
  listProducts,
  normalizeProduct,
} from "@/lib/darkstore";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    if (!process.env.DARKSTORE_API_KEY) {
      return NextResponse.json(
        { error: "DARKSTORE_API_KEY not set in Vercel" },
        { status: 503 }
      );
    }

    const all: any[] = [];
    // Pull a few pages of in-stock products
    for (let page = 1; page <= 5; page++) {
      const res = await listProducts({
        only_in_stock: true,
        page,
        perPage: 50,
      });
      const batch = extractProductList(res);
      if (!batch.length) break;
      all.push(...batch);
      await new Promise((r) => setTimeout(r, 600)); // respect rate limit
      if (batch.length < 50) break;
    }

    let upserted = 0;
    let preferred = 0;

    for (const raw of all) {
      const n = normalizeProduct(raw);
      if (!n.darkstore_id) continue;

      const prefer = isPreferredSocial(n.name, n.category_name);
      if (prefer) preferred++;

      const { error } = await admin.from("account_products").upsert(
        {
          darkstore_id: n.darkstore_id,
          name: n.name,
          description: n.description,
          category_name: n.category_name,
          category_id: n.category_id,
          image_url: n.image_url,
          stock: n.stock,
          cost_rub: n.cost_rub,
          raw: n.raw,
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          // do not overwrite is_active or override_price_naira
        },
        { onConflict: "darkstore_id" }
      );
      if (!error) upserted++;
    }

    return NextResponse.json({
      success: true,
      fetched: all.length,
      upserted,
      preferredSocialMatches: preferred,
      message:
        "Sync complete. Turn on products you want to sell (especially Facebook / Instagram / TikTok).",
    });
  } catch (e: any) {
    console.error("sync", e);
    return NextResponse.json(
      { error: e.message || "Sync failed" },
      { status: 500 }
    );
  }
}
