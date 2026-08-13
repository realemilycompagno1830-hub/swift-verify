"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import OrderWidget from "@/components/OrderWidget";
import StatusFeed from "@/components/StatusFeed";
import Footer from "@/components/Footer";
import PurchaseFlow from "@/components/PurchaseFlow";

interface InitialSettings {
  logoText: string;
  logoUrl?: string;
  headline: string;
  subtitle: string;
  announcement: string;
  announcementEnabled: boolean;
  menuItems: { label: string; url: string; is_external?: boolean }[];
  footerData: {
    company: { label: string; url: string }[];
    services: { label: string; url: string }[];
    support: { label: string; url: string }[];
    copyright: string;
    payment_gateways: string[];
  };
}

function HomeContent({
  settings,
  onBuy,
  user,
  currentStep,
  openAuth,
}: {
  settings: InitialSettings;
  onBuy: any;
  user: any;
  currentStep: number;
  openAuth: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  // While redirecting logged-in users, show a short message
  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-gray-500 text-sm">Taking you to your dashboard…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header
        logoText={settings.logoText}
        logoUrl={settings.logoUrl}
        menuItems={settings.menuItems}
        isLoggedIn={false}
        onLoginClick={openAuth}
      />

      <main className="flex-1">
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-6">
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-black mb-3">
              {settings.headline}
            </h1>
            <p className="text-sm sm:text-base text-gray-600 max-w-2xl mx-auto">
              {settings.subtitle}
            </p>
          </div>

          <div className="flex flex-col lg:flex-row items-stretch justify-center gap-6 lg:gap-10">
            <div className="w-full max-w-xl mx-auto lg:mx-0">
              <OrderWidget onBuy={onBuy} />
            </div>
          </div>

          {settings.announcementEnabled && settings.announcement && (
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
        companyLinks={settings.footerData.company}
        servicesLinks={settings.footerData.services}
        supportLinks={settings.footerData.support}
        copyright={settings.footerData.copyright}
        paymentGateways={settings.footerData.payment_gateways}
      />
    </div>
  );
}

export default function HomeClient({ settings }: { settings: InitialSettings }) {
  return (
    <PurchaseFlow>
      {({ onBuy, user, currentStep, openAuth }) => (
        <HomeContent
          settings={settings}
          onBuy={onBuy}
          user={user}
          currentStep={currentStep}
          openAuth={openAuth}
        />
      )}
    </PurchaseFlow>
  );
}
