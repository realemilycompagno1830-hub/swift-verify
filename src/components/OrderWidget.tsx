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
  finalNaira?: number;
  successRate?: number;
  priceUsd?: number;
}

interface OrderWidgetProps {
  onBuy: (service: ServiceOption) => void;
  disabled?: boolean;
}

const FLAG_MAP: Record<string, string> = {
  US: "🇺🇸",
  GB: "🇬🇧",
  NG: "🇳🇬",
  CA: "🇨🇦",
  AU: "🇦🇺",
  DE: "🇩🇪",
  FR: "🇫🇷",
  NL: "🇳🇱",
  IN: "🇮🇳",
  PH: "🇵🇭",
  ID: "🇮🇩",
  BR: "🇧🇷",
  MX: "🇲🇽",
  ES: "🇪🇸",
  IT: "🇮🇹",
  PL: "🇵🇱",
  UA: "🇺🇦",
  KE: "🇰🇪",
  ZA: "🇿🇦",
  GH: "🇬🇭",
  RU: "🇷🇺",
  TR: "🇹🇷",
  SE: "🇸🇪",
  NO: "🇳🇴",
  FI: "🇫🇮",
  DK: "🇩🇰",
  IE: "🇮🇪",
  PT: "🇵🇹",
  RO: "🇷🇴",
  CZ: "🇨🇿",
  HU: "🇭🇺",
  AT: "🇦🇹",
  CH: "🇨🇭",
  BE: "🇧🇪",
  GR: "🇬🇷",
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
  return 0.15;
}

