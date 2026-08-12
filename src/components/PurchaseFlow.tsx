"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ServiceOption } from "./OrderWidget";
import AuthModal from "./AuthModal";

declare global {
  interface Window {
    PaystackPop?: any;
  }
}

interface ActiveOrder {
  id: string;
  phone_number: string | null;
  status: string;
  otp_code: string | null;
  service_name: string;
  country_code: string;
  cost_naira: number;
  expires_at: string | null;
}

interface PurchaseFlowProps {
  children: (props: {
    onBuy: (service: ServiceOption) => void;
    user: { id: string; email: string; username: string; balance: number } | null;
    refreshUser: () => Promise<void>;
    currentStep: number;
    activeOrder: ActiveOrder | null;
    openAuth: () => void;
  }) => React.ReactNode;
}

export default function PurchaseFlow({ children }: PurchaseFlowProps) {
  const [user, setUser] = useState<{
    id: string;
    email: string;
    username: string;
    balance: number;
  } | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [pendingService, setPendingService] = useState<ServiceOption | null>(null);
  const [currentStep, setCurrentStep] = useState(-1);
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshUser = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      setUser(null);
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, balance, email")
      .eq("id", authUser.id)
      .single();

    setUser({
      id: authUser.id,
      email: authUser.email || "",
      username: profile?.username || authUser.email?.split("@")[0] || "user",
      balance: Number(profile?.balance || 0),
    });
  }, []);

  useEffect(() => {
    refreshUser();
    if (!document.getElementById("paystack-script")) {
      const script = document.createElement("script");
      script.id = "paystack-script";
      script.src = "https://js.paystack.co/v1/inline.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, [refreshUser]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (orderId: string) => {
    stopPolling();
    setCurrentStep(2);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}/check`, {
          method: "POST",
        });
        const data = await res.json();
        if (data.status === "completed" && data.otp_code) {
          setActiveOrder((prev) =>
            prev
              ? {
                  ...prev,
                  status: "completed",
                  otp_code: data.otp_code,
                  phone_number: data.phone_number || prev.phone_number,
                }
              : null
          );
          setCurrentStep(3);
          setStatusMessage("OTP received!");
          stopPolling();
        } else if (
          data.status === "cancelled" ||
          data.status === "expired" ||
          data.status === "refunded"
        ) {
          setActiveOrder((prev) =>
            prev ? { ...prev, status: data.status } : null
          );
          setStatusMessage(
            `Order ${data.status}. Balance refunded if applicable.`
          );
          setCurrentStep(-1);
          stopPolling();
          refreshUser();
        } else if (data.phone_number) {
          setActiveOrder((prev) =>
            prev
              ? {
                  ...prev,
                  phone_number: data.phone_number,
                  status: "waiting_sms",
                }
              : null
          );
          setCurrentStep(2);
        }
      } catch (e) {
        console.error("Poll error", e);
      }
    }, 3000);
  };

  const executePurchase = async (service: ServiceOption, userId: string) => {
    setError(null);
    setStatusMessage(null);
    setCurrentStep(0);

    try {
      const supabase = createClient();
      const { data: profile } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", userId)
        .single();

      const balance = Number(profile?.balance || 0);
      const price = service.finalNaira;

      if (balance < price) {
        setStatusMessage(
          `Insufficient balance. Funding ₦${price.toLocaleString()}…`
        );
        await initiatePaystack(price, service, userId);
        return;
      }

      await doPurchase(service);
    } catch (e: any) {
      setError(e.message || "Purchase failed");
      setCurrentStep(-1);
    }
  };

  const initiatePaystack = (
    amountNaira: number,
    service: ServiceOption,
    userId: string
  ) => {
    return new Promise<void>((resolve, reject) => {
      if (!window.PaystackPop) {
        reject(
          new Error("Paystack script not loaded. Refresh and try again.")
        );
        return;
      }

      const handler = window.PaystackPop.setup({
        key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
        email: user?.email || "customer@swiftverify.ng",
        amount: Math.round(amountNaira * 100),
        currency: "NGN",
        ref: `SV_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        metadata: {
          user_id: userId,
          purpose: "wallet_fund",
          service_name: service.serviceName,
          country_code: service.countryCode,
          intended_price: amountNaira,
        },
        callback: async (response: any) => {
          try {
            const res = await fetch("/api/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                reference: response.reference,
                amount: amountNaira,
              }),
            });
            const data = await res.json();
            if (!res.ok)
              throw new Error(data.error || "Payment verification failed");

            await refreshUser();
            setStatusMessage("Wallet funded. Placing order…");
            await doPurchase(service);
            resolve();
          } catch (err: any) {
            setError(err.message);
            setCurrentStep(-1);
            reject(err);
          }
        },
        onClose: () => {
          setStatusMessage("Payment cancelled");
          setCurrentStep(-1);
          resolve();
        },
      });
      handler.openIframe();
    });
  };

  const doPurchase = async (service: ServiceOption) => {
    setCurrentStep(0);
    const res = await fetch("/api/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceName: service.serviceName,
        serviceId: service.serviceId,
        countryCode: service.countryCode,
        countryName: service.countryName,
        priceNaira: service.finalNaira,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to place order");

    setActiveOrder({
      id: data.orderId,
      phone_number: data.phone_number || null,
      status: data.status || "waiting_sms",
      otp_code: null,
      service_name: service.serviceName,
      country_code: service.countryCode,
      cost_naira: service.finalNaira,
      expires_at: data.expires_at || null,
    });

    setCurrentStep(1);
    await refreshUser();

    if (data.phone_number) {
      setCurrentStep(2);
    }

    startPolling(data.orderId);
  };

  const handleBuy = async (service: ServiceOption) => {
    setPendingService(service);
    setError(null);

    if (!user) {
      setAuthOpen(true);
      return;
    }

    await executePurchase(service, user.id);
  };

  const handleAuthSuccess = async (authUser: {
    id: string;
    email: string;
    username: string;
  }) => {
    setAuthOpen(false);
    await refreshUser();
    const supabase = createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("balance")
      .eq("id", authUser.id)
      .single();

    const fullUser = {
      ...authUser,
      balance: Number(profile?.balance || 0),
    };
    setUser(fullUser);

    if (pendingService) {
      await executePurchase(pendingService, authUser.id);
      setPendingService(null);
    }
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  return (
    <>
      {children({
        onBuy: handleBuy,
        user,
        refreshUser,
        currentStep,
        activeOrder,
        openAuth: () => setAuthOpen(true),
      })}

      <AuthModal
        open={authOpen}
        onClose={() => {
          setAuthOpen(false);
          setPendingService(null);
        }}
        onSuccess={handleAuthSuccess}
        title="Quick Signup to Buy"
      />

      {(activeOrder || statusMessage || error) && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:w-96 z-50">
          <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-4">
            {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
            {statusMessage && (
              <p className="text-sm text-gray-700 mb-2">{statusMessage}</p>
            )}
            {activeOrder && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Service</span>
                  <span className="font-medium">
                    {activeOrder.service_name} ({activeOrder.country_code})
                  </span>
                </div>
                {activeOrder.phone_number && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Number</span>
                    <span className="font-mono font-semibold text-lg">
                      {activeOrder.phone_number}
                    </span>
                  </div>
                )}
                {activeOrder.otp_code && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                    <p className="text-xs text-green-700 mb-1">OTP CODE</p>
                    <p className="text-2xl font-bold tracking-widest text-green-800">
                      {activeOrder.otp_code}
                    </p>
                  </div>
                )}
                {activeOrder.status === "waiting_sms" &&
                  !activeOrder.otp_code && (
                    <p className="text-xs text-amber-600 animate-pulse">
                      Waiting for SMS… (auto-cancels after ~15 min)
                    </p>
                  )}
                <button
                  onClick={() => {
                    stopPolling();
                    setActiveOrder(null);
                    setStatusMessage(null);
                    setError(null);
                    setCurrentStep(-1);
                  }}
                  className="text-xs text-gray-500 underline mt-2"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
