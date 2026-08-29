import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { checkSMS, cancelSMS } from "@/lib/smspool";
import { checkOrder as fiveSimCheck, cancelOrder as fiveSimCancel } from "@/lib/fivesim";
import { getSms as smspvaGetSms, cancelNumber as smspvaCancel } from "@/lib/smspva";
import { safeRefundSmsOrder } from "@/lib/wallet";

const AUTO_EXPIRE_MS = 15 * 60 * 1000; // 15 minutes

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

    // Already has OTP — done
    if (order.status === "completed" && order.otp_code) {
      return NextResponse.json({
        status: "completed",
        otp_code: order.otp_code,
        phone_number: order.phone_number,
      });
    }

    // Cancelled/refunded with no chance of code — stop
    if (["cancelled", "refunded"].includes(order.status) && order.otp_code) {
      return NextResponse.json({
        status: order.status,
        otp_code: order.otp_code,
        phone_number: order.phone_number,
      });
    }

    // expired / completed-without-otp / cancelled-without-otp:
    // still try provider once so codes that arrived on SMSPool are not lost

    const created = new Date(order.created_at).getTime();
    const age = Date.now() - created;
    const provider = order.provider || "smspool";

    if (order.smspool_order_id) {
      try {
        if (provider === "smspva") {
          const result = await smspvaGetSms(
            order.smspool_order_id,
            order.country_code || "US",
            order.service_id || order.service_name || ""
          );
          if (result?.status === "ok" && result.sms) {
            await admin
              .from("orders")
              .update({
                status: "completed",
                otp_code: String(result.sms),
                updated_at: new Date().toISOString(),
              })
              .eq("id", order.id)
              .in("status", ["pending", "waiting_sms"]);
            return NextResponse.json({
              status: "completed",
              otp_code: String(result.sms),
              phone_number: order.phone_number || result.number,
            });
          }
        } else if (provider === "fivesim") {
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
          // SMSPool status codes:
          // 1 = pending, 3 = completed (code received), 6 = refunded, 5 = cancelled, 2 = expired
          const result = await checkSMS(order.smspool_order_id);
          const statusCode = Number(result?.status);
          const otpRaw =
            result?.sms ||
            result?.code ||
            result?.otp ||
            (typeof result?.full_sms === "string"
              ? result.full_sms.match(/\b(\d{4,8})\b/)?.[1]
              : null) ||
            (typeof result?.message === "string" &&
            /^\d{3,8}$/.test(result.message)
              ? result.message
              : null);
          const otp =
            otpRaw != null && String(otpRaw).trim().length >= 3
              ? String(otpRaw).trim()
              : null;

          // Code received (status 3 or any response with sms field)
          if (otp || statusCode === 3) {
            const code = otp || String(result?.sms || result?.code || "").trim();
            if (code && code.length >= 3) {
              await admin
                .from("orders")
                .update({
                  status: "completed",
                  otp_code: code,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", order.id)
                .in("status", [
                  "pending",
                  "waiting_sms",
                  "expired",
                  "cancelled",
                ]);

              return NextResponse.json({
                status: "completed",
                otp_code: code,
                phone_number: order.phone_number || result?.number,
              });
            }
          }

          // Provider closed without code
          if ([2, 5, 6].includes(statusCode)) {
            // Only refund if we never delivered a code
            if (!order.otp_code) {
              const r = await safeRefundSmsOrder(
                admin,
                order,
                `Auto-refund – provider status ${statusCode}`,
                "expired"
              );
              return NextResponse.json({
                status: "expired",
                refunded: r.refunded,
                balance: r.balance,
                message: "Number closed by provider. Wallet refunded.",
              });
            }
            return NextResponse.json({
              status: order.status,
              otp_code: order.otp_code,
              phone_number: order.phone_number,
            });
          }

          // Still waiting (status 1 / 4 resend / etc.)
          // If our local order already expired, don't keep it open forever
          if (["expired", "cancelled", "refunded"].includes(order.status)) {
            return NextResponse.json({
              status: order.status,
              otp_code: order.otp_code,
              phone_number: order.phone_number,
              message: "No code found on provider for this order.",
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

    // No code from provider — if past wait window, expire + refund once
    if (
      age > AUTO_EXPIRE_MS &&
      ["pending", "waiting_sms"].includes(order.status)
    ) {
      await cancelProviderOrder(order);
      const r = await safeRefundSmsOrder(
        admin,
        order,
        `Auto-refund – no SMS after 15 min (${order.service_name || "order"})`,
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

    return NextResponse.json({
      status: order.status === "expired" ? "expired" : "waiting_sms",
      phone_number: order.phone_number,
      otp_code: order.otp_code || null,
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
    const p = order.provider || "smspool";
    if (p === "fivesim") {
      await fiveSimCancel(order.smspool_order_id);
    } else if (p === "smspva") {
      await smspvaCancel(
        order.smspool_order_id,
        order.country_code || "US",
        order.service_id || order.service_name || ""
      );
    } else if (process.env.SMSPOOL_API_KEY) {
      await cancelSMS(order.smspool_order_id);
    }
  } catch {
    /* ignore */
  }
}
