import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
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

    // Page title / pricing settings
    if (body.type === "page") {
      await admin.from("site_settings").upsert({
        key: "accounts_page",
        value: {
          title: body.title || "Buy Social Media Accounts",
          subtitle:
            body.subtitle ||
            "Facebook, Instagram, TikTok and more. Delivered instantly.",
          enabled: body.enabled !== false,
        },
        updated_at: new Date().toISOString(),
      });
      return NextResponse.json({ success: true });
    }

    if (body.type === "pricing") {
      await admin.from("site_settings").upsert({
        key: "accounts_pricing",
        value: {
          rub_ngn_rate: Number(body.rub_ngn_rate) || 18,
          markup_percent: Number(body.markup_percent) || 100,
        },
        updated_at: new Date().toISOString(),
      });
      return NextResponse.json({ success: true });
    }

    // Product update
    const id = body.id as string;
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const patch: any = { updated_at: new Date().toISOString() };
    if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
    if (typeof body.display_name === "string") {
      patch.display_name = body.display_name.trim() || null;
    }
    if (body.override_price_naira !== undefined) {
      const v = body.override_price_naira;
      patch.override_price_naira =
        v === null || v === "" ? null : Number(v);
    }
    if (body.sort_order !== undefined) {
      patch.sort_order = Number(body.sort_order) || 0;
    }
    if (typeof body.category_name === "string" && body.category_name.trim()) {
      patch.category_name = body.category_name.trim();
    }

    const { error } = await admin
      .from("account_products")
      .update(patch)
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Update failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
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

    const [{ data: products }, { data: pageRow }, { data: pricingRow }] =
      await Promise.all([
        admin
          .from("account_products")
          .select("*")
          .order("is_active", { ascending: false })
          .order("category_name")
          .order("sort_order", { ascending: true })
          .order("name")
          .limit(500),
        admin
          .from("site_settings")
          .select("value")
          .eq("key", "accounts_page")
          .single(),
        admin
          .from("site_settings")
          .select("value")
          .eq("key", "accounts_pricing")
          .single(),
      ]);

    return NextResponse.json({
      products: products || [],
      page: pageRow?.value || {
        title: "Buy Social Media Accounts",
        subtitle: "Facebook, Instagram, TikTok and more.",
        enabled: true,
      },
      pricing: pricingRow?.value || { rub_ngn_rate: 18, markup_percent: 100 },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Failed" },
      { status: 500 }
    );
  }
}
