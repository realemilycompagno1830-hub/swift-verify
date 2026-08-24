import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import crypto from "crypto";

/**
 * POST /api/webhooks/paystack
 * Configure in Paystack Dashboard → Settings → API Keys & Webhooks:
 *   https://swiftverify.store/api/webhooks/paystack
 *
 * This is the reliable path: credits wallet even if the user closes the popup.
 */
export async function POST(req: NextRequest) {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      return NextResponse.json({ error: "Not configured" }, { status: 500 });
    }

    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature") || "";

    const hash = crypto
      .createHmac("sha512", secret)
      .update(rawBody)
      .digest("hex");

    if (hash !== signature) {
      console.error("Paystack webhook: invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(rawBody);
    if (event.event !== "charge.success") {
      return NextResponse.json({ received: true, ignored: event.event });
    }

    const data = event.data;
    const reference = data?.reference;
    const amountKobo = Number(data?.amount || 0);
    const paidNaira = amountKobo / 100;
    const status = data?.status;

    if (!reference || status !== "success" || paidNaira <= 0) {
      return NextResponse.json({ received: true, skipped: true });
    }

    const admin = createAdminClient();

    // Idempotency
    const { data: existing } = await admin
      .from("payment_logs")
      .select("id")
      .eq("reference", reference)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ received: true, alreadyProcessed: true });
    }

    // Resolve user: metadata.user_id or email match
    let userId: string | null =
      data?.metadata?.user_id || data?.metadata?.userId || null;

    if (!userId && data?.customer?.email) {
      const { data: profile } = await admin
        .from("profiles")
        .select("id")
        .eq("email", data.customer.email)
        .maybeSingle();
      userId = profile?.id || null;
    }

    if (!userId) {
      console.error("Paystack webhook: no user for ref", reference);
      // Still log so we can fix manually
      await admin.from("payment_logs").insert({
        user_id: null,
        gateway: "paystack",
        reference,
        amount: paidNaira,
        status: "unmatched",
        raw_response: data,
      });
      return NextResponse.json({ received: true, unmatched: true });
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("balance")
      .eq("id", userId)
      .single();

    const current = Number(profile?.balance || 0);
    const newBalance = Math.round((current + paidNaira) * 100) / 100;

    await admin
      .from("profiles")
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("id", userId);

    await admin.from("transactions").insert({
      user_id: userId,
      type: "deposit",
      amount: paidNaira,
      balance_after: newBalance,
      reference,
      gateway: "paystack",
      description: "Wallet funding via paystack (webhook)",
      metadata: { paystack: data },
    });

    await admin.from("payment_logs").insert({
      user_id: userId,
      gateway: "paystack",
      reference,
      amount: paidNaira,
      status: "success",
      raw_response: data,
    });

    return NextResponse.json({ received: true, credited: paidNaira, userId });
  } catch (err: any) {
    console.error("Paystack webhook error", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
