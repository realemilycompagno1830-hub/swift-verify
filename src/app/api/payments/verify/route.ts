import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/payments/verify
 * Verifies a payment and credits the user wallet.
 * Currently supports Flutterwave (primary) and Paystack (fallback).
 *
 * Body: { reference, amount?, provider? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { reference, amount, provider: bodyProvider } = body;

    if (!reference) {
      return NextResponse.json({ error: "Missing reference" }, { status: 400 });
    }

    let provider =
      bodyProvider ||
      process.env.PAYMENT_PROVIDER ||
      process.env.NEXT_PUBLIC_PAYMENT_PROVIDER ||
      "paystack";

    // Prefer admin DB switch when client did not send provider
    if (!bodyProvider) {
      try {
        const adminPeek = createAdminClient();
        const { data: row } = await adminPeek
          .from("site_settings")
          .select("value")
          .eq("key", "payment_provider")
          .maybeSingle();
        const a = row?.value?.active;
        if (a === "paystack" || a === "flutterwave") provider = a;
      } catch {
        /* keep env default */
      }
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let paidNaira = 0;
    let rawTx: any = null;
    let gatewayName = provider;

    // ---------- Flutterwave verification ----------
    if (provider === "flutterwave") {
      const secret = process.env.FLUTTERWAVE_SECRET_KEY;
      if (!secret) {
        return NextResponse.json(
          { error: "Flutterwave is not configured" },
          { status: 500 }
        );
      }

      // Verify by tx_ref
      const verifyRes = await fetch(
        `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(
          reference
        )}`,
        {
          headers: {
            Authorization: `Bearer ${secret}`,
          },
        }
      );

      const verifyData = await verifyRes.json();

      if (
        !verifyRes.ok ||
        verifyData.status !== "success" ||
        !verifyData.data
      ) {
        return NextResponse.json(
          {
            error:
              verifyData.message ||
              "Flutterwave verification failed. Payment may still be processing.",
          },
          { status: 400 }
        );
      }

      const tx = verifyData.data;
      if (tx.status !== "successful") {
        return NextResponse.json(
          { error: `Transaction status: ${tx.status}` },
          { status: 400 }
        );
      }

      paidNaira = Number(tx.amount);
      rawTx = tx;
      gatewayName = "flutterwave";
    }

    // ---------- Paystack verification (kept for later switch) ----------
    else if (provider === "paystack") {
      const secret = process.env.PAYSTACK_SECRET_KEY;
      if (!secret) {
        return NextResponse.json(
          { error: "Paystack is not configured" },
          { status: 500 }
        );
      }

      const verifyRes = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(
          reference
        )}`,
        {
          headers: {
            Authorization: `Bearer ${secret}`,
          },
        }
      );

      const verifyData = await verifyRes.json();

      if (!verifyRes.ok || verifyData.status !== true) {
        return NextResponse.json(
          { error: verifyData.message || "Paystack verification failed" },
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

      paidNaira = tx.amount / 100; // kobo → naira
      rawTx = tx;
      gatewayName = "paystack";
    } else {
      return NextResponse.json(
        { error: `Unsupported payment provider: ${provider}` },
        { status: 400 }
      );
    }

    if (amount && Math.abs(paidNaira - Number(amount)) > 5) {
      console.warn("Amount mismatch", paidNaira, amount);
    }

    const admin = createAdminClient();

    // Idempotency check
    const { data: existing } = await admin
      .from("payment_logs")
      .select("id")
      .eq("reference", reference)
      .maybeSingle();

    if (existing) {
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
      gateway: gatewayName,
      description: `Wallet funding via ${gatewayName}`,
      metadata: { [gatewayName]: rawTx },
    });

    await admin.from("payment_logs").insert({
      user_id: user.id,
      gateway: gatewayName,
      reference,
      amount: paidNaira,
      status: "success",
      raw_response: rawTx,
    });

    return NextResponse.json({
      success: true,
      balance: newBalance,
      amount: paidNaira,
      provider: gatewayName,
    });
  } catch (err: any) {
    console.error("Verify error", err);
    return NextResponse.json(
      { error: err.message || "Verification error" },
      { status: 500 }
    );
  }
}
