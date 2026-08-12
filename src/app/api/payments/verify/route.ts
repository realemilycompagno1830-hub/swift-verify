import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { reference, amount } = await req.json();

    if (!reference) {
      return NextResponse.json({ error: "Missing reference" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify with Paystack
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      return NextResponse.json(
        { error: "Payment provider not configured" },
        { status: 500 }
      );
    }

    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${secret}`,
        },
      }
    );

    const verifyData = await verifyRes.json();

    if (!verifyRes.ok || verifyData.status !== true) {
      return NextResponse.json(
        { error: verifyData.message || "Verification failed" },
        { status: 400 }
      );
    }

    const tx = verifyData.data;
    if (tx.status !== "success") {
      return NextResponse.json(
        { error: `Transaction status: ${tx.status}` },
        { status: 400 }
      );
    }

    // Amount from Paystack is in kobo
    const paidNaira = tx.amount / 100;
    if (amount && Math.abs(paidNaira - Number(amount)) > 1) {
      // Allow small float tolerance
      console.warn("Amount mismatch", paidNaira, amount);
    }

    const admin = createAdminClient();

    // Idempotency: check if we already processed this reference
    const { data: existing } = await admin
      .from("payment_logs")
      .select("id")
      .eq("reference", reference)
      .maybeSingle();

    if (existing) {
      // Already credited
      const { data: profile } = await admin
        .from("profiles")
        .select("balance")
        .eq("id", user.id)
        .single();
      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        balance: profile?.balance,
      });
    }

    // Credit wallet
    const { data: profile } = await admin
      .from("profiles")
      .select("balance")
      .eq("id", user.id)
      .single();

    const current = Number(profile?.balance || 0);
    const newBalance = current + paidNaira;

    await admin
      .from("profiles")
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    await admin.from("transactions").insert({
      user_id: user.id,
      type: "deposit",
      amount: paidNaira,
      balance_after: newBalance,
      reference,
      gateway: "paystack",
      description: `Wallet funding via Paystack`,
      metadata: { paystack: tx },
    });

    await admin.from("payment_logs").insert({
      user_id: user.id,
      gateway: "paystack",
      reference,
      amount: paidNaira,
      status: "success",
      raw_response: tx,
    });

    return NextResponse.json({
      success: true,
      balance: newBalance,
      amount: paidNaira,
    });
  } catch (err: any) {
    console.error("Verify error", err);
    return NextResponse.json(
      { error: err.message || "Verification error" },
      { status: 500 }
    );
  }
}
