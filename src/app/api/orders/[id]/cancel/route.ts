import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { cancelSMS } from "@/lib/smspool";
import { cancelOrder as fiveSimCancel } from "@/lib/fivesim";
import { safeRefundSmsOrder } from "@/lib/wallet";

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
      .from("orders")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (["completed", "cancelled", "expired", "refunded"].includes(order.status)) {
      return NextResponse.json(
        { error: `Order is already ${order.status}` },
        { status: 400 }
      );
    }

    try {
      if (order.smspool_order_id) {
        if ((order.provider || "smspool") === "fivesim") {
          await fiveSimCancel(order.smspool_order_id);
        } else if (process.env.SMSPOOL_API_KEY) {
          await cancelSMS(order.smspool_order_id);
        }
      }
    } catch (e) {
      console.error("Provider cancel failed (continuing refund)", e);
    }

    const r = await safeRefundSmsOrder(
      admin,
      order,
      `Cancelled order – ${order.service_name || ""} (${order.country_code || ""})`,
      "cancelled"
    );

    return NextResponse.json({
      success: true,
      status: "cancelled",
      refunded: r.refunded ? r.amount : 0,
      balance: r.balance,
      alreadyRefunded: !r.refunded,
    });
  } catch (err: any) {
    console.error("Cancel error", err);
    return NextResponse.json(
      { error: err.message || "Cancel failed" },
      { status: 500 }
    );
  }
}
