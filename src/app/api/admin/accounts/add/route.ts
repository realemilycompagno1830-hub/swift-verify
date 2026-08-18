import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { normalizeProduct, viewProduct } from "@/lib/darkstore";

/**
 * POST /api/admin/accounts/add
 * Manually add (or refresh) one DarkStore product by its numeric ID.
 * Body: { darkstoreId: number }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const darkstoreId = Number(body.darkstoreId);
    if (!darkstoreId || Number.isNaN(darkstoreId)) {
      return NextResponse.json(
        { error: "Enter a valid DarkStore product ID (numbers only)" },
        { status: 400 }
      );
    }

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
        { error: "DARKSTORE_API_KEY not set" },
        { status: 503 }
      );
    }

    const res = await viewProduct(darkstoreId);
    const raw = res?.data || res;
    if (!raw || !(raw.id || raw.name)) {
      return NextResponse.json(
        {
          error:
            "Product not found on DarkStore. Check the ID on the product page.",
        },
        { status: 404 }
      );
    }

    const n = normalizeProduct(raw);
    const { data, error } = await admin
      .from("account_products")
      .upsert(
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
          // keep existing is_active / override / display_name if any
        },
        { onConflict: "darkstore_id" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      product: data,
      message: `Added/updated: ${n.name}. Turn "On site" to show it to customers.`,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Could not add product" },
      { status: 500 }
    );
  }
}
