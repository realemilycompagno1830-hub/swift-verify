"use client";

import { useState, useEffect } from "react";

export interface ServiceOption {
  serviceId: string;
  serviceName: string;
  countryCode: string;
  countryName: string;
  finalNaira: number;
  label: string;
  baseUsd?: number;
}

export interface CountryOption {
  code: string;
  name: string;
  id?: string | number;
  flag?: string;
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
};

export default function OrderWidget({ onBuy, disabled }: OrderWidgetProps) {
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [selectedService, setSelectedService] = useState<ServiceOption | null>(null);
  const [selectedCountryCode, setSelectedCountryCode] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);

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

        const svc: ServiceOption[] = data.services || [];
        setServices(svc);
        setCountries(
          (data.countries || []).map((c: any) => ({
            code: c.code,
            name: c.name,
            id: c.id,
            flag: FLAG_MAP[c.code] || "🏳️",
          }))
        );

        if (svc.length > 0) {
          setSelectedService(svc[0]);
          setSelectedCountryCode(svc[0].countryCode);
        }
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

  const filteredServices =
    selectedCountryCode
      ? services.filter((s) => s.countryCode === selectedCountryCode)
      : services;

  useEffect(() => {
    if (filteredServices.length > 0) {
      const stillValid = filteredServices.find(
        (s) => s.label === selectedService?.label
      );
      if (!stillValid) {
        setSelectedService(filteredServices[0]);
      }
    }
  }, [selectedCountryCode, services]);

  const handleBuy = async () => {
    if (!selectedService || disabled || buying) return;
    setBuying(true);
    try {
      await onBuy(selectedService);
    } finally {
      setBuying(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 max-w-2xl w-full animate-pulse">
        <div className="h-10 bg-gray-100 rounded mb-4" />
        <div className="h-10 bg-gray-100 rounded mb-6" />
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

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 max-w-2xl w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Service
          </label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white"
            value={selectedService?.label || ""}
            onChange={(e) => {
              const svc = services.find((s) => s.label === e.target.value);
              if (svc) {
                setSelectedService(svc);
                setSelectedCountryCode(svc.countryCode);
              }
            }}
          >
            {(filteredServices.length ? filteredServices : services).map((s) => (
              <option key={s.label} value={s.label}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Country
          </label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white"
            value={selectedCountryCode}
            onChange={(e) => setSelectedCountryCode(e.target.value)}
          >
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedService && (
        <p className="text-xs text-gray-500 mb-3 text-center">
          Price:{" "}
          <span className="font-semibold text-black">
            ₦{selectedService.finalNaira.toLocaleString()}
          </span>
        </p>
      )}

      <button
        onClick={handleBuy}
        disabled={!selectedService || disabled || buying}
        className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-lg text-base transition-colors"
      >
        {buying ? "Processing…" : "BUY NUMBER"}
      </button>
    </div>
  );
}
