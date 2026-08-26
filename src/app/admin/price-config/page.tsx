"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface Override {
  id?: string;
  service_name: string;
  service_id: string | null;
  country_code: string;
  country_name: string | null;
  override_price_naira: number | null;
  custom_margin_percent: number | null;
  is_active: boolean;
  provider?: string | null;
}

export default function PriceConfigPage() {
  const [smspoolMarkup, setSmspoolMarkup] = useState(155);
  const [fivesimMarkup, setFivesimMarkup] = useState(100);
  const [fivesimUsdRate, setFivesimUsdRate] = useState(1600);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [newService, setNewService] = useState("WhatsApp");
  const [newCountry, setNewCountry] = useState("US");
  const [newCountryName, setNewCountryName] = useState("United States");
  const [newPrice, setNewPrice] = useState("");
  const [overrideProvider, setOverrideProvider] = useState<"smspool" | "fivesim">(
    "smspool"
  );

  const supabase = createClient();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [{ data: marginRow }, { data: fiveRow }, { data: ovr }] =
        await Promise.all([
          supabase
            .from("site_settings")
            .select("value")
            .eq("key", "global_margin")
            .maybeSingle(),
          supabase
            .from("site_settings")
            .select("value")
            .eq("key", "fivesim_margin")
            .maybeSingle(),
          supabase.from("price_overrides").select("*").order("service_name"),
        ]);

      if (marginRow?.value?.markup_percent != null) {
        setSmspoolMarkup(Number(marginRow.value.markup_percent));
      }
      if (fiveRow?.value?.markup_percent != null) {
        setFivesimMarkup(Number(fiveRow.value.markup_percent));
      }
      const rate =
        fiveRow?.value?.usd_ngn_rate ?? fiveRow?.value?.rub_ngn_rate;
      if (rate != null && Number(rate) > 100) {
        setFivesimUsdRate(Number(rate));
      }
      setOverrides(ovr || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function saveSmspoolMargin() {
    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase.from("site_settings").upsert({
        key: "global_margin",
        value: { markup_percent: smspoolMarkup, mode: "add_to_base" },
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      setMessage("SMSPool margin saved. Formula: USD × 1600 × (1 + markup/100)");
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveFivesimMargin() {
    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase.from("site_settings").upsert({
        key: "fivesim_margin",
        value: {
          markup_percent: fivesimMarkup,
          usd_ngn_rate: fivesimUsdRate,
        },
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      setMessage(
        "5sim margin saved. Formula: USD × rate × (1 + markup/100)"
      );
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function addOverride() {
    if (!newService || !newCountry || !newPrice) return;
    setSaving(true);
    setMessage(null);
    try {
      const row: any = {
        service_name: newService.trim(),
        country_code: newCountry.trim().toUpperCase(),
        country_name: newCountryName.trim() || null,
        override_price_naira: Number(newPrice),
        is_active: true,
        updated_at: new Date().toISOString(),
      };
      // provider column may exist after SQL patch
      row.provider = overrideProvider;

      const { data, error } = await supabase
        .from("price_overrides")
        .upsert(row, { onConflict: "service_name,country_code" })
        .select()
        .single();

      if (error) throw error;
      setOverrides((prev) => {
        const idx = prev.findIndex(
          (o) =>
            o.service_name === data.service_name &&
            o.country_code === data.country_code
        );
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = data;
          return next;
        }
        return [data, ...prev];
      });
      setMessage(`Override saved for ${overrideProvider}`);
      setNewPrice("");
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteOverride(id: string) {
    if (!confirm("Delete this override?")) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("price_overrides")
        .delete()
        .eq("id", id);
      if (error) throw error;
      setOverrides((prev) => prev.filter((o) => o.id !== id));
      setMessage("Deleted");
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-gray-500">Loading price configuration…</div>;
  }

  const exampleSmspool = Math.ceil(0.66 * 1600 * (1 + smspoolMarkup / 100));
  const exampleFive = Math.ceil(0.51 * fivesimUsdRate * (1 + fivesimMarkup / 100));

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          Price Configuration & Overrides
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Two separate settings: one for SMSPool, one for 5sim. The active
          provider on <strong>SMS Provider</strong> decides which margin is
          used on the shop.
        </p>
      </div>

      {message && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-4 py-2">
          {message}
        </div>
      )}

      {/* SMSPool */}
      <div className="bg-white border-2 border-red-100 rounded-xl p-6 space-y-3">
        <h3 className="font-semibold text-lg">1. SMSPool pricing</h3>
        <p className="text-xs text-gray-500">
          Used only when Active provider = <strong>SMSPool</strong>.
          Formula: base USD × 1600 × (1 + markup% / 100)
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Markup %</label>
            <input
              type="number"
              value={smspoolMarkup}
              onChange={(e) => setSmspoolMarkup(Number(e.target.value))}
              className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              min={0}
              step={5}
            />
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={saveSmspoolMargin}
            className="bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-lg"
          >
            Save SMSPool margin
          </button>
        </div>
        <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
          Example: $0.66 Facebook US →{" "}
          <strong>₦{exampleSmspool.toLocaleString()}</strong> at {smspoolMarkup}%
          markup
        </p>
      </div>

      {/* 5sim */}
      <div className="bg-white border-2 border-blue-100 rounded-xl p-6 space-y-3">
        <h3 className="font-semibold text-lg">2. 5sim.net pricing</h3>
        <p className="text-xs text-gray-500">
          Used only when Active provider = <strong>5sim.net</strong>.
          5sim costs are in USD. Formula: USD × rate × (1 + markup% / 100)
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Markup %</label>
            <input
              type="number"
              value={fivesimMarkup}
              onChange={(e) => setFivesimMarkup(Number(e.target.value))}
              className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              min={0}
              step={5}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              USD → NGN rate
            </label>
            <input
              type="number"
              value={fivesimUsdRate}
              onChange={(e) => setFivesimUsdRate(Number(e.target.value))}
              className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              min={100}
              step={10}
            />
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={saveFivesimMargin}
            className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg"
          >
            Save 5sim margin
          </button>
        </div>
        <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
          Example: $0.51 USA Facebook on 5sim →{" "}
          <strong>₦{exampleFive.toLocaleString()}</strong> at {fivesimMarkup}% /
          rate {fivesimUsdRate}
        </p>
      </div>

      {/* Overrides */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h3 className="font-semibold">3. Fixed ₦ overrides (optional)</h3>
        <p className="text-xs text-gray-500">
          Forces an exact Naira price for a service + country. Choose which
          provider the rule applies to.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Provider</label>
            <select
              value={overrideProvider}
              onChange={(e) =>
                setOverrideProvider(e.target.value as "smspool" | "fivesim")
              }
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="smspool">SMSPool</option>
              <option value="fivesim">5sim</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Service</label>
            <input
              value={newService}
              onChange={(e) => setNewService(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="WhatsApp"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Country code</label>
            <input
              value={newCountry}
              onChange={(e) => setNewCountry(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="US or USA"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Country name</label>
            <input
              value={newCountryName}
              onChange={(e) => setNewCountryName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="United States"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Final ₦</label>
            <input
              type="number"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="800"
            />
          </div>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={addOverride}
          className="bg-gray-900 text-white text-sm font-semibold px-4 py-2 rounded-lg"
        >
          Save override
        </button>

        <div className="border-t pt-4">
          <p className="text-sm font-medium mb-2">
            Active overrides ({overrides.length})
          </p>
          {overrides.length === 0 && (
            <p className="text-sm text-gray-400">No overrides yet.</p>
          )}
          <ul className="divide-y">
            {overrides.map((o) => (
              <li
                key={o.id}
                className="py-2 flex flex-wrap items-center gap-2 text-sm"
              >
                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                  {o.provider || "smspool"}
                </span>
                <span className="font-medium">{o.service_name}</span>
                <span className="text-gray-500">
                  {o.country_code} · ₦{Number(o.override_price_naira).toLocaleString()}
                </span>
                <button
                  type="button"
                  className="ml-auto text-red-600 text-xs"
                  onClick={() => o.id && deleteOverride(o.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
