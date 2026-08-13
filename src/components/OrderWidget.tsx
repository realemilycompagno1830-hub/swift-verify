"use client";

import { useState, useEffect, useMemo } from "react";

export interface ServiceOption {
  serviceId: string;
  serviceName: string;
  countryCode: string;
  countryName: string;
  finalNaira: number;
  label: string;
  baseUsd?: number;
}

interface ServiceItem {
  id: string;
  name: string;
}

interface CountryItem {
  id: string | number;
  code: string;
  name: string;
}

interface OrderWidgetProps {
  onBuy: (service: ServiceOption) => void;
  disabled?: boolean;
}

const FLAG_MAP: Record<string, string> = {
  US: "🇺🇸", GB: "🇬🇧", NG: "🇳🇬", CA: "🇨🇦", AU: "🇦🇺",
  DE: "🇩🇪", FR: "🇫🇷", NL: "🇳🇱", IN: "🇮🇳", PH: "🇵🇭",
  ID: "🇮🇩", BR: "🇧🇷", MX: "🇲🇽", ES: "🇪🇸", IT: "🇮🇹",
  PL: "🇵🇱", UA: "🇺🇦", KE: "🇰🇪", ZA: "🇿🇦", GH: "🇬🇭",
};

function estimateBaseUsd(serviceName: string): number {
  const n = serviceName.toLowerCase();
  if (n.includes("whatsapp")) return 0.35;
  if (n.includes("telegram")) return 0.08;
  if (n.includes("google")) return 0.2;
  if (n.includes("facebook") || n.includes("instagram")) return 0.18;
  if (n.includes("discord")) return 0.12;
  if (n.includes("tiktok")) return 0.15;
  if (n.includes("openai") || n.includes("chatgpt")) return 0.25;
  if (n.includes("microsoft") || n.includes("apple")) return 0.2;
  if (n.includes("uber") || n.includes("netflix")) return 0.22;
  if (n.includes("paypal") || n.includes("binance") || n.includes("coinbase")) return 0.3;
  return 0.15;
}

function calculatePrice(
  serviceName: string,
  countryCode: string,
  overrides: Record<string, number>,
  globalMarkup: number,
  usdNgnRate: number
): number {
  const key = `${serviceName.toLowerCase()}-${countryCode.toUpperCase()}`;
  if (overrides[key]) return overrides[key];
  const baseUsd = estimateBaseUsd(serviceName);
  return Math.ceil(baseUsd * usdNgnRate * (1 + globalMarkup / 100));
}

export default function OrderWidget({ onBuy, disabled }: OrderWidgetProps) {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [countries, setCountries] = useState<CountryItem[]>([]);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [globalMarkup, setGlobalMarkup] = useState(150);
  const [usdNgnRate, setUsdNgnRate] = useState(1600);
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<CountryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [serviceSearch, setServiceSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/services");
        if (!res.ok) throw new Error("Failed to load services");
        const data = await res.json();
        if (cancelled) return;
        setServices(data.services || []);
        setCountries(data.countries || []);
        setOverrides(data.overrides || {});
        setGlobalMarkup(data.globalMarkup || 150);
        setUsdNgnRate(data.usdNgnRate || 1600);
        const wa = (data.services || []).find((s: ServiceItem) => s.name.toLowerCase().includes("whatsapp"));
        const us = (data.countries || []).find((c: CountryItem) => c.code === "US");
        if (wa) setSelectedService(wa);
        if (us) setSelectedCountry(us);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Could not load services");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const filteredServices = useMemo(() => {
    if (!serviceSearch.trim()) return services;
    const q = serviceSearch.toLowerCase();
    return services.filter((s) => s.name.toLowerCase().includes(q));
  }, [services, serviceSearch]);

  const currentPrice = useMemo(() => {
    if (!selectedService || !selectedCountry) return 0;
    return calculatePrice(selectedService.name, selectedCountry.code, overrides, globalMarkup, usdNgnRate);
  }, [selectedService, selectedCountry, overrides, globalMarkup, usdNgnRate]);

  const handleBuy = async () => {
    if (!selectedService || !selectedCountry || disabled || buying) return;
    setBuying(true);
    try {
      await onBuy({
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        countryCode: selectedCountry.code,
        countryName: selectedCountry.name,
        finalNaira: currentPrice,
        label: `${selectedService.name} (${selectedCountry.code}) - ₦${currentPrice.toLocaleString()}`,
      });
    } finally {
      setBuying(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 max-w-2xl w-full animate-pulse">
        <div className="h-10 bg-gray-100 rounded mb-4" />
        <div className="h-10 bg-gray-100 rounded mb-4" />
        <div className="h-14 bg-gray-200 rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-xl p-6 max-w-2xl w-full text-center">
        <p className="text-red-600 text-sm mb-3">{error}</p>
        <button onClick={() => window.location.reload()} className="text-sm text-red-600 underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 sm:p-6 max-w-2xl w-full">
      <div className="space-y-4 mb-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Service</label>
          <input
            type="text"
            placeholder="Search service (e.g. Facebook, Instagram...)"
            value={serviceSearch}
            onChange={(e) => setServiceSearch(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
            value={selectedService?.id || ""}
            onChange={(e) => {
              const svc = services.find((s) => s.id === e.target.value);
              setSelectedService(svc || null);
            }}
          >
            <option value="">-- Choose a service --</option>
            {filteredServices.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">{services.length} services available</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Country</label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
            value={selectedCountry?.code || ""}
            onChange={(e) => {
              const c = countries.find((c) => c.code === e.target.value);
              setSelectedCountry(c || null);
            }}
          >
            <option value="">-- Choose a country --</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {FLAG_MAP[c.code] || "🏳️"} {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedService && selectedCountry && (
        <p className="text-center text-sm text-gray-600 mb-4">
          Price: <span className="font-bold text-black text-base">₦{currentPrice.toLocaleString()}</span>
        </p>
      )}

      <button
        onClick={handleBuy}
        disabled={!selectedService || !selectedCountry || disabled || buying || currentPrice <= 0}
        className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-lg text-base transition-colors"
      >
        {buying ? "Processing…" : "BUY NUMBER"}
      </button>
    </div>
  );
}
