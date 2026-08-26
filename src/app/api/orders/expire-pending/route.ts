import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { cancelSMS } from "@/lib/smspool";
import { cancelOrder as fiveSimCancel } from "@/lib/fivesim";
import { safeRefundSmsOrder } from "@/lib/wallet";

const AUTO_EXPIRE_MS = 15 * 60 * 1000; // 15 minutes

/**
 * POST /api/orders/expire-pending
 * Refunds current user's waiting orders older than 15 minutes — once each.
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
      try {
        if (order.smspool_order_id) {
          if ((order.provider || "smspool") === "fivesim") {
            await fiveSimCancel(order.smspool_order_id).catch(() => {});
          } else if (process.env.SMSPOOL_API_KEY) {
            await cancelSMS(order.smspool_order_id).catch(() => {});
          }
        }
      } catch {
        /* continue */
      }

      const r = await safeRefundSmsOrder(
        admin,
        order,
        `Auto-refund expired – ${order.service_name || "SMS"}`,
        "expired"
      );
      if (r.refunded) {
        refundedCount++;
        totalRefund += r.amount;
      }
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
