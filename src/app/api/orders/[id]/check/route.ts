import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { checkSMS, cancelSMS } from "@/lib/smspool";

export async function POST(
  req: NextRequest,
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

    // Already finished – do not process again
    if (
      ["completed", "cancelled", "expired", "refunded"].includes(order.status) ||
      order.otp_code
    ) {
      return NextResponse.json({
        status: order.status,
        otp_code: order.otp_code,
        phone_number: order.phone_number,
      });
    }

    // Expired?
    if (order.expires_at && new Date(order.expires_at) < new Date()) {
      // Attempt cancel + refund
      if (order.smspool_order_id && process.env.SMSPOOL_API_KEY) {
        try {
          await cancelSMS(order.smspool_order_id);
        } catch (_) {}
      }

      // Refund
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
        .update({ balance: newBalance })
        .eq("id", user.id);

      await admin.from("transactions").insert({
        user_id: user.id,
        type: "refund",
        amount: refund,
        balance_after: newBalance,
        description: `Auto-refund expired order ${order.id}`,
        reference: order.id,
      });

      await admin
        .from("orders")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", order.id);

      return NextResponse.json({
        status: "expired",
        phone_number: order.phone_number,
      });
    }

    // Poll SMSPool
    if (order.smspool_order_id && process.env.SMSPOOL_API_KEY) {
      try {
        const result = await checkSMS(order.smspool_order_id);

        // Response shapes vary – common patterns:
        // { status: 1, sms: "123456", ... } or { code: "...", ... }
        const otp =
          result?.sms ||
          result?.code ||
          result?.otp ||
          result?.message ||
          null;

        const statusCode = result?.status;

        // status 1 or 3 often means received in various providers
        if (otp && String(otp).length >= 3 && statusCode !== 0) {
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
            phone_number: order.phone_number,
          });
        }

        // Still waiting
        return NextResponse.json({
          status: "waiting_sms",
          phone_number: order.phone_number || result?.number,
          time_left: result?.time_left,
        });
      } catch (smsErr: any) {
        console.error("SMSPool check error", smsErr);
        // Don't fail the poll – just report current state
      }
    }

    // Demo mode: after a few polls simulate an OTP
    if (!process.env.SMSPOOL_API_KEY && order.smspool_order_id?.startsWith("DEMO_")) {
      // Simple deterministic demo: complete after ~9 seconds (3 polls)
      const created = new Date(order.created_at).getTime();
      if (Date.now() - created > 9000) {
        const demoOtp = String(100000 + Math.floor(Math.random() * 900000));
        await admin
          .from("orders")
          .update({
            status: "completed",
            otp_code: demoOtp,
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.id);

        return NextResponse.json({
          status: "completed",
          otp_code: demoOtp,
          phone_number: order.phone_number,
        });
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
