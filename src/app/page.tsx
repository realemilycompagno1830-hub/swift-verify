import { createClient } from "@/lib/supabase/server";
import HomeClient from "./HomeClient";

export const dynamic = "force-dynamic";

async function getSettings() {
  const defaults = {
    logoText: "SWIFTVERIFY.NG",
    logoUrl: "",
    headline: "GET INSTANT VIRTUAL NUMBERS FOR VERIFICATION",
    subtitle:
      "WhatsApp, Telegram, OpenAI, and 1200+ other services. Quick. Reliable. Paid with Naira.",
    announcement: "NOTICE: New US WhatsApp numbers added. High success rates!",
    announcementEnabled: true,
    menuItems: [
      { label: "Home", url: "/" },
      { label: "SMS Verification", url: "/" },
      { label: "Buy Accounts", url: "/accounts" },
      { label: "Gift Cards", url: "/gift-cards" },
    ],
    footerData: {
      company: [
        { label: "About Us", url: "/about" },
        { label: "Contact", url: "/contact" },
      ],
      services: [
        { label: "SMS Verification", url: "/" },
        { label: "Virtual Numbers", url: "/" },
      ],
      support: [
        { label: "FAQ", url: "/faq" },
        { label: "Support Ticket", url: "/support" },
        { label: "WhatsApp Status", url: "/status" },
      ],
      copyright: "© 2026 SWIFTVERIFY.NG. All Rights Reserved.",
      payment_gateways: ["paystack", "monnify"],
    },
  };

  try {
    const supabase = await createClient();

    const [
      { data: brand },
      { data: headline },
      { data: announcement },
      { data: footer },
      { data: menus },
    ] = await Promise.all([
      supabase.from("site_settings").select("value").eq("key", "brand").single(),
      supabase.from("site_settings").select("value").eq("key", "headline").single(),
      supabase.from("site_settings").select("value").eq("key", "announcement").single(),
      supabase.from("site_settings").select("value").eq("key", "footer").single(),
      supabase
        .from("menus")
        .select("*")
        .eq("location", "header")
        .eq("is_active", true)
        .order("sort_order"),
    ]);

    return {
      logoText: brand?.value?.logo_text || defaults.logoText,
      logoUrl: brand?.value?.logo_url || "",
      headline: headline?.value?.title || defaults.headline,
      subtitle: headline?.value?.subtitle || defaults.subtitle,
      announcement: announcement?.value?.message || defaults.announcement,
      announcementEnabled: announcement?.value?.enabled !== false,
      menuItems:
        menus && menus.length > 0
          ? menus.map((m: any) => ({
              label: m.label,
              url: m.url,
              is_external: m.is_external,
            }))
          : defaults.menuItems,
      footerData: footer?.value
        ? { ...defaults.footerData, ...footer.value }
        : defaults.footerData,
    };
  } catch (e) {
    console.error("Failed to load settings on server:", e);
    return defaults;
  }
}

export default async function HomePage() {
  const settings = await getSettings();
  return <HomeClient settings={settings} />;
}
