import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return {
      error: NextResponse.json({ error: "Admin only" }, { status: 403 }),
    };
  }
  return { admin };
}

export async function GET() {
  try {
    const gate = await requireAdmin();
    if ("error" in gate && gate.error) return gate.error;
    const admin = gate.admin!;

    const { data } = await admin
      .from("site_settings")
      .select("value")
      .eq("key", "payment_provider")
      .maybeSingle();

    const active =
      data?.value?.active === "flutterwave" ? "flutterwave" : "paystack";

    return NextResponse.json({
      active,
      env: {
        paystackPublic: !!process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
        paystackSecret: !!process.env.PAYSTACK_SECRET_KEY,
        flutterwavePublic: !!process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY,
        flutterwaveSecret: !!process.env.FLUTTERWAVE_SECRET_KEY,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireAdmin();
    if ("error" in gate && gate.error) return gate.error;
    const admin = gate.admin!;
    const body = await req.json();
    const active =
      body.active === "flutterwave" ? "flutterwave" : "paystack";

    if (active === "flutterwave") {
      if (
        !process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY ||
        !process.env.FLUTTERWAVE_SECRET_KEY
      ) {
        return NextResponse.json(
          {
            error:
              "Flutterwave keys missing in Vercel. Add NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY and FLUTTERWAVE_SECRET_KEY, then redeploy.",
          },
          { status: 400 }
        );
      }
    }

    if (active === "paystack") {
      if (
        !process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ||
        !process.env.PAYSTACK_SECRET_KEY
      ) {
        return NextResponse.json(
          {
            error:
              "Paystack keys missing in Vercel. Add NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY and PAYSTACK_SECRET_KEY, then redeploy.",
          },
          { status: 400 }
        );
      }
    }

    await admin.from("site_settings").upsert(
      {
        key: "payment_provider",
        value: { active },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    return NextResponse.json({
      success: true,
      active,
      message: `Payments will now use ${active === "flutterwave" ? "Flutterwave" : "Paystack"}.`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
