"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export default function GlobalSettingsPage() {
  const [logoText, setLogoText] = useState("SWIFTVERIFY.NG");
  const [headline, setHeadline] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [announcementEnabled, setAnnouncementEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("site_settings")
      .select("key, value")
      .in("key", ["brand", "headline", "announcement"]);

    data?.forEach((row) => {
      if (row.key === "brand") {
        setLogoText(row.value?.logo_text || "SWIFTVERIFY.NG");
      }
      if (row.key === "headline") {
        setHeadline(row.value?.title || "");
        setSubtitle(row.value?.subtitle || "");
      }
      if (row.key === "announcement") {
        setAnnouncement(row.value?.message || "");
        setAnnouncementEnabled(row.value?.enabled !== false);
      }
    });
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const updates = [
        {
          key: "brand",
          value: { logo_text: logoText, logo_color: "#DC2626", site_name: "Swift Verify" },
        },
        {
          key: "headline",
          value: { title: headline, subtitle },
        },
        {
          key: "announcement",
          value: { enabled: announcementEnabled, message: announcement },
        },
      ];

      for (const u of updates) {
        const { error } = await supabase.from("site_settings").upsert({
          ...u,
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
      }
      setMessage("Settings saved");
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-gray-500">Loading settings…</div>;

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Global Settings</h2>
          <p className="text-sm text-gray-500 mt-1">
            Brand, homepage headline and announcement banner.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      {message && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-4 py-2">
          {message}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-sm">Brand / Logo Text</h3>
        <input
          value={logoText}
          onChange={(e) => setLogoText(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          placeholder="SWIFTVERIFY.NG"
        />
        <p className="text-xs text-gray-500">
          The part before the first dot is rendered in red.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-sm">Homepage Headline</h3>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Title</label>
          <input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Subtitle</label>
          <textarea
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Announcement</h3>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={announcementEnabled}
              onChange={(e) => setAnnouncementEnabled(e.target.checked)}
            />
            Enabled
          </label>
        </div>
        <textarea
          value={announcement}
          onChange={(e) => setAnnouncement(e.target.value)}
          rows={2}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          placeholder="NOTICE: New numbers added…"
        />
      </div>
    </div>
  );
}
