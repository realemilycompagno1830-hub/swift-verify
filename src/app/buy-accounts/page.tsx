"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ConfirmModal from "@/components/ConfirmModal";
import { createClient } from "@/lib/supabase/client";

type Item = {
  id: string;
  name: string;
  description: string;
  category: string;
  imageUrl?: string;
  stock: number;
  priceNaira: number;
};

export default function BuyAccountsPage() {
  const router = useRouter();
  const [title, setTitle] = useState("Buy Social Media Accounts");
  const [subtitle, setSubtitle] = useState("");
  const [groups, setGroups] = useState<{ category: string; items: Item[] }[]>(
    []
  );
  const [activeCat, setActiveCat] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [pendingItem, setPendingItem] = useState<Item | null>(null);
  const [delivery, setDelivery] = useState<{
    text?: string | null;
    link?: string | null;
    message?: string;
  } | null>(null);
  const [user, setUser] = useState<{ id: string } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ? { id: data.user.id } : null);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/accounts/products");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load");
        if (cancelled) return;
        setTitle(data.page?.title || "Buy Social Media Accounts");
        setSubtitle(data.page?.subtitle || "");
        const g = data.groups || [];
        setGroups(g);
        if (g.length && !activeCat) {
          setActiveCat(g[0].category);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentItems = useMemo(() => {
    if (!groups.length) return [];
    const g = groups.find((x) => x.category === activeCat) || groups[0];
    return g?.items || [];
  }, [groups, activeCat]);

  const askBuy = (item: Item) => {
    if (!user) {
      setError("Please log in first, then return here to buy.");
      return;
    }
    setPendingItem(item);
  };

  const doBuy = async () => {
    const item = pendingItem;
    setPendingItem(null);
    if (!item) return;

    setBuyingId(item.id);
    setDelivery(null);
    setError(null);
    try {
      const res = await fetch("/api/accounts/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: item.id, quantity: 1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purchase failed");

      setDelivery({
        text: data.deliveryText,
        link: data.deliveryLink,
        message: data.message,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBuyingId(null);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setError(null);
    } catch {
      setError("Could not copy — select the text manually.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header
        logoText="SWIFTVERIFY"
        isLoggedIn={!!user}
        menuItems={[
          { label: "SMS Verification", url: "/" },
          { label: "Buy Accounts", url: "/buy-accounts" },
          { label: "Dashboard", url: "/dashboard" },
        ]}
      />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && (
          <p className="text-sm text-gray-600 mt-1 mb-4">{subtitle}</p>
        )}

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
            {!user && (
              <div className="mt-2">
                <Link href="/dashboard" className="underline font-medium">
                  Go to login / dashboard
                </Link>
              </div>
            )}
          </div>
        )}

        {delivery && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-green-800">
              {delivery.message || "Order complete"}
            </p>
            {delivery.text && (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-green-700">Credentials</span>
                  <button
                    type="button"
                    onClick={() => copyText(delivery.text!)}
                    className="text-xs bg-red-600 text-white px-3 py-1 rounded-md font-semibold"
                  >
                    Copy
                  </button>
                </div>
                <pre className="text-xs bg-white border border-green-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
                  {delivery.text}
                </pre>
              </div>
            )}
            {delivery.link && (
              <a
                href={delivery.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-sm bg-white border border-green-300 text-green-800 font-semibold px-3 py-2 rounded-lg"
              >
                Open download link
              </a>
            )}
            <button
              type="button"
              onClick={() => router.push("/dashboard?tab=accounts")}
              className="w-full sm:w-auto bg-red-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg"
            >
              View in my purchase history
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-500">Loading products…</p>
        ) : groups.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-500">
            No accounts listed yet. Admin needs to sync and activate products.
          </div>
        ) : (
          <>
            {/* Horizontal category tabs */}
            <div className="mb-5 -mx-1 overflow-x-auto">
              <div className="flex gap-2 px-1 pb-1 min-w-max">
                {groups.map((g) => {
                  const active = (activeCat || groups[0]?.category) === g.category;
                  return (
                    <button
                      key={g.category}
                      type="button"
                      onClick={() => setActiveCat(g.category)}
                      className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                        active
                          ? "bg-red-600 text-white shadow-sm"
                          : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {g.category}
                      <span
                        className={`ml-1.5 text-xs ${
                          active ? "text-red-100" : "text-gray-400"
                        }`}
                      >
                        ({g.items.length})
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Products for selected category */}
            <div className="space-y-3">
              {currentItems.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  No products in this category right now.
                </p>
              ) : (
                currentItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {item.description
                            .replace(/<[^>]+>/g, " ")
                            .slice(0, 160)}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        Stock: {item.stock}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-bold text-gray-900">
                        ₦{item.priceNaira.toLocaleString()}
                      </span>
                      <button
                        type="button"
                        disabled={buyingId === item.id}
                        onClick={() => askBuy(item)}
                        className="bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-semibold px-4 py-2 rounded-lg"
                      >
                        {buyingId === item.id ? "Buying…" : "Buy"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        <p className="text-xs text-gray-400 mt-8 text-center">
          Need wallet funds?{" "}
          <Link href="/dashboard" className="text-red-600 underline">
            Open Dashboard
          </Link>
        </p>
      </main>

      <Footer
        paymentGateways={[]}
        companyLinks={[]}
        servicesLinks={[]}
        supportLinks={[]}
        copyright="© 2026 SWIFTVERIFY. All Rights Reserved."
      />

      <ConfirmModal
        open={!!pendingItem}
        title="Confirm purchase"
        message={
          pendingItem
            ? `Buy "${pendingItem.name}" for ₦${pendingItem.priceNaira.toLocaleString()}?\n\nThis amount will be deducted from your wallet.`
            : ""
        }
        confirmLabel="Buy now"
        cancelLabel="Cancel"
        onConfirm={doBuy}
        onCancel={() => setPendingItem(null)}
      />
    </div>
  );
}
