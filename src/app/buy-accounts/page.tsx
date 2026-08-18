"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
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
  const [title, setTitle] = useState("Buy Social Media Accounts");
  const [subtitle, setSubtitle] = useState("");
  const [groups, setGroups] = useState<{ category: string; items: Item[] }[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<{
    text?: string | null;
    link?: string | null;
    message?: string;
  } | null>(null);
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [logoText, setLogoText] = useState("SWIFTVERIFY");
  const [logoUrl, setLogoUrl] = useState("");

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
        setGroups(data.groups || []);
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
  }, []);

  const buy = async (item: Item) => {
    if (!user) {
      alert("Please log in from the Dashboard first, then return here to buy.");
      window.location.href = "/dashboard";
      return;
    }
    if (
      !confirm(
        `Buy "${item.name}" for ₦${item.priceNaira.toLocaleString()}?\n\nAmount will be deducted from your wallet.`
      )
    )
      return;

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
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBuyingId(null);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied!");
    } catch {
      alert("Could not copy — select the text manually.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header
        logoText={logoText}
        logoUrl={logoUrl || undefined}
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
          <p className="text-sm text-gray-600 mt-1 mb-6">{subtitle}</p>
        )}

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
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
                    className="text-xs text-red-600 font-semibold underline"
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
                className="inline-block text-sm text-red-600 font-semibold underline"
              >
                Open download link
              </a>
            )}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-500">Loading products…</p>
        ) : groups.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-gray-500">
            No accounts listed yet. Admin needs to sync and activate products.
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map((g) => (
              <section key={g.category}>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  {g.category}
                </h2>
                <div className="space-y-3">
                  {g.items.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900">{item.name}</p>
                        {item.description && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                            {item.description.replace(/<[^>]+>/g, " ").slice(0, 160)}
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
                          onClick={() => buy(item)}
                          className="bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-semibold px-4 py-2 rounded-lg"
                        >
                          {buyingId === item.id ? "Buying…" : "Buy"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
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
    </div>
  );
}
