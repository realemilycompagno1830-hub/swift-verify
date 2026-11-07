"use client";

import { useEffect, useState } from "react";

export default function PaymentsAdminPage() {
  const [active, setActive] = useState<"paystack" | "flutterwave">("paystack");
  const [env, setEnv] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/payment-provider");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setActive(data.active === "flutterwave" ? "flutterwave" : "paystack");
      setEnv(data.env || {});
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (next: "paystack" | "flutterwave") => {
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/admin/payment-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setActive(next);
      setMsg(data.message || "Saved");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-gray-500">Loading payment settings…</p>;
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payment Gateway</h1>
        <p className="text-sm text-gray-500 mt-1">
          Switch between Paystack and Flutterwave for wallet funding. Keys stay
          in Vercel — only the active gateway changes here.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => save("paystack")}
          className={`rounded-xl border p-4 text-left transition ${
            active === "paystack"
              ? "border-red-500 bg-red-50 ring-1 ring-red-500"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}
        >
          <p className="font-semibold text-gray-900">Paystack</p>
          <p className="text-xs text-gray-500 mt-1">
            Public: {env.paystackPublic ? "✓ set" : "✗ missing"} · Secret:{" "}
            {env.paystackSecret ? "✓ set" : "✗ missing"}
          </p>
          {active === "paystack" && (
            <p className="text-xs font-medium text-red-600 mt-2">Active now</p>
          )}
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={() => save("flutterwave")}
          className={`rounded-xl border p-4 text-left transition ${
            active === "flutterwave"
              ? "border-red-500 bg-red-50 ring-1 ring-red-500"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}
        >
          <p className="font-semibold text-gray-900">Flutterwave</p>
          <p className="text-xs text-gray-500 mt-1">
            Public: {env.flutterwavePublic ? "✓ set" : "✗ missing"} · Secret:{" "}
            {env.flutterwaveSecret ? "✓ set" : "✗ missing"}
          </p>
          {active === "flutterwave" && (
            <p className="text-xs font-medium text-red-600 mt-2">Active now</p>
          )}
        </button>
      </div>

      {msg && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          {msg}
        </p>
      )}
      {err && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {err}
        </p>
      )}

      <div className="text-xs text-gray-500 space-y-2 border-t pt-4">
        <p className="font-medium text-gray-700">Vercel environment variables</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <code>NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY</code>
          </li>
          <li>
            <code>PAYSTACK_SECRET_KEY</code>
          </li>
          <li>
            <code>NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY</code> (V3 public key,
            starts with FLWPUBK-)
          </li>
          <li>
            <code>FLUTTERWAVE_SECRET_KEY</code> (V3 secret key, starts with
            FLWSECK-)
          </li>
        </ul>
        <p>
          After adding keys in Vercel, redeploy once. Then use this page to
          switch gateways anytime.
        </p>
      </div>
    </div>
  );
}
