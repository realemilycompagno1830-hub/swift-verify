import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { softOrderDownload, softOrderStatus } from "@/lib/darkstore";

/**
 * POST /api/accounts/orders/[id]/refresh
 * Pull delivery again from DarkStore for a pending account order.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: order, error } = await admin
      .from("account_orders")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (!order.darkstore_order_id) {
      return NextResponse.json(
        {
          error:
            "No DarkStore order id saved for this purchase. Contact support with the time of purchase.",
        },
        { status: 400 }
      );
    }

    const orderId = order.darkstore_order_id;
    let deliveryLink: string | null = order.delivery_link;
    let deliveryText: string | null = order.delivery_text;

    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
      const dl = await softOrderDownload(orderId);
      const dlData = dl.json?.data || dl.json;
      const link = dlData?.link || dl.json?.link;
      if (link) {
        deliveryLink = String(link);
        try {
          const fileRes = await fetch(deliveryLink, { cache: "no-store" });
          if (fileRes.ok) {
            const text = (await fileRes.text()).trim();
            if (text && text.length < 80000) deliveryText = text;
          }
        } catch {
          /* link only */
        }
        break;
      }
    }

    if (!deliveryLink && !deliveryText) {
      const st = await softOrderStatus(orderId);
      return NextResponse.json(
        {
          error:
            "Still no download from DarkStore. Try again in a minute, or download from your DarkStore account if you are the admin.",
          status: st.json,
        },
        { status: 404 }
      );
    }

    const { data: updated, error: upErr } = await admin
      .from("account_orders")
      .update({
        delivery_link: deliveryLink,
        delivery_text: deliveryText,
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .select()
      .single();

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      order: updated,
      deliveryLink,
      deliveryText,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Refresh failed" },
      { status: 500 }
    );
  }
}
