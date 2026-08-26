import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { checkSMS, cancelSMS } from "@/lib/smspool";
import { checkOrder as fiveSimCheck, cancelOrder as fiveSimCancel } from "@/lib/fivesim";
import { safeRefundSmsOrder } from "@/lib/wallet";

const AUTO_EXPIRE_MS = 10 * 60 * 1000; // 10 minutes

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

    const created = new Date(order.created_at).getTime();
    const age = Date.now() - created;
    if (age > AUTO_EXPIRE_MS) {
      // Cancel at provider best-effort
      await cancelProviderOrder(order);
      const r = await safeRefundSmsOrder(
        admin,
        order,
        `Auto-refund – no SMS after 10 min (${order.service_name || "order"})`,
        "expired"
      );
      return NextResponse.json({
        status: "expired",
        refunded: r.refunded,
        balance: r.balance,
        phone_number: order.phone_number,
        message: r.refunded
          ? "No SMS received in time. Wallet refunded."
          : "Order already closed.",
      });
    }

    const provider = order.provider || "smspool";

    if (order.smspool_order_id) {
      try {
        if (provider === "fivesim") {
          const result = await fiveSimCheck(order.smspool_order_id);
          const status = String(result?.status || "").toUpperCase();
          const smsList = Array.isArray(result?.sms) ? result.sms : [];
          const code =
            smsList[0]?.code ||
            smsList[0]?.text?.match(/\d{4,8}/)?.[0] ||
            null;

          if (code) {
            await admin
              .from("orders")
              .update({
                status: "completed",
                otp_code: String(code),
                updated_at: new Date().toISOString(),
              })
              .eq("id", order.id)
              .in("status", ["pending", "waiting_sms"]);

            return NextResponse.json({
              status: "completed",
              otp_code: String(code),
              phone_number: order.phone_number || result?.phone,
            });
          }

          if (["CANCELED", "CANCELLED", "TIMEOUT", "BANNED", "FINISHED"].includes(status) && !code) {
            if (status === "FINISHED" && !code) {
              // finished without code is rare – treat as expired
            }
            if (["CANCELED", "CANCELLED", "TIMEOUT", "BANNED"].includes(status)) {
              const r = await safeRefundSmsOrder(
                admin,
                order,
                `Auto-refund – provider status ${status}`,
                "expired"
              );
              return NextResponse.json({
                status: "expired",
                refunded: r.refunded,
                balance: r.balance,
                message: "Number cancelled by provider. Wallet refunded.",
              });
            }
          }
        } else {
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

          if (otp && String(otp).length >= 3 && statusCode !== 0 && statusCode !== 3) {
            await admin
              .from("orders")
              .update({
                status: "completed",
                otp_code: String(otp),
                updated_at: new Date().toISOString(),
              })
              .eq("id", order.id)
              .in("status", ["pending", "waiting_sms"]);

            return NextResponse.json({
              status: "completed",
              otp_code: String(otp),
              phone_number: order.phone_number || result?.number,
            });
          }

          const dead =
            statusCode === 3 ||
            statusCode === -1 ||
            /cancel|expir|refund|timeout|not.?available|fail/.test(statusText);

          if (dead) {
            const r = await safeRefundSmsOrder(
              admin,
              order,
              `Auto-refund – provider cancelled (${statusCode})`,
              "expired"
            );
            return NextResponse.json({
              status: "expired",
              refunded: r.refunded,
              balance: r.balance,
              message: "Number cancelled by provider. Wallet refunded.",
            });
          }

          return NextResponse.json({
            status: "waiting_sms",
            phone_number: order.phone_number || result?.number,
            time_left: result?.time_left,
          });
        }
      } catch (smsErr: any) {
        console.error("Provider check error", smsErr);
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

async function cancelProviderOrder(order: any) {
  if (!order?.smspool_order_id) return;
  try {
    if ((order.provider || "smspool") === "fivesim") {
      await fiveSimCancel(order.smspool_order_id);
    } else if (process.env.SMSPOOL_API_KEY) {
      await cancelSMS(order.smspool_order_id);
    }
  } catch {
    /* ignore */
  }
}
