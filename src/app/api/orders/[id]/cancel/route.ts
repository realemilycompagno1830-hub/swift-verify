import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { cancelSMS } from "@/lib/smspool";

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

    if (
      ["completed", "cancelled", "expired", "refunded"].includes(order.status)
    ) {
      return NextResponse.json(
        { error: `Order is already ${order.status}` },
        { status: 400 }
      );
    }

    if (order.smspool_order_id && process.env.SMSPOOL_API_KEY) {
      try {
        await cancelSMS(order.smspool_order_id);
      } catch (e) {
        console.error("SMSPool cancel failed (continuing with refund)", e);
      }
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("balance")
      .eq("id", user.id)
      .single();

    const current = Number(profile?.balance || 0);
    const refund = Number(order.cost_naira);
    const newBalance = current + refund;

    await admin
      .from("profiles")
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    await admin.from("transactions").insert({
      user_id: user.id,
      type: "refund",
      amount: refund,
      balance_after: newBalance,
      description: `Cancelled order – ${order.service_name} (${order.country_code})`,
      reference: order.id,
    });

    await admin
      .from("orders")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    return NextResponse.json({
      success: true,
      status: "cancelled",
      refunded: refund,
      balance: newBalance,
    });
  } catch (err: any) {
    console.error("Cancel error", err);
    return NextResponse.json(
      { error: err.message || "Cancel failed" },
      { status: 500 }
    );
  }
}
