"use client";

import { useEffect, useState } from "react";

type Manual = {
  id: string;
  provider: string;
  service_id: string;
  service_name: string;
  country_code: string | null;
  country_name: string | null;
  is_active: boolean;
  notes: string | null;
};

export default function SmsProviderAdminPage() {
  const [active, setActive] = useState<"smspool" | "fivesim">("smspool");
  const [manuals, setManuals] = useState<Manual[]>([]);
  const [env, setEnv] = useState({ smspoolKeySet: false, fivesimKeySet: false });
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [serviceId, setServiceId] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [countryName, setCountryName] = useState("");
  const [manualProvider, setManualProvider] = useState<"smspool" | "fivesim">("smspool");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/sms-provider");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Load failed");
      setActive(data.provider?.active === "fivesim" ? "fivesim" : "smspool");
      setManuals(data.manuals || []);
      setEnv(data.env || { smspoolKeySet: false, fivesimKeySet: false });
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const switchProvider = async (next: "smspool" | "fivesim") => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/sms-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_provider", active: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Switch failed");
      setActive(next);
      setMsg(
        next === "fivesim"
          ? "Active provider: 5sim.net — all new SMS buys use 5sim."
          : "Active provider: SMSPool — all new SMS buys use SMSPool."
      );
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setSaving(false);
    }
  };

  const addManual = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/sms-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_manual",
          provider: manualProvider,
          service_id: serviceId,
          service_name: serviceName,
          country_code: countryCode || null,
          country_name: countryName || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Add failed");
      setMsg(`Added ${serviceName} (${serviceId})`);
      setServiceId("");
      setServiceName("");
      setCountryCode("");
      setCountryName("");
      await load();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">SMS Number Provider</h1>
        <p className="text-sm text-gray-500 mt-1">
          Choose where new virtual numbers are purchased from. Customers only see one
          unified shop — you switch the supplier here.
        </p>
      </div>

      {msg && (
        <div className="text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800">
          {msg}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-sm">Active provider</h2>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => switchProvider("smspool")}
                className={`px-4 py-2.5 rounded-lg text-sm font-semibold border ${
                  active === "smspool"
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-white text-gray-800 border-gray-300"
                }`}
              >
                SMSPool {env.smspoolKeySet ? "" : "(key missing)"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => switchProvider("fivesim")}
                className={`px-4 py-2.5 rounded-lg text-sm font-semibold border ${
                  active === "fivesim"
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-white text-gray-800 border-gray-300"
                }`}
              >
                5sim.net {env.fivesimKeySet ? "" : "(key missing)"}
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Current: <strong>{active === "fivesim" ? "5sim.net" : "SMSPool"}</strong>
              . Add <code className="bg-gray-100 px-1 rounded">FIVESIM_API_KEY</code> in
              Vercel when using 5sim.
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-sm">Add service manually</h2>
            <p className="text-xs text-gray-500">
              Use this when a service/country does not appear automatically. Enter the
              provider&apos;s service ID (or product slug for 5sim, e.g.{" "}
              <code className="bg-gray-100 px-1">whatsapp</code>) and a display name.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Provider</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={manualProvider}
                  onChange={(e) =>
                    setManualProvider(e.target.value as "smspool" | "fivesim")
                  }
                >
                  <option value="smspool">SMSPool</option>
                  <option value="fivesim">5sim.net</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Service ID / product slug</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                  placeholder="e.g. whatsapp or 1012"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Display name</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  placeholder="WhatsApp"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Country code (optional)</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  placeholder="usa / 1 / england"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Country name (optional)</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={countryName}
                  onChange={(e) => setCountryName(e.target.value)}
                  placeholder="United States"
                />
              </div>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={addManual}
              className="bg-gray-900 text-white text-sm font-semibold px-4 py-2 rounded-lg"
            >
              Add service
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b text-sm font-semibold">
              Manual services ({manuals.length})
            </div>
            <div className="divide-y">
              {manuals.length === 0 && (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">
                  None yet
                </p>
              )}
              {manuals.map((m) => (
                <div
                  key={m.id}
                  className="px-4 py-3 flex flex-wrap items-center gap-3 text-sm"
                >
                  <span className="font-medium">{m.service_name}</span>
                  <span className="text-xs text-gray-500 font-mono">
                    {m.provider}:{m.service_id}
                  </span>
                  {m.country_code && (
                    <span className="text-xs text-gray-500">{m.country_code}</span>
                  )}
                  <label className="ml-auto flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={m.is_active}
                      onChange={async (e) => {
                        await fetch("/api/admin/sms-provider", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "toggle_manual",
                            id: m.id,
                            is_active: e.target.checked,
                          }),
                        });
                        await load();
                      }}
                    />
                    Active
                  </label>
                  <button
                    type="button"
                    className="text-xs text-red-600"
                    onClick={async () => {
                      await fetch("/api/admin/sms-provider", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "delete_manual", id: m.id }),
                      });
                      await load();
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
