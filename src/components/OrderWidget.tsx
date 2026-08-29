"use client";

import { useState, useEffect, useMemo, useRef } from "react";

export interface ServiceOption {
  serviceId: string;
  serviceName: string;
  countryCode: string;
  countryName: string;
  finalNaira: number;
  label: string;
  baseUsd?: number;
  mode?: "voip" | "real";
  providerHint?: string;
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
  _provider?: string;
}

interface OrderWidgetProps {
  onBuy: (service: ServiceOption) => void;
  disabled?: boolean;
}

const FLAG_MAP: Record<string, string> = {
  US: "🇺🇸",
  GB: "🇬🇧",
  UK: "🇬🇧",
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
  BD: "🇧🇩",
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
  const [numberMode, setNumberMode] = useState<"voip" | "real">("voip");

  const [selectedService, setSelectedService] = useState<ServiceItem | null>(
    null
  );
  const [selectedCountry, setSelectedCountry] = useState<CountryItem | null>(
    null
  );
  const [serviceQuery, setServiceQuery] = useState("");
  const [countryQuery, setCountryQuery] = useState("");
  const [serviceOpen, setServiceOpen] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [checkingStock, setCheckingStock] = useState(false);
  const [stockMessage, setStockMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);

  const serviceWrapRef = useRef<HTMLDivElement>(null);
  const countryWrapRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (serviceWrapRef.current && !serviceWrapRef.current.contains(t)) {
        setServiceOpen(false);
      }
      if (countryWrapRef.current && !countryWrapRef.current.contains(t)) {
        setCountryOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Load master service list once
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/services?mode=${numberMode}`);
        if (!res.ok) throw new Error("Failed to load services");
        const data = await res.json();
        if (cancelled) return;

        setServices(data.services || []);
        setAllCountries(data.countries || []);
        setOverrides(data.overrides || {});
        setGlobalMarkup(data.globalMarkup || 150);
        setUsdNgnRate(data.usdNgnRate || 1600);
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
  }, [numberMode]);

  // When service changes → load countries with stock
  useEffect(() => {
    if (!selectedService) {
      setAvailableCountries([]);
      setSelectedCountry(null);
      setCountryQuery("");
      setStockMessage(null);
      return;
    }

    let cancelled = false;

    async function checkStock() {
      setCheckingStock(true);
      setStockMessage(null);
      setSelectedCountry(null);
      setCountryQuery("");

      try {
        const q = encodeURIComponent(
          selectedService!.name || selectedService!.id
        );
        const res = await fetch(
          `/api/services/availability?service=${q}&mode=${numberMode}`
        );
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
          finalNaira: Number(c.priceNaira ?? c.finalNaira ?? 0),
          successRate: c.successRate ?? c.success_rate,
          priceUsd: c.priceUsd ?? c.costUsd,
          _provider: c._provider,
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
  }, [selectedService, allCountries, numberMode]);

  const filteredServices = useMemo(() => {
    const q = serviceQuery.trim().toLowerCase();
    if (!q) return services.slice(0, 40);
    return services
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 40);
  }, [services, serviceQuery]);

  const filteredCountries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    if (!q) return availableCountries;
    const aliases: Record<string, string[]> = {
      us: ["usa", "united states", "america"],
      uk: ["england", "united kingdom", "gb"],
      gb: ["england", "united kingdom", "uk"],
    };
    return availableCountries.filter((c) => {
      const name = c.name.toLowerCase();
      const code = c.code.toLowerCase();
      if (name.includes(q) || code.includes(q)) return true;
      for (const [k, vals] of Object.entries(aliases)) {
        if (q.includes(k) || vals.some((v) => q.includes(v))) {
          if (code === k || vals.some((v) => name.includes(v) || code.includes(v.replace(/\s/g, ""))))
            return true;
        }
      }
      return false;
    });
  }, [availableCountries, countryQuery]);

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

  const pickService = (s: ServiceItem) => {
    setSelectedService(s);
    setServiceQuery(s.name);
    setServiceOpen(false);
  };

  const pickCountry = (c: CountryItem) => {
    setSelectedCountry(c);
    setCountryQuery(
      `${FLAG_MAP[c.code] || "🏳️"} ${c.name}${
        typeof c.successRate === "number" && c.successRate > 0
          ? ` (${c.successRate}%)`
          : ""
      }`
    );
    setCountryOpen(false);
  };

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
        mode: numberMode,
        providerHint: selectedCountry._provider,
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
        {/* SERVICE — one searchable box */}
        <div ref={serviceWrapRef} className="relative">

        {/* Number type: VOIP vs Real — no supplier names */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Number type</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setNumberMode("voip");
                setSelectedService(null);
                setSelectedCountry(null);
                setServiceQuery("");
                setCountryQuery("");
              }}
              className={`rounded-xl border px-3 py-2.5 text-left transition ${
                numberMode === "voip"
                  ? "border-red-500 bg-red-50 ring-1 ring-red-500"
                  : "border-gray-200 bg-white"
              }`}
            >
              <span className="block text-sm font-semibold text-gray-900">
                Virtual / VOIP
              </span>
              <span className="block text-xs text-gray-500 mt-0.5">
                Cheaper · faster · may fail more often
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setNumberMode("real");
                setSelectedService(null);
                setSelectedCountry(null);
                setServiceQuery("");
                setCountryQuery("");
              }}
              className={`rounded-xl border px-3 py-2.5 text-left transition ${
                numberMode === "real"
                  ? "border-red-500 bg-red-50 ring-1 ring-red-500"
                  : "border-gray-200 bg-white"
              }`}
            >
              <span className="block text-sm font-semibold text-gray-900">
                Real numbers
              </span>
              <span className="block text-xs text-gray-500 mt-0.5">
                Higher success · costs more
              </span>
            </button>
          </div>
          <p className="text-xs text-gray-500 leading-snug">
            {numberMode === "voip"
              ? "Virtual numbers are budget-friendly but codes can fail. We auto-pick the stronger source when both have stock."
              : "Real SIM-style numbers cost more but usually deliver codes more reliably."}
          </p>
        </div>

          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Service
          </label>
          <input
            type="text"
            placeholder="Type to search (WhatsApp, Facebook, Instagram…)"
            value={serviceQuery}
            onChange={(e) => {
              setServiceQuery(e.target.value);
              setServiceOpen(true);
              // If they clear or edit away from selection, drop selection
              if (
                selectedService &&
                e.target.value.trim().toLowerCase() !==
                  selectedService.name.toLowerCase()
              ) {
                setSelectedService(null);
              }
            }}
            onFocus={() => setServiceOpen(true)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            autoComplete="off"
          />
          {serviceOpen && filteredServices.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
              {filteredServices.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`w-full text-left px-3 py-2.5 text-sm hover:bg-red-50 ${
                      selectedService?.id === s.id
                        ? "bg-red-50 text-red-700 font-medium"
                        : "text-gray-800"
                    }`}
                    onClick={() => pickService(s)}
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-gray-400 mt-1">
            {services.length} services · type to filter
          </p>
        </div>

        {/* COUNTRY — one searchable box */}
        <div ref={countryWrapRef} className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Country
            {checkingStock && (
              <span className="ml-2 text-xs text-amber-600 font-normal">
                Checking stock…
              </span>
            )}
          </label>
          <input
            type="text"
            placeholder={
              !selectedService
                ? "Choose a service first"
                : checkingStock
                ? "Checking available countries…"
                : noStock
                ? "No countries in stock"
                : "Type to search (United States, UK, Nigeria…)"
            }
            value={countryQuery}
            disabled={!selectedService || checkingStock || noStock}
            onChange={(e) => {
              setCountryQuery(e.target.value);
              setCountryOpen(true);
              if (selectedCountry) {
                const label = selectedCountry.name.toLowerCase();
                if (!e.target.value.trim().toLowerCase().includes(label)) {
                  setSelectedCountry(null);
                }
              }
            }}
            onFocus={() => {
              if (selectedService && !checkingStock && !noStock) {
                setCountryOpen(true);
              }
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-50 disabled:text-gray-400"
            autoComplete="off"
          />
          {countryOpen &&
            selectedService &&
            !checkingStock &&
            !noStock &&
            filteredCountries.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                {filteredCountries.map((c) => (
                  <li key={c.code}>
                    <button
                      type="button"
                      className={`w-full text-left px-3 py-2.5 text-sm hover:bg-red-50 ${
                        selectedCountry?.code === c.code
                          ? "bg-red-50 text-red-700 font-medium"
                          : "text-gray-800"
                      }`}
                      onClick={() => pickCountry(c)}
                    >
                      {FLAG_MAP[c.code] || "🏳️"} {c.name}
                      {typeof c.successRate === "number" &&
                      c.successRate > 0
                        ? ` · ${c.successRate}% success`
                        : ""}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          {countryOpen &&
            selectedService &&
            !checkingStock &&
            !noStock &&
            filteredCountries.length === 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-500 shadow-lg">
                No country matches your search
              </div>
            )}
          {!checkingStock && availableCountries.length > 0 && (
            <p className="text-xs text-green-700 mt-1">
              {availableCountries.length} countr
              {availableCountries.length === 1 ? "y" : "ies"} with stock
              (higher success rates only)
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
