"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import OrderWidget from "@/components/OrderWidget";
import WalletCard from "@/components/WalletCard";
import StatusFeed from "@/components/StatusFeed";
import Footer from "@/components/Footer";
import PurchaseFlow from "@/components/PurchaseFlow";
import { createClient } from "@/lib/supabase/client";

export default function HomePage() {
  const [settings, setSettings] = useState({
    logoText: "SWIFTVERIFY.NG",
    headline: "GET INSTANT VIRTUAL NUMBERS FOR VERIFICATION",
    subtitle:
      "WhatsApp, Telegram, OpenAI, and 1200+ other services. Quick. Reliable. Paid with Naira.",
    announcement: "NOTICE: New US WhatsApp numbers added. High success rates!",
    announcementEnabled: true,
  });

  const [menuItems, setMenuItems] = useState([
    { label: "Home", url: "/" },
    { label: "SMS Verification", url: "/" },
    { label: "Buy Accounts", url: "/accounts" },
    { label: "Gift Cards", url: "/gift-cards" },
  ]);

  const [footerData, setFooterData] = useState({
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
  });

  useEffect(() => {
    async function loadSettings() {
      try {
        const supabase = createClient();

        const [{ data: brand }, { data: headline }, { data: announcement }, { data: footer }, { data: menus }] =
          await Promise.all([
            supabase.from("site_settings").select("value").eq("key", "brand").single(),
            supabase.from("site_settings").select("value").eq("key", "headline").single(),
            supabase.from("site_settings").select("value").eq("key", "announcement").single(),
            supabase.from("site_settings").select("value").eq("key", "footer").single(),
            supabase.from("menus").select("*").eq("location", "header").eq("is_active", true).order("sort_order"),
          ]);

        setSettings((prev) => ({
          logoText: brand?.value?.logo_text || prev.logoText,
          headline: headline?.value?.title || prev.headline,
          subtitle: headline?.value?.subtitle || prev.subtitle,
          announcement: announcement?.value?.message || prev.announcement,
          announcementEnabled: announcement?.value?.enabled !== false,
        }));

        if (footer?.value) {
          setFooterData((prev) => ({ ...prev, ...footer.value }));
        }

        if (menus && menus.length > 0) {
          setMenuItems(
            menus.map((m: any) => ({
              label: m.label,
              url: m.url,
              is_external: m.is_external,
            }))
          );
        }
      } catch (e) {
        console.error("Failed to load settings", e);
      }
    }

    loadSettings();
  }, []);

  return (
    <PurchaseFlow>
      {({ onBuy, user, currentStep, openAuth }) => (
        <div className="min-h-screen flex flex-col bg-white">
          <Header
            logoText={settings.logoText}
            menuItems={menuItems}
            isLoggedIn={!!user}
            username={user?.username}
            balance={user?.balance}
            onLoginClick={openAuth}
          />

          <main className="flex-1">
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-6">
              {/* Headline */}
              <div className="text-center mb-8">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-black mb-3">
                  {settings.headline}
                </h1>
                <p className="text-sm sm:text-base text-gray-600 max-w-2xl mx-auto">
                  {settings.subtitle}
                </p>
              </div>

              {/* Main content - better mobile order */}
              <div className="flex flex-col lg:flex-row items-stretch justify-center gap-6 lg:gap-10">
                {/* Order Widget - always first on mobile */}
                <div className="w-full max-w-xl mx-auto lg:mx-0 order-1">
                  <OrderWidget onBuy={onBuy} />
                </div>

                {/* Wallet Card - only show when logged in */}
                {user && (
                  <div className="w-full max-w-xs mx-auto lg:mx-0 order-2">
                    <WalletCard
                      username={user.username}
                      balance={user.balance}
                      announcement={
                        settings.announcementEnabled ? settings.announcement : undefined
                      }
                    />
                  </div>
                )}
              </div>

              {/* Announcement for guests (when no wallet card) */}
              {!user && settings.announcementEnabled && settings.announcement && (
                <div className="mt-6 max-w-xl mx-auto text-center">
                  <p className="text-xs text-gray-600 border-l-2 border-red-500 pl-3 inline-block text-left">
                    {settings.announcement}
                  </p>
                </div>
              )}

              <StatusFeed currentStep={currentStep} />
            </section>
          </main>

          <Footer
            companyLinks={footerData.company}
            servicesLinks={footerData.services}
            supportLinks={footerData.support}
            copyright={footerData.copyright}
            paymentGateways={footerData.payment_gateways}
          />
        </div>
      )}
    </PurchaseFlow>
  );
}
