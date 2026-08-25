import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { cancelSMS } from "@/lib/smspool";

const AUTO_EXPIRE_MS = 10 * 60 * 1000;

/**
 * POST /api/orders/expire-pending
 * Refunds the current user's waiting orders older than 5 minutes.
 * Dashboard calls this on load so refunds happen even if user left the page.
 */
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
    const cutoff = new Date(Date.now() - AUTO_EXPIRE_MS).toISOString();

    const { data: stale } = await admin
      .from("orders")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["pending", "waiting_sms"])
      .lt("created_at", cutoff);

    let refundedCount = 0;
    let totalRefund = 0;

    for (const order of stale || []) {
      if (order.smspool_order_id && process.env.SMSPOOL_API_KEY) {
        try {
          await cancelSMS(order.smspool_order_id);
        } catch {
          /* continue */
        }
      }

      const { data: profile } = await admin
        .from("profiles")
        .select("balance")
        .eq("id", user.id)
        .single();

      const current = Number(profile?.balance || 0);
      const refund = Number(order.cost_naira);
      const newBalance = Math.round((current + refund) * 100) / 100;

      await admin
        .from("profiles")
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq("id", user.id);

      await admin.from("transactions").insert({
        user_id: user.id,
        type: "refund",
        amount: refund,
        balance_after: newBalance,
        description: `Auto-refund expired order – ${order.service_name}`,
        reference: order.id,
      });

      await admin
        .from("orders")
        .update({
          status: "expired",
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      refundedCount++;
      totalRefund += refund;
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("balance")
      .eq("id", user.id)
      .single();

    return NextResponse.json({
      success: true,
      refundedCount,
      totalRefund,
      balance: profile?.balance,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Expire failed" },
      { status: 500 }
    );
  }
}
