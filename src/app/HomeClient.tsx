"use client";

import Header from "@/components/Header";
import OrderWidget from "@/components/OrderWidget";
import WalletCard from "@/components/WalletCard";
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

export default function HomeClient({ settings }: { settings: InitialSettings }) {
  return (
    <PurchaseFlow>
      {({ onBuy, onFund, user, currentStep, openAuth }) => (
        <div className="min-h-screen flex flex-col bg-white">
          <Header
            logoText={settings.logoText}
            logoUrl={settings.logoUrl}
            menuItems={settings.menuItems}
            isLoggedIn={!!user}
            username={user?.username}
            balance={user?.balance}
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
                <div className="w-full max-w-xl mx-auto lg:mx-0 order-1">
                  <OrderWidget onBuy={onBuy} />
                </div>

                {user && (
                  <div className="w-full max-w-xs mx-auto lg:mx-0 order-2">
                    <WalletCard
                      username={user.username}
                      balance={user.balance}
                      onFund={onFund}
                      announcement={
                        settings.announcementEnabled
                          ? settings.announcement
                          : undefined
                      }
                    />
                  </div>
                )}
              </div>

              {!user &&
                settings.announcementEnabled &&
                settings.announcement && (
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
      )}
    </PurchaseFlow>
  );
}
