"use client";

import { useEffect, useMemo, useState } from "react";
function calcNairaFromRub(
  costRub: number,
  rubNgnRate: number,
  markupPercent: number
): number {
  return Math.max(1, Math.ceil(costRub * rubNgnRate * (1 + markupPercent / 100)));
}

type Product = {
  id: string;
  darkstore_id: number;
  name: string;
  display_name: string | null;
  category_name: string | null;
  stock: number;
  cost_rub: number;
  override_price_naira: number | null;
  is_active: boolean;
  sort_order?: number;
};

export default function AdminAccountsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [pageTitle, setPageTitle] = useState("Buy Social Media Accounts");
  const [pageSubtitle, setPageSubtitle] = useState("");
  const [rate, setRate] = useState(18);
  const [markup, setMarkup] = useState(100);
  const [filter, setFilter] = useState("");
  const [onlyPreferred, setOnlyPreferred] = useState(true);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [manualId, setManualId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/accounts/update");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Load failed");
      setProducts(data.products || []);
      setPageTitle(data.page?.title || "Buy Social Media Accounts");
      setPageSubtitle(data.page?.subtitle || "");
      setRate(Number(data.pricing?.rub_ngn_rate ?? 18));
      setMarkup(Number(data.pricing?.markup_percent ?? 100));
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = products;
    const q = filter.trim().toLowerCase();

    // If searching by exact/partial ID, don't hide by preferred filter
    const lookingUpId = q !== "" && /^\d+$/.test(q);

    if (onlyPreferred && !lookingUpId) {
      list = list.filter((p) => {
        const text = `${p.name} ${p.category_name || ""}`.toLowerCase();
        return (
          text.includes("facebook") ||
          text.includes("instagram") ||
          text.includes("tiktok") ||
          text.includes("tik tok") ||
          text.includes("meta")
        );
      });
    }
    if (q) {
      list = list.filter((p) => {
        const idStr = String(p.darkstore_id);
        return (
          idStr.includes(q) ||
          p.name.toLowerCase().includes(q) ||
          (p.display_name || "").toLowerCase().includes(q) ||
          (p.category_name || "").toLowerCase().includes(q)
        );
      });
    }
    return [...list].sort(
      (a, b) =>
        (a.category_name || "").localeCompare(b.category_name || "") ||
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        a.name.localeCompare(b.name)
    );
  }, [products, filter, onlyPreferred]);

  const sync = async () => {
    setSyncing(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/accounts/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setMsg(data.message || `Synced ${data.upserted} products`);
      await load();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const addById = async () => {
    const id = manualId.trim();
    if (!id) {
      setMsg("Paste the DarkStore product ID first");
      return;
    }
    setAdding(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/accounts/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ darkstoreId: Number(id) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Add failed");
      const addedId = data.product?.darkstore_id || id;
      setMsg(
        (data.message || "Product added") +
          ` · Search box set to ID ${addedId}. Turn ON "On site" to sell it.`
      );
      setManualId("");
      setOnlyPreferred(false);
      setFilter(String(addedId));
      await load();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setAdding(false);
    }
  };

  const savePricing = async () => {
    const res = await fetch("/api/admin/accounts/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "pricing",
        rub_ngn_rate: rate,
        markup_percent: markup,
      }),
    });
    const data = await res.json();
    setMsg(res.ok ? "Pricing saved" : data.error);
  };

  const savePage = async () => {
    const res = await fetch("/api/admin/accounts/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "page",
        title: pageTitle,
        subtitle: pageSubtitle,
        enabled: true,
      }),
    });
    const data = await res.json();
    setMsg(res.ok ? "Page title saved" : data.error);
  };

  const toggle = async (p: Product) => {
    const next = !p.is_active;
    setProducts((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, is_active: next } : x))
    );
    await fetch("/api/admin/accounts/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, is_active: next }),
    });
  };

  const setOverride = async (p: Product, value: string) => {
    const num = value.trim() === "" ? null : Number(value);
    setProducts((prev) =>
      prev.map((x) =>
        x.id === p.id ? { ...x, override_price_naira: num as any } : x
      )
    );
    await fetch("/api/admin/accounts/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, override_price_naira: num }),
    });
  };

  /** Move product up/down within the current filtered list (same category preferred) */
  const moveProduct = async (p: Product, direction: "up" | "down") => {
    const cat = p.category_name || "Other";
    const same = products
      .filter((x) => (x.category_name || "Other") === cat)
      .sort(
        (a, b) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
          a.name.localeCompare(b.name)
      );
    const idx = same.findIndex((x) => x.id === p.id);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= same.length) return;

    const a = same[idx];
    const b = same[swapIdx];
    const orderA = a.sort_order ?? idx;
    const orderB = b.sort_order ?? swapIdx;

    // If both have same order, assign sequential
    let newA = orderB;
    let newB = orderA;
    if (orderA === orderB) {
      newA = direction === "up" ? orderA - 1 : orderA + 1;
      newB = orderA;
    }

    setProducts((prev) =>
      prev.map((x) => {
        if (x.id === a.id) return { ...x, sort_order: newA };
        if (x.id === b.id) return { ...x, sort_order: newB };
        return x;
      })
    );

    await Promise.all([
      fetch("/api/admin/accounts/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id, sort_order: newA }),
      }),
      fetch("/api/admin/accounts/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: b.id, sort_order: newB }),
      }),
    ]);
  };

  const setSortOrder = async (p: Product, value: string) => {
    const num = Number(value);
    if (Number.isNaN(num)) return;
    setProducts((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, sort_order: num } : x))
    );
    await fetch("/api/admin/accounts/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, sort_order: num }),
    });
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Account Products</h1>
        <p className="text-sm text-gray-500 mt-1">
          Sync from DarkStore, set prices, choose what appears on the site.
        </p>
      </div>

      {msg && (
        <div className="text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          {msg}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-sm">Page title (what users see)</h2>
        <input
          className="w-full border rounded-lg px-3 py-2 text-sm"
          value={pageTitle}
          onChange={(e) => setPageTitle(e.target.value)}
        />
        <input
          className="w-full border rounded-lg px-3 py-2 text-sm"
          placeholder="Subtitle"
          value={pageSubtitle}
          onChange={(e) => setPageSubtitle(e.target.value)}
        />
        <button
          onClick={savePage}
          className="text-sm bg-gray-900 text-white px-4 py-2 rounded-lg"
        >
          Save page text
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-sm">Pricing (RUB → NGN)</h2>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">
            RUB→NGN rate
            <input
              type="number"
              className="block border rounded-lg px-3 py-2 mt-1 w-28"
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
            />
          </label>
          <label className="text-sm">
            Markup %
            <input
              type="number"
              className="block border rounded-lg px-3 py-2 mt-1 w-28"
              value={markup}
              onChange={(e) => setMarkup(Number(e.target.value))}
            />
          </label>
        </div>
        <button
          onClick={savePricing}
          className="text-sm bg-gray-900 text-white px-4 py-2 rounded-lg"
        >
          Save pricing
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-sm">Add one product manually</h2>
        <p className="text-xs text-gray-500">
          On DarkStore, open the product page. The ID is in the URL or on the
          page (e.g. ID товара: 131458). Paste that number here.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            inputMode="numeric"
            className="border rounded-lg px-3 py-2 text-sm w-40"
            placeholder="e.g. 131458"
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
          />
          <button
            type="button"
            onClick={addById}
            disabled={adding}
            className="bg-gray-900 hover:bg-black disabled:bg-gray-400 text-white text-sm font-semibold px-4 py-2 rounded-lg"
          >
            {adding ? "Adding…" : "Add from DarkStore"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={sync}
          disabled={syncing}
          className="bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-semibold px-4 py-2.5 rounded-lg"
        >
          {syncing ? "Syncing from DarkStore…" : "Sync products from DarkStore"}
        </button>
        <input
          className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[160px]"
          placeholder="Search name or DarkStore ID…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <label className="text-sm flex items-center gap-2">
          <input
            type="checkbox"
            checked={onlyPreferred}
            onChange={(e) => setOnlyPreferred(e.target.checked)}
          />
          Facebook / Instagram / TikTok only
        </label>
      </div>

      <p className="text-xs text-gray-500">
        Showing {filtered.length} of {products.length} products
        {filter.trim() ? ` · filter: "${filter.trim()}"` : ""}
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2">On site</th>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">DS ID</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Stock</th>
                <th className="px-3 py-2">Cost ₽</th>
                <th className="px-3 py-2">Auto ₦</th>
                <th className="px-3 py-2">Override ₦</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const auto = calcNairaFromRub(Number(p.cost_rub), rate, markup);
                return (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={p.is_active}
                        onChange={() => toggle(p)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col items-center gap-0.5">
                        <button
                          type="button"
                          title="Move up"
                          onClick={() => moveProduct(p, "up")}
                          className="text-xs text-gray-500 hover:text-red-600 leading-none px-1"
                        >
                          ▲
                        </button>
                        <input
                          type="number"
                          className="border rounded w-12 text-center text-xs py-0.5"
                          value={p.sort_order ?? 0}
                          onChange={(e) =>
                            setProducts((prev) =>
                              prev.map((x) =>
                                x.id === p.id
                                  ? { ...x, sort_order: Number(e.target.value) }
                                  : x
                              )
                            )
                          }
                          onBlur={(e) => setSortOrder(p, e.target.value)}
                        />
                        <button
                          type="button"
                          title="Move down"
                          onClick={() => moveProduct(p, "down")}
                          className="text-xs text-gray-500 hover:text-red-600 leading-none px-1"
                        >
                          ▼
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">
                      {p.darkstore_id}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900 max-w-xs truncate">
                        {p.display_name || p.name}
                      </div>
                      <input
                        className="mt-1 w-full max-w-xs border rounded px-2 py-1 text-xs"
                        placeholder="Custom name on site (optional)"
                        defaultValue={p.display_name || ""}
                        onBlur={async (e) => {
                          const v = e.target.value.trim();
                          await fetch("/api/admin/accounts/update", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              id: p.id,
                              display_name: v,
                            }),
                          });
                        }}
                      />
                      <div className="text-xs text-gray-400 mt-0.5">
                        {p.category_name} · API: {p.name.slice(0, 40)}
                      </div>
                    </td>
                    <td className="px-3 py-2">{p.stock}</td>
                    <td className="px-3 py-2">{Number(p.cost_rub).toFixed(2)}</td>
                    <td className="px-3 py-2">₦{auto.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        className="border rounded px-2 py-1 w-24"
                        placeholder="auto"
                        defaultValue={p.override_price_naira ?? ""}
                        onBlur={(e) => setOverride(p, e.target.value)}
                      />
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                    No products match. Clear the search, or uncheck "Facebook / Instagram / TikTok only", or Sync / Add by ID.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
