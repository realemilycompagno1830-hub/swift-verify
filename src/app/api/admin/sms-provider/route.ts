import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
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
  return { admin, user };
}

const PROVIDERS = ["smspool", "fivesim", "smspva"] as const;

export async function GET() {
  try {
    const gate = await requireAdmin();
    if ("error" in gate && gate.error) return gate.error;
    const admin = gate.admin!;

    const [{ data: settings }, { data: manuals }] = await Promise.all([
      admin
        .from("site_settings")
        .select("value")
        .eq("key", "sms_provider")
        .maybeSingle(),
      admin
        .from("sms_manual_services")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);

    const active = PROVIDERS.includes(settings?.value?.active)
      ? settings!.value.active
      : "smspool";

    return NextResponse.json({
      provider: {
        active,
        smspool_enabled: true,
        fivesim_enabled: true,
        smspva_enabled: true,
      },
      manuals: manuals || [],
      env: {
        smspoolKeySet: !!process.env.SMSPOOL_API_KEY,
        fivesimKeySet: !!process.env.FIVESIM_API_KEY,
        smspvaKeySet: !!process.env.SMSPVA_API_KEY,
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

    if (body.action === "set_provider") {
      const active = PROVIDERS.includes(body.active) ? body.active : "smspool";
      await admin.from("site_settings").upsert({
        key: "sms_provider",
        value: {
          active,
          smspool_enabled: true,
          fivesim_enabled: true,
          smspva_enabled: true,
        },
        updated_at: new Date().toISOString(),
      });
      return NextResponse.json({ success: true, active });
    }

    if (body.action === "add_manual") {
      const provider = PROVIDERS.includes(body.provider)
        ? body.provider
        : "smspool";
      const service_id = String(body.service_id || "").trim();
      const service_name = String(body.service_name || "").trim();
      if (!service_id || !service_name) {
        return NextResponse.json(
          { error: "service_id and service_name required" },
          { status: 400 }
        );
      }
      const { data, error } = await admin
        .from("sms_manual_services")
        .upsert(
          {
            provider,
            service_id,
            service_name,
            country_code: body.country_code
              ? String(body.country_code).trim()
              : null,
            country_name: body.country_name
              ? String(body.country_name).trim()
              : null,
            is_active: true,
            notes: body.notes || null,
          },
          { onConflict: "provider,service_id,country_code" }
        )
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, item: data });
    }

    if (body.action === "toggle_manual") {
      const { error } = await admin
        .from("sms_manual_services")
        .update({ is_active: !!body.is_active })
        .eq("id", body.id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (body.action === "delete_manual") {
      const { error } = await admin
        .from("sms_manual_services")
        .delete()
        .eq("id", body.id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
