"use client";

import { useEffect, useState } from "react";

/**
 * Admin page: SMS is locked to SMSPool only (simplified).
 */
export default function SmsProviderPage() {
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    // Force site setting to smspool so any leftover logic stays consistent
    (async () => {
      try {
        await fetch("/api/admin/sms-provider", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "set_provider", active: "smspool" }),
        });
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const lockToSmspool = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/sms-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_provider", active: "smspool" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setMsg("SMS provider is set to SMSPool only.");
    } catch (e: any) {
      setMsg(e.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">SMS Provider</h1>
        <p className="text-sm text-gray-500 mt-1">
          Your site uses <strong>SMSPool only</strong> for virtual numbers.
          Other providers (5sim, SMSPVA) have been turned off to keep things
          simple and stable.
        </p>
      </div>

      <div className="rounded-xl border border-green-200 bg-green-50 p-4">
        <p className="text-sm font-semibold text-green-900">Active: SMSPool</p>
        <p className="text-xs text-green-800 mt-1">
          Make sure <code className="bg-white px-1 rounded">SMSPOOL_API_KEY</code>{" "}
          is set in Vercel → Settings → Environment Variables, then redeploy.
        </p>
      </div>

      <button
        type="button"
        onClick={lockToSmspool}
        disabled={saving}
        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Confirm SMSPool only"}
      </button>

      {msg && (
        <p className="text-sm text-gray-700 bg-gray-50 border rounded-lg px-3 py-2">
          {msg}
        </p>
      )}

      <div className="text-xs text-gray-500 space-y-1 border-t pt-4">
        <p>
          • Prices: Admin → Price Config (SMSPool markup + overrides)
        </p>
        <p>
          • Numbers & OTP: SMSPool API only
        </p>
        <p>
          • Social media accounts (buy-accounts) are separate and still use
          your accounts supplier if configured
        </p>
      </div>
    </div>
  );
}
