"use client";

import Header from "@/components/Header";
import OrderWidget from "@/components/OrderWidget";
import WalletCard from "@/components/WalletCard";
import StatusFeed from "@/components/StatusFeed";
import Footer from "@/components/Footer";
import PurchaseFlow from "@/components/PurchaseFlow";

export default function HomePage() {
  const logoText = "SWIFTVERIFY.NG";
  const headline = "GET INSTANT VIRTUAL NUMBERS FOR VERIFICATION";
  const subtitle =
    "WhatsApp, Telegram, OpenAI, and 1200+ other services. Quick. Reliable. Paid with Naira.";
  const announcement =
    "NOTICE: New US WhatsApp numbers added. High success rates!";

  return (
    <PurchaseFlow>
      {({ onBuy, user, refreshUser, currentStep, activeOrder }) => (
        <div className="min-h-screen flex flex-col bg-white">
          <Header
            logoText={logoText}
            isLoggedIn={!!user}
            username={user?.username}
            balance={user?.balance}
          />

          <main className="flex-1">
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-6">
              <div className="text-center mb-10">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-black mb-3">
                  {headline}
                </h1>
                <p className="text-sm sm:text-base text-gray-600 max-w-2xl mx-auto">
                  {subtitle}
                </p>
              </div>

              <div className="flex flex-col lg:flex-row items-start justify-center gap-8 lg:gap-12">
                <div className="w-full max-w-xl order-2 lg:order-1">
                  <OrderWidget onBuy={onBuy} />
                </div>

                <div className="w-full max-w-xs order-1 lg:order-2 lg:pt-2">
                  <WalletCard
                    username={user?.username || "guest"}
                    balance={user?.balance || 0}
                    announcement={announcement}
                    onFund={() => {
                      // Simple fund: open Paystack for a fixed amount or prompt
                      if (!user) {
                        alert("Please login or buy a number to fund your wallet.");
                        return;
                      }
                      // Re-use purchase flow logic by triggering a fund-only path
                      // For simplicity we show a prompt; production would open a FundModal
                      const amount = prompt("Enter amount to fund (₦):", "1000");
                      if (amount && !isNaN(Number(amount)) && Number(amount) > 0) {
                        // Trigger via a minimal service object or dedicated fund endpoint
                        window.location.href = `/fund?amount=${amount}`;
                      }
                    }}
                  />
                </div>
              </div>

              <StatusFeed currentStep={currentStep} />
            </section>
          </main>

          <Footer />
        </div>
      )}
    </PurchaseFlow>
  );
}
