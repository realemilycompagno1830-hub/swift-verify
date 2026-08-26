import type { SupabaseClient } from "@supabase/supabase-js";

const REFUNDABLE = ["pending", "waiting_sms"];

/**
 * Idempotent SMS order refund.
 * 1) Atomically claim the order (only if still pending/waiting)
 * 2) Skip if a refund transaction already exists for this order id
 * 3) Credit wallet exactly once for order.cost_naira
 */
export async function safeRefundSmsOrder(
  admin: SupabaseClient,
  order: {
    id: string;
    user_id: string;
    cost_naira: number | string;
    status: string;
    smspool_order_id?: string | null;
    service_name?: string | null;
  },
  reason: string,
  finalStatus: "expired" | "cancelled" | "refunded" = "expired"
): Promise<{ refunded: boolean; balance: number | null; amount: number }> {
  const amount = Math.round(Number(order.cost_naira) * 100) / 100;
  if (!order?.id || !order.user_id || !(amount > 0)) {
    return { refunded: false, balance: null, amount: 0 };
  }

  // Already terminal?
  if (!REFUNDABLE.includes(order.status)) {
    const { data: profile } = await admin
      .from("profiles")
      .select("balance")
      .eq("id", order.user_id)
      .single();
    return {
      refunded: false,
      balance: profile ? Number(profile.balance) : null,
      amount: 0,
    };
  }

  // Existing refund for this order? (idempotency)
  const { data: existingTx } = await admin
    .from("transactions")
    .select("id")
    .eq("user_id", order.user_id)
    .eq("type", "refund")
    .eq("reference", order.id)
    .maybeSingle();

  if (existingTx) {
    // Ensure status is closed
    await admin
      .from("orders")
      .update({ status: finalStatus, updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .in("status", REFUNDABLE);

    const { data: profile } = await admin
      .from("profiles")
      .select("balance")
      .eq("id", order.user_id)
      .single();
    return {
      refunded: false,
      balance: profile ? Number(profile.balance) : null,
      amount: 0,
    };
  }

  // Claim order first (race-safe). Only one concurrent caller wins.
  const { data: claimed, error: claimErr } = await admin
    .from("orders")
    .update({
      status: finalStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .in("status", REFUNDABLE)
    .select("id")
    .maybeSingle();

  if (claimErr || !claimed) {
    // Another process already refunded/closed it
    const { data: profile } = await admin
      .from("profiles")
      .select("balance")
      .eq("id", order.user_id)
      .single();
    return {
      refunded: false,
      balance: profile ? Number(profile.balance) : null,
      amount: 0,
    };
  }

  // Credit wallet
  const { data: profile } = await admin
    .from("profiles")
    .select("balance")
    .eq("id", order.user_id)
    .single();

  const current = Number(profile?.balance || 0);
  const newBalance = Math.round((current + amount) * 100) / 100;

  await admin
    .from("profiles")
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq("id", order.user_id);

  await admin.from("transactions").insert({
    user_id: order.user_id,
    type: "refund",
    amount,
    balance_after: newBalance,
    description: (reason || "Refund").slice(0, 200),
    reference: order.id,
  });

  return { refunded: true, balance: newBalance, amount };
}