function fallbackPrice(
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
  const [allCountries, setAllCountries] = useState<CountryItem[]>([]);
  const [availableCountries, setAvailableCountries] = useState<CountryItem[]>(
    []
  );
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [globalMarkup, setGlobalMarkup] = useState(150);
  const [usdNgnRate, setUsdNgnRate] = useState(1600);

  const [selectedService, setSelectedService] = useState<ServiceItem | null>(
    null
  );
  const [selectedCountry, setSelectedCountry] = useState<CountryItem | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [checkingStock, setCheckingStock] = useState(false);
  const [stockMessage, setStockMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [serviceSearch, setServiceSearch] = useState("");

  // Load master service list once
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
        setAllCountries(data.countries || []);
        setOverrides(data.overrides || {});
        setGlobalMarkup(data.globalMarkup || 150);
        setUsdNgnRate(data.usdNgnRate || 1600);

        const wa = (data.services || []).find((s: ServiceItem) =>
          s.name.toLowerCase().includes("whatsapp")
        );
        if (wa) setSelectedService(wa);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Could not load services");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // When service changes → load countries that have stock/pricing for it
  useEffect(() => {
    if (!selectedService) {
      setAvailableCountries([]);
      setSelectedCountry(null);
      setStockMessage(null);
      return;
    }

    let cancelled = false;

    async function checkStock() {
      setCheckingStock(true);
      setStockMessage(null);
      setSelectedCountry(null);

      try {
        const q = encodeURIComponent(
          selectedService!.name || selectedService!.id
        );
        const res = await fetch(`/api/services/availability?service=${q}`);
        const data = await res.json();

        if (cancelled) return;

        if (!res.ok) {
          setAvailableCountries(allCountries);
          setStockMessage(
            "Could not verify stock. Showing all countries — purchase may still fail if out of stock."
          );
          return;
        }

        const list: CountryItem[] = (data.countries || []).map((c: any) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          finalNaira: c.finalNaira,
          successRate: c.successRate,
          priceUsd: c.priceUsd,
        }));

        if (list.length === 0) {
          setAvailableCountries([]);
          setStockMessage(
            data.message ||
              "No numbers available for this service right now. Try another service."
          );
        } else {
          setAvailableCountries(list);
          setStockMessage(null);
          // Prefer US if available, else first
          const us = list.find((c) => c.code === "US");
          setSelectedCountry(us || list[0]);
        }
      } catch {
        if (!cancelled) {
          setAvailableCountries(allCountries);
          setStockMessage(
            "Stock check failed. You can still try — if out of stock you will get a refund."
          );
        }
      } finally {
        if (!cancelled) setCheckingStock(false);
      }
    }

    checkStock();
    return () => {
      cancelled = true;
    };
  }, [selectedService, allCountries]);

  const filteredServices = useMemo(() => {
    if (!serviceSearch.trim()) return services;
    const q = serviceSearch.toLowerCase();
    return services.filter((s) => s.name.toLowerCase().includes(q));
  }, [services, serviceSearch]);

  const currentPrice = useMemo(() => {
    if (!selectedService || !selectedCountry) return 0;
    if (selectedCountry.finalNaira && selectedCountry.finalNaira > 0) {
      return selectedCountry.finalNaira;
    }
    return fallbackPrice(
      selectedService.name,
      selectedCountry.code,
      overrides,
      globalMarkup,
      usdNgnRate
    );
  }, [
    selectedService,
    selectedCountry,
    overrides,
    globalMarkup,
    usdNgnRate,
  ]);

  const handleBuy = async () => {
    if (!selectedService || !selectedCountry || disabled || buying) return;
    if (availableCountries.length === 0 && stockMessage) return;

    setBuying(true);
    try {
      const option: ServiceOption = {
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        countryCode: selectedCountry.code,
        countryName: selectedCountry.name,
        finalNaira: currentPrice,
        label: `${selectedService.name} (${selectedCountry.code}) - ₦${currentPrice.toLocaleString()}`,
        baseUsd: selectedCountry.priceUsd,
      };
      await onBuy(option);
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
        <button
          onClick={() => window.location.reload()}
          className="text-sm text-red-600 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const noStock =
    !!selectedService &&
    !checkingStock &&
    availableCountries.length === 0 &&
    !!stockMessage;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 sm:p-6 max-w-2xl w-full">
      <div className="space-y-4 mb-5">
        {/* Service */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Select Service
          </label>
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
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            {services.length} services listed
          </p>
        </div>

        {/* Country — only those with stock for selected service */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Select Country
            {checkingStock && (
              <span className="ml-2 text-xs text-amber-600 font-normal">
                Checking stock…
              </span>
            )}
          </label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white disabled:bg-gray-50"
            value={selectedCountry?.code || ""}
            disabled={!selectedService || checkingStock || noStock}
            onChange={(e) => {
              const c = availableCountries.find(
                (c) => c.code === e.target.value
              );
              setSelectedCountry(c || null);
            }}
          >
            <option value="">
              {!selectedService
                ? "-- Choose a service first --"
                : checkingStock
                ? "Checking available countries…"
                : noStock
                ? "No countries in stock"
                : "-- Choose a country --"}
            </option>
            {availableCountries.map((c) => (
              <option key={c.code} value={c.code}>
                {FLAG_MAP[c.code] || "🏳️"} {c.name}
                {typeof c.successRate === "number" && c.successRate > 0
                  ? ` (${c.successRate}% success)`
                  : ""}
              </option>
            ))}
          </select>
          {!checkingStock && availableCountries.length > 0 && (
            <p className="text-xs text-green-700 mt-1">
              {availableCountries.length} countr
              {availableCountries.length === 1 ? "y" : "ies"} with stock for
              this service
            </p>
          )}
        </div>
      </div>

      {stockMessage && (
        <div
          className={`text-sm rounded-lg px-3 py-2 mb-4 ${
            noStock
              ? "bg-amber-50 border border-amber-200 text-amber-800"
              : "bg-gray-50 border border-gray-200 text-gray-600"
          }`}
        >
          {stockMessage}
        </div>
      )}

      {selectedService && selectedCountry && !noStock && (
        <p className="text-center text-sm text-gray-600 mb-4">
          Price:{" "}
          <span className="font-bold text-black text-base">
            ₦{currentPrice.toLocaleString()}
          </span>
          {typeof selectedCountry.successRate === "number" &&
            selectedCountry.successRate > 0 && (
              <span className="text-xs text-gray-400 ml-2">
                · {selectedCountry.successRate}% success rate
              </span>
            )}
        </p>
      )}

      <button
        onClick={handleBuy}
        disabled={
          !selectedService ||
          !selectedCountry ||
          disabled ||
          buying ||
          checkingStock ||
          noStock ||
          currentPrice <= 0
        }
        className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-lg text-base transition-colors"
      >
        {buying
          ? "Processing…"
          : checkingStock
          ? "Checking stock…"
          : noStock
          ? "OUT OF STOCK"
          : "BUY NUMBER"}
      </button>
    </div>
  );
}
