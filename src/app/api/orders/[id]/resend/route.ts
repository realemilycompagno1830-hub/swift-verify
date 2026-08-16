import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { resendSMS } from "@/lib/smspool";

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

    if (!order.smspool_order_id) {
      return NextResponse.json(
        { error: "This order cannot be resent" },
        { status: 400 }
      );
    }

    if (!["completed", "waiting_sms", "pending"].includes(order.status)) {
      return NextResponse.json(
        {
          error:
            "Only active or completed numbers can request another code.",
        },
        { status: 400 }
      );
    }

    if (!process.env.SMSPOOL_API_KEY) {
      return NextResponse.json(
        { error: "SMSPool is not configured" },
        { status: 503 }
      );
    }

    let result: any = null;
    try {
      result = await resendSMS(String(order.smspool_order_id));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        {
          error:
            "Could not request another code on this number. It may have expired, or resend is not available right now.",
          details: msg.slice(0, 200),
        },
        { status: 502 }
      );
    }

    const ok =
      result?.success === 1 ||
      result?.success === true ||
      String(result?.message || "")
        .toLowerCase()
        .includes("requested");

    if (!ok && result?.success === 0) {
      return NextResponse.json(
        {
          error:
            result?.message ||
            "Resend was rejected. The number may no longer accept new codes.",
        },
        { status: 400 }
      );
    }

    await admin
      .from("orders")
      .update({
        status: "waiting_sms",
        otp_code: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    return NextResponse.json({
      success: true,
      message:
        result?.message ||
        "Number requested again. On the app, tap Resend code, then wait here for the new OTP.",
      status: "waiting_sms",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Resend failed";
    console.error("Resend error", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
