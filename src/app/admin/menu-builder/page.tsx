"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface MenuItem {
  id: string;
  location: string;
  label: string;
  url: string;
  is_external: boolean;
  sort_order: number;
  is_active: boolean;
}

const LOCATIONS = [
  { value: "header", label: "Header Navigation" },
  { value: "footer_company", label: "Footer – Company" },
  { value: "footer_services", label: "Footer – Services" },
  { value: "footer_support", label: "Footer – Support" },
];

export default function MenuBuilderPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [activeLocation, setActiveLocation] = useState("header");

  // New item form
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [isExternal, setIsExternal] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("menus")
      .select("*")
      .order("sort_order");
    setItems(data || []);
    setLoading(false);
  }

  const filtered = items
    .filter((i) => i.location === activeLocation)
    .sort((a, b) => a.sort_order - b.sort_order);

  async function addItem() {
    if (!label.trim() || !url.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const maxOrder = filtered.reduce((m, i) => Math.max(m, i.sort_order), 0);
      const { data, error } = await supabase
        .from("menus")
        .insert({
          location: activeLocation,
          label: label.trim(),
          url: url.trim(),
          is_external: isExternal,
          sort_order: maxOrder + 1,
          is_active: true,
        })
        .select()
        .single();
      if (error) throw error;
      setItems((prev) => [...prev, data]);
      setLabel("");
      setUrl("");
      setIsExternal(false);
      setMessage("Link added");
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateItem(id: string, patch: Partial<MenuItem>) {
    setSaving(true);
    try {
      const { error } = await supabase.from("menus").update(patch).eq("id", id);
      if (error) throw error;
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, ...patch } : i))
      );
      setMessage("Updated");
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(id: string) {
    if (!confirm("Remove this link?")) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("menus").delete().eq("id", id);
      if (error) throw error;
      setItems((prev) => prev.filter((i) => i.id !== id));
      setMessage("Removed");
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function moveItem(id: string, direction: "up" | "down") {
    const list = [...filtered];
    const idx = list.findIndex((i) => i.id === id);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= list.length) return;

    const a = list[idx];
    const b = list[swapIdx];
    // Swap sort_order
    await Promise.all([
      updateItem(a.id, { sort_order: b.sort_order }),
      updateItem(b.id, { sort_order: a.sort_order }),
    ]);
  }

  if (loading) return <div className="text-gray-500">Loading menus…</div>;

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Menu Builder</h2>
        <p className="text-sm text-gray-500 mt-1">
          Edit header and footer links. Changes appear on the public site
          immediately.
        </p>
      </div>

      {message && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-4 py-2">
          {message}
        </div>
      )}

      {/* Location tabs */}
      <div className="flex flex-wrap gap-2">
        {LOCATIONS.map((loc) => (
          <button
            key={loc.value}
            onClick={() => setActiveLocation(loc.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeLocation === loc.value
                ? "bg-red-600 text-white"
                : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {loc.label}
          </button>
        ))}
      </div>

      {/* Current items */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-sm">
            {LOCATIONS.find((l) => l.value === activeLocation)?.label}
          </h3>
        </div>
        <div className="divide-y divide-gray-100">
          {filtered.map((item, idx) => (
            <div
              key={item.id}
              className="px-5 py-3 flex flex-wrap items-center gap-3"
            >
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => moveItem(item.id, "up")}
                  disabled={idx === 0}
                  className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveItem(item.id, "down")}
                  disabled={idx === filtered.length - 1}
                  className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
              <div className="flex-1 min-w-[180px] space-y-1">
                <input
                  value={item.label}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((i) =>
                        i.id === item.id ? { ...i, label: e.target.value } : i
                      )
                    )
                  }
                  onBlur={() =>
                    updateItem(item.id, { label: item.label })
                  }
                  className="w-full border border-gray-200 rounded px-2 py-1 text-sm font-medium"
                />
                <input
                  value={item.url}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((i) =>
                        i.id === item.id ? { ...i, url: e.target.value } : i
                      )
                    )
                  }
                  onBlur={() => updateItem(item.id, { url: item.url })}
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-gray-600"
                />
              </div>
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                <input
                  type="checkbox"
                  checked={item.is_external}
                  onChange={(e) =>
                    updateItem(item.id, { is_external: e.target.checked })
                  }
                />
                External
              </label>
              <button
                onClick={() => deleteItem(item.id)}
                className="text-xs text-red-600 hover:underline"
              >
                Delete
              </button>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="px-5 py-6 text-center text-gray-400 text-sm">
              No links in this section yet.
            </p>
          )}
        </div>
      </div>

      {/* Add new */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-sm mb-4">Add Link</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Gift Cards"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="/gift-cards or https://…"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 mt-3 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={isExternal}
            onChange={(e) => setIsExternal(e.target.checked)}
          />
          External URL (opens in new tab)
        </label>
        <button
          onClick={addItem}
          disabled={saving || !label || !url}
          className="mt-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
        >
          Add Link
        </button>
      </div>
    </div>
  );
}
