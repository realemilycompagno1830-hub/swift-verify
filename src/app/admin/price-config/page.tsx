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
}

export default function PriceConfigPage() {
  const [globalMarkup, setGlobalMarkup] = useState(150);
  const [fivesimMarkup, setFivesimMarkup] = useState(100);
  const [rubNgnRate, setRubNgnRate] = useState(18);
  const [overrideProvider, setOverrideProvider] = useState<'smspool' | 'fivesim'>('smspool');
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // New override form
  const [newService, setNewService] = useState("WhatsApp");
  // overrideProvider state declared above
  const [newCountry, setNewCountry] = useState("US");
  const [newCountryName, setNewCountryName] = useState("United States");
  const [newPrice, setNewPrice] = useState("");

  const supabase = createClient();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [{ data: marginRow }, { data: fiveRow }, { data: ovr }] = await Promise.all([
        supabase.from("site_settings").select("value").eq("key", "global_margin").maybeSingle(),
        supabase.from("site_settings").select("value").eq("key", "fivesim_margin").maybeSingle(),
        supabase.from("price_overrides").select("*").order("service_name"),
      ]);

      if (marginRow?.value?.markup_percent != null) {
        setGlobalMarkup(Number(marginRow.value.markup_percent));
      }
      if (fiveRow?.value?.markup_percent != null) {
        setFivesimMarkup(Number(fiveRow.value.markup_percent));
      }
      if (fiveRow?.value?.rub_ngn_rate != null) {
        setRubNgnRate(Number(fiveRow.value.rub_ngn_rate));
      }
      setOverrides(ovr || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function saveGlobalMargin() {
    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase.from("site_settings").upsert({
        key: "global_margin",
        value: { markup_percent: globalMarkup, mode: "add_to_base" },
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      setMessage("Global margin saved");
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
        value: { markup_percent: fivesimMarkup, rub_ngn_rate: rubNgnRate },
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      setMessage("5sim margin saved");
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
      const { data, error } = await supabase
        .from("price_overrides")
        .upsert(
          {
            service_name: newService.trim(),
            country_code: newCountry.trim().toUpperCase(),
            country_name: newCountryName.trim() || null,
            override_price_naira: Number(newPrice),
            provider: overrideProvider,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "service_name,country_code" }
        )
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
          const copy = [...prev];
          copy[idx] = data;
          return copy;
        }
        return [...prev, data];
      });
      setNewPrice("");
      setMessage("Override saved");
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateOverride(id: string, price: number) {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("price_overrides")
        .update({
          override_price_naira: price,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
      setOverrides((prev) =>
        prev.map((o) =>
          o.id === id ? { ...o, override_price_naira: price } : o
        )
      );
      setMessage("Price updated");
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

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          Price Configuration & Overrides
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          SMSPool markup applies only when SMS Provider is set to SMSPool. Use the 5sim section below when using 5sim.net. Overrides force a
          fixed ₦ price regardless of upstream changes.
        </p>
      </div>

      {message && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-4 py-2">
          {message}
        </div>
      )}

      {/* Global Margin */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="font-semibold mb-4">Global Profit Margin</h3>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Markup %
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={globalMarkup}
                onChange={(e) => setGlobalMarkup(Number(e.target.value))}
                className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                min={0}
                step={5}
              />
              <span className="text-sm text-gray-500">%</span>
            </div>
          </div>
          <div className="text-sm text-gray-500 pb-2">
            Mode: Add to Base (base USD × rate × (1 + markup%))
          </div>
          <button
            onClick={saveGlobalMargin}
            disabled={saving}
            className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
          >
            Save Margin
          </button>
        </div>
      </div>

      {/* Add Override */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="font-semibold mb-4">Add / Update Service Override</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
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
            <label className="block text-xs text-gray-500 mb-1">Country Code</label>
            <input
              value={newCountry}
              onChange={(e) => setNewCountry(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="US"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Country Name</label>
            <input
              value={newCountryName}
              onChange={(e) => setNewCountryName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="United States"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Final ₦ Price</label>
            <input
              type="number"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="800"
            />
          </div>
          <button
            onClick={addOverride}
            disabled={saving || !newPrice}
            className="bg-black hover:bg-gray-800 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
          >
            Save Override
          </button>
        </div>
      </div>

      {/* Existing Overrides */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-sm">Service & Country Overrides</h3>
          <span className="text-xs text-gray-500">{overrides.length} rules</span>
        </div>
        <div className="divide-y divide-gray-100">
          {overrides.map((o) => (
            <div
              key={o.id || `${o.service_name}-${o.country_code}`}
              className="px-6 py-4 flex flex-wrap items-center gap-4"
            >
              <div className="flex-1 min-w-[140px]">
                <p className="font-medium text-sm">
                  {o.service_name}{" "}
                  <span className="text-gray-400 font-normal">
                    ({o.country_code})
                  </span>
                </p>
                <p className="text-xs text-gray-500">{o.country_name}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">₦</span>
                <input
                  type="number"
                  defaultValue={o.override_price_naira ?? ""}
                  onBlur={(e) => {
                    const val = Number(e.target.value);
                    if (o.id && val > 0 && val !== o.override_price_naira) {
                      updateOverride(o.id, val);
                    }
                  }}
                  className="w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                />
              </div>
              <button
                onClick={() => o.id && deleteOverride(o.id)}
                className="text-xs text-red-600 hover:underline"
              >
                Delete
              </button>
            </div>
          ))}
          {overrides.length === 0 && (
            <p className="px-6 py-8 text-center text-gray-400 text-sm">
              No overrides yet. Add one above.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
