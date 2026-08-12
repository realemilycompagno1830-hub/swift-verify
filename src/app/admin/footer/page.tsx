"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface FooterLink {
  label: string;
  url: string;
}

interface FooterData {
  company: FooterLink[];
  services: FooterLink[];
  support: FooterLink[];
  copyright: string;
  payment_gateways: string[];
}

const DEFAULT: FooterData = {
  company: [
    { label: "About Us", url: "/about" },
    { label: "Contact", url: "/contact" },
  ],
  services: [
    { label: "SMS Verification", url: "/" },
    { label: "Virtual Numbers", url: "/" },
  ],
  support: [
    { label: "FAQ", url: "/faq" },
    { label: "Support Ticket", url: "/support" },
    { label: "WhatsApp Status", url: "/status" },
  ],
  copyright: "© 2026 SWIFTVERIFY.NG. All Rights Reserved.",
  payment_gateways: ["paystack", "monnify"],
};

export default function FooterEditorPage() {
  const [data, setData] = useState<FooterData>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data: row } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "footer")
      .single();
    if (row?.value) {
      setData({ ...DEFAULT, ...row.value });
    }
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase.from("site_settings").upsert({
        key: "footer",
        value: data,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      setMessage("Footer saved successfully");
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setSaving(false);
    }
  }

  function updateLink(
    section: "company" | "services" | "support",
    index: number,
    field: "label" | "url",
    value: string
  ) {
    setData((prev) => {
      const list = [...prev[section]];
      list[index] = { ...list[index], [field]: value };
      return { ...prev, [section]: list };
    });
  }

  function addLink(section: "company" | "services" | "support") {
    setData((prev) => ({
      ...prev,
      [section]: [...prev[section], { label: "New Link", url: "/" }],
    }));
  }

  function removeLink(section: "company" | "services" | "support", index: number) {
    setData((prev) => ({
      ...prev,
      [section]: prev[section].filter((_, i) => i !== index),
    }));
  }

  if (loading) return <div className="text-gray-500">Loading footer…</div>;

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Footer Editor</h2>
          <p className="text-sm text-gray-500 mt-1">
            Edit footer columns and copyright text.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg"
        >
          {saving ? "Saving…" : "Save Footer"}
        </button>
      </div>

      {message && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-4 py-2">
          {message}
        </div>
      )}

      {(["company", "services", "support"] as const).map((section) => (
        <div
          key={section}
          className="bg-white border border-gray-200 rounded-xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm uppercase tracking-wide">
              {section}
            </h3>
            <button
              onClick={() => addLink(section)}
              className="text-xs text-red-600 hover:underline"
            >
              + Add link
            </button>
          </div>
          <div className="space-y-3">
            {data[section].map((link, idx) => (
              <div key={idx} className="flex flex-wrap gap-2 items-center">
                <input
                  value={link.label}
                  onChange={(e) =>
                    updateLink(section, idx, "label", e.target.value)
                  }
                  className="flex-1 min-w-[120px] border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Label"
                />
                <input
                  value={link.url}
                  onChange={(e) =>
                    updateLink(section, idx, "url", e.target.value)
                  }
                  className="flex-1 min-w-[140px] border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="/path or https://"
                />
                <button
                  onClick={() => removeLink(section, idx)}
                  className="text-xs text-red-600 hover:underline px-2"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-sm mb-3">Copyright Text</h3>
        <input
          value={data.copyright}
          onChange={(e) =>
            setData((prev) => ({ ...prev, copyright: e.target.value }))
          }
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-sm mb-3">Payment Gateways shown</h3>
        <div className="flex gap-4">
          {["paystack", "monnify"].map((gw) => (
            <label key={gw} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={data.payment_gateways.includes(gw)}
                onChange={(e) => {
                  setData((prev) => ({
                    ...prev,
                    payment_gateways: e.target.checked
                      ? [...prev.payment_gateways, gw]
                      : prev.payment_gateways.filter((g) => g !== gw),
                  }));
                }}
              />
              {gw}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
