import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { checkSMS, cancelSMS } from "@/lib/smspool";

const AUTO_EXPIRE_MS = 10 * 60 * 1000; // 10 minutes

async function refundOrder(admin: any, order: any, reason: string) {
  // Prevent double refund
  if (["cancelled", "expired", "refunded", "completed"].includes(order.status)) {
    return { refunded: false, balance: null };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("balance")
    .eq("id", order.user_id)
    .single();

  const current = Number(profile?.balance || 0);
  const refund = Number(order.cost_naira);
  const newBalance = Math.round((current + refund) * 100) / 100;

  await admin
    .from("profiles")
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq("id", order.user_id);

  await admin.from("transactions").insert({
    user_id: order.user_id,
    type: "refund",
    amount: refund,
    balance_after: newBalance,
    description: reason.slice(0, 200),
    reference: order.id,
  });

  await admin
    .from("orders")
    .update({
      status: "expired",
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id);

  // Best-effort cancel on SMSPool
  if (order.smspool_order_id && process.env.SMSPOOL_API_KEY) {
    try {
      await cancelSMS(order.smspool_order_id);
    } catch {
      /* ignore */
    }
  }

  return { refunded: true, balance: newBalance, refund };
}

/**
 * POST /api/orders/[id]/check
 * Poll SMSPool for OTP. Auto-refunds if cancelled/expired or past 5 minutes.
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
      .from("orders")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (["completed", "cancelled", "expired", "refunded"].includes(order.status)) {
      return NextResponse.json({
        status: order.status,
        otp_code: order.otp_code,
        phone_number: order.phone_number,
      });
    }

    // Time-based auto-expire (5 min)
    const created = new Date(order.created_at).getTime();
    const age = Date.now() - created;
    if (age > AUTO_EXPIRE_MS) {
      const r = await refundOrder(
        admin,
        order,
        `Auto-refund expired order ${order.id} – no SMS after 5 min`
      );
      return NextResponse.json({
        status: "expired",
        refunded: r.refunded,
        balance: r.balance,
        phone_number: order.phone_number,
        message: "No SMS received in time. Wallet refunded.",
      });
    }

    if (order.smspool_order_id && process.env.SMSPOOL_API_KEY) {
      try {
        const result = await checkSMS(order.smspool_order_id);

        const otp =
          result?.sms ||
          result?.code ||
          result?.otp ||
          (typeof result?.message === "string" &&
          /^\d{3,8}$/.test(result.message)
            ? result.message
            : null);

        const statusCode = Number(result?.status);
        const statusText = String(
          result?.status_message || result?.full_message || result?.message || ""
        ).toLowerCase();

        // Success
        if (otp && String(otp).length >= 3 && statusCode !== 0 && statusCode !== 3) {
          await admin
            .from("orders")
            .update({
              status: "completed",
              otp_code: String(otp),
              updated_at: new Date().toISOString(),
            })
            .eq("id", order.id);

          return NextResponse.json({
            status: "completed",
            otp_code: String(otp),
            phone_number: order.phone_number || result?.number,
          });
        }

        // SMSPool cancelled / expired / refunded styles
        // Common: status 3 = cancelled, or message contains cancel/expire/refund
        const dead =
          statusCode === 3 ||
          statusCode === -1 ||
          /cancel|expir|refund|timeout|not.?available|fail/.test(statusText);

        if (dead) {
          const r = await refundOrder(
            admin,
            order,
            `Auto-refund – SMSPool status ${statusCode}: ${statusText || "cancelled"}`
          );
          return NextResponse.json({
            status: "expired",
            refunded: r.refunded,
            balance: r.balance,
            phone_number: order.phone_number,
            message: "Number cancelled by provider. Wallet refunded.",
          });
        }

        return NextResponse.json({
          status: "waiting_sms",
          phone_number: order.phone_number || result?.number,
          time_left: result?.time_left,
        });
      } catch (smsErr: any) {
        console.error("SMSPool check error", smsErr);
      }
    }

    return NextResponse.json({
      status: order.status,
      phone_number: order.phone_number,
    });
  } catch (err: any) {
    console.error("Check error", err);
    return NextResponse.json(
      { error: err.message || "Check failed" },
      { status: 500 }
    );
  }
}
