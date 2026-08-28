"use client";

import { useEffect, useState } from "react";

type Provider = "smspool" | "fivesim" | "smspva";

type Manual = {
  id: string;
  provider: string;
  service_id: string;
  service_name: string;
  country_code: string | null;
  country_name: string | null;
  is_active: boolean;
};

export default function SmsProviderAdminPage() {
  const [active, setActive] = useState<Provider>("smspool");
  const [manuals, setManuals] = useState<Manual[]>([]);
  const [env, setEnv] = useState({
    smspoolKeySet: false,
    fivesimKeySet: false,
    smspvaKeySet: false,
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [serviceId, setServiceId] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [countryName, setCountryName] = useState("");
  const [manualProvider, setManualProvider] = useState<Provider>("smspva");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/sms-provider");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Load failed");
      const a = data.provider?.active;
      setActive(
        a === "fivesim" || a === "smspva" || a === "smspool" ? a : "smspool"
      );
      setManuals(data.manuals || []);
      setEnv(
        data.env || {
          smspoolKeySet: false,
          fivesimKeySet: false,
          smspvaKeySet: false,
        }
      );
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const switchProvider = async (next: Provider) => {
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
      const labels: Record<Provider, string> = {
        smspool: "SMSPool",
        fivesim: "5sim.net",
        smspva: "SMSPVA",
      };
      setMsg(`Active provider: ${labels[next]} — all new SMS buys use this.`);
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

  const btn = (p: Provider, label: string, keyOk: boolean) => (
    <button
      type="button"
      disabled={saving}
      onClick={() => switchProvider(p)}
      className={`px-4 py-2.5 rounded-lg text-sm font-semibold border ${
        active === p
          ? "bg-red-600 text-white border-red-600"
          : "bg-white text-gray-800 border-gray-300"
      }`}
    >
      {label} {keyOk ? "" : "(key missing)"}
    </button>
  );

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">SMS Number Provider</h1>
        <p className="text-sm text-gray-500 mt-1">
          Choose where new virtual numbers are purchased from. Customers see one
          shop — you switch the supplier here.
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
              {btn("smspool", "SMSPool", env.smspoolKeySet)}
              {btn("fivesim", "5sim.net", env.fivesimKeySet)}
              {btn("smspva", "SMSPVA", env.smspvaKeySet)}
            </div>
            <p className="text-xs text-gray-500">
              Current: <strong>{active}</strong>. For SMSPVA add{" "}
              <code className="bg-gray-100 px-1 rounded">SMSPVA_API_KEY</code> in
              Vercel and redeploy.
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h2 className="font-semibold text-sm">Add service manually</h2>
            <p className="text-xs text-gray-500">
              SMSPVA uses codes like <code className="bg-gray-100 px-1">opt20</code>{" "}
              (Facebook), <code className="bg-gray-100 px-1">opt1</code> (WhatsApp).
              Country: US, UK, FR, DE…
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Provider</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={manualProvider}
                  onChange={(e) =>
                    setManualProvider(e.target.value as Provider)
                  }
                >
                  <option value="smspool">SMSPool</option>
                  <option value="fivesim">5sim.net</option>
                  <option value="smspva">SMSPVA</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">
                  Service ID / product slug
                </label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                  placeholder="e.g. opt20 or whatsapp"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Display name</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  placeholder="Facebook"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Country code (optional)</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  placeholder="UK"
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
                        body: JSON.stringify({
                          action: "delete_manual",
                          id: m.id,
                        }),
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
