"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import OrderWidget from "@/components/OrderWidget";
import WalletCard from "@/components/WalletCard";
import PurchaseFlow from "@/components/PurchaseFlow";
import Footer from "@/components/Footer";

interface Order {
  id: string;
  service_name: string;
  country_code: string;
  phone_number: string | null;
  otp_code: string | null;
  status: string;
  cost_naira: number;
  created_at: string;
  expires_at: string | null;
  smspool_order_id?: string | null;
}

interface AccountOrder {
  id: string;
  product_name: string;
  quantity: number;
  cost_naira: number;
  status: string;
  delivery_text: string | null;
  delivery_link: string | null;
  created_at: string;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number | null;
  description: string | null;
  reference: string | null;
  gateway: string | null;
  created_at: string;
}

export default function UserDashboardPage() {
  const router = useRouter();
  const [booting, setBooting] = useState(true);
  const [username, setUsername] = useState("");
  const [balance, setBalance] = useState(0);
  const [role, setRole] = useState("user");
  const [orders, setOrders] = useState<Order[]>([]);
  const [accountOrders, setAccountOrders] = useState<AccountOrder[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tab, setTab] = useState<"orders" | "accounts" | "transactions">("orders");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [refreshingAccId, setRefreshingAccId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [logoText, setLogoText] = useState("SWIFTVERIFY");
  const [logoUrl, setLogoUrl] = useState("");
  const [footerData, setFooterData] = useState<{
    company: { label: string; url: string }[];
    services: { label: string; url: string }[];
    support: { label: string; url: string }[];
    copyright: string;
    payment_gateways: string[];
  }>({
    company: [],
    services: [],
    support: [],
    copyright: "© 2026 SWIFTVERIFY. All Rights Reserved.",
    payment_gateways: [],
  });
  const [menuItems, setMenuItems] = useState([
    { label: "Home", url: "/" },
    { label: "SMS Verification", url: "/" },
    { label: "Dashboard", url: "/dashboard" },
  ]);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("username, balance, role")
      .eq("id", user.id)
      .single();

    setUsername(profile?.username || user.email?.split("@")[0] || "User");
    setBalance(Number(profile?.balance || 0));
    setRole(profile?.role || "user");

    const [{ data: ordersData }, { data: txData }, { data: accData }, { data: menus }, { data: brandRow }, { data: footerRow }] =
      await Promise.all([
        supabase
          .from("orders")
          .select(
            "id, service_name, country_code, phone_number, otp_code, status, cost_naira, created_at, expires_at, smspool_order_id"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("transactions")
          .select(
            "id, type, amount, balance_after, description, reference, gateway, created_at"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("account_orders")
          .select(
            "id, product_name, quantity, cost_naira, status, delivery_text, delivery_link, created_at"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("menus")
          .select("*")
          .eq("location", "header")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("site_settings")
          .select("value")
          .eq("key", "brand")
          .single(),
        supabase
          .from("site_settings")
          .select("value")
          .eq("key", "footer")
          .single(),
      ]);

    if (brandRow?.value) {
      const b = brandRow.value as any;
      if (b.logo_text) setLogoText(b.logo_text);
      if (b.logo_url) setLogoUrl(b.logo_url);
    }

    if (footerRow?.value) {
      const f = footerRow.value as any;
      setFooterData({
        company: Array.isArray(f.company) ? f.company : [],
        services: Array.isArray(f.services) ? f.services : [],
        support: Array.isArray(f.support) ? f.support : [],
        copyright: f.copyright || "© 2026 SWIFTVERIFY. All Rights Reserved.",
        payment_gateways: Array.isArray(f.payment_gateways)
          ? f.payment_gateways
          : [],
      });
    }

    setOrders(ordersData || []);
    setAccountOrders(accData || []);
    setTransactions(txData || []);

    if (menus && menus.length > 0) {
      const items = menus.map((m: any) => ({
        label: m.label,
        url: m.url,
        is_external: m.is_external,
      }));
      // Ensure Dashboard is in the menu
      if (!items.some((i: any) => i.url === "/dashboard")) {
        items.push({ label: "Dashboard", url: "/dashboard", is_external: false });
      }
      setMenuItems(items);
    }

    setBooting(false);
  }, [router]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const cancelOrder = async (orderId: string) => {
    if (!confirm("Cancel this order and get a refund?")) return;
    setCancellingId(orderId);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/cancel`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cancel failed");
      setActionMessage(
        `Order cancelled. ₦${Number(data.refunded).toLocaleString()} refunded.`
      );
      await load();
    } catch (e: any) {
      setActionMessage(e.message || "Could not cancel order");
    } finally {
      setCancellingId(null);
    }
  };

  const resendOrder = async (orderId: string) => {
    if (
      !confirm(
        "Request another SMS code on this same number?\n\nOn the app (WhatsApp, Instagram, etc.), tap Resend code first, then wait here for the new OTP.\n\nNote: Resend is not always guaranteed by the provider."
      )
    )
      return;
    setResendingId(orderId);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/resend`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Resend failed");
      setActionMessage(
        data.message ||
          "Requested again. Tap Resend on the app, then wait for the new code here."
      );
      await load();
    } catch (e: any) {
      setActionMessage(e.message || "Could not resend");
    } finally {
      setResendingId(null);
    }
  };

  const refreshAccountDelivery = async (orderId: string) => {
    setRefreshingAccId(orderId);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/accounts/orders/${orderId}/refresh`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not fetch delivery");
      setActionMessage("Delivery loaded. Scroll to Accounts tab.");
      await load();
      setTab("accounts");
    } catch (e: any) {
      setActionMessage(e.message || "Fetch delivery failed");
    } finally {
      setRefreshingAccId(null);
    }
  };

  useEffect(() => {
    try {
      const tabParam = new URLSearchParams(window.location.search).get("tab");
      if (tabParam === "accounts" || tabParam === "transactions" || tabParam === "orders") {
        setTab(tabParam);
      }
    } catch {
      /* ignore */
    }
  }, []);

  
  // Auto-refund any SMS orders stuck past 5 minutes
  useEffect(() => {
    fetch("/api/orders/expire-pending", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (data?.refundedCount > 0) {
          // refresh balances/orders
          load();
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

useEffect(() => {
    load();

    const interval = setInterval(async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
          .from("orders")
          .select("id")
          .eq("user_id", user.id)
          .in("status", ["waiting_sms", "pending"]);

        if (data) {
          for (const o of data) {
            try {
              await fetch(`/api/orders/${o.id}/check`, { method: "POST" });
            } catch (_) {}
          }
        }
        await load();
      } catch (_) {}
    }, 8000);

    return () => clearInterval(interval);
  }, [load]);

  const activeOrders = orders.filter(
    (o) =>
      o.status === "waiting_sms" ||
      o.status === "pending" ||
      (o.status === "completed" && o.otp_code)
  );

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("en-NG", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-green-700 bg-green-50";
      case "waiting_sms":
      case "pending":
        return "text-amber-700 bg-amber-50";
      case "refunded":
      case "cancelled":
      case "expired":
        return "text-gray-600 bg-gray-100";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-gray-500">Loading your dashboard…</p>
      </div>
    );
  }

  return (
    <PurchaseFlow>
      {({ onBuy, onFund, user, openAuth, refreshUser }) => (
        <div className="min-h-screen flex flex-col bg-gray-50">
          <Header
            logoText={logoText || "SWIFTVERIFY"}
            logoUrl={logoUrl || undefined}
            menuItems={menuItems}
            isLoggedIn={!!user}
            username={user?.username || username}
            balance={user?.balance ?? balance}
            onLoginClick={openAuth}
          />

          <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  My Dashboard
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  Buy numbers, fund wallet, and track orders here
                </p>
              </div>
              <div className="flex items-center gap-2">
                {role === "admin" && (
                  <Link
                    href="/admin"
                    className="text-xs border border-gray-300 px-3 py-1.5 rounded hover:bg-white"
                  >
                    Admin Panel
                  </Link>
                )}
                <button
                  onClick={async () => {
                    await refreshUser();
                    await load();
                  }}
                  className="text-sm text-gray-600 border border-gray-300 px-3 py-1.5 rounded hover:bg-white"
                >
                  Refresh
                </button>
                <button
                  onClick={handleLogout}
                  className="text-sm text-red-600 border border-red-200 px-3 py-1.5 rounded hover:bg-red-50"
                >
                  Log out
                </button>
              </div>
            </div>

            {actionMessage && (
              <div className="mb-4 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-4 py-2">
                {actionMessage}
              </div>
            )}

            {/* Buy + Fund section */}
            <div className="flex flex-col lg:flex-row gap-6 mb-10">
              <div className="w-full max-w-xl">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">
                  Buy a Number
                </h2>
                <OrderWidget onBuy={onBuy} />
              </div>

              <div className="w-full max-w-xs">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">
                  Your Wallet
                </h2>
                <WalletCard
                  username={user?.username || username}
                  balance={user?.balance ?? balance}
                  onFund={onFund}
                />
              </div>
            </div>

            {/* Active orders */}
            {activeOrders.length > 0 && (
              <div className="mb-8">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">
                  Active / Recent Orders
                </h2>
                <div className="space-y-3">
                  {activeOrders.map((o) => (
                    <div
                      key={o.id}
                      className="bg-white border border-gray-200 rounded-xl p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="font-medium text-gray-900">
                            {o.service_name}{" "}
                            <span className="text-gray-500 text-sm">
                              ({o.country_code})
                            </span>
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {formatDate(o.created_at)}
                          </p>
                        </div>
                        <span
                          className={`text-xs font-medium px-2 py-1 rounded ${statusColor(
                            o.status
                          )}`}
                        >
                          {o.status}
                        </span>
                      </div>

                      {o.phone_number && (
                        <p className="text-sm mb-1">
                          <span className="text-gray-500">Number: </span>
                          <span className="font-mono font-semibold text-lg">
                            {o.phone_number}
                          </span>
                        </p>
                      )}

                      {o.otp_code ? (
                        <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                          <p className="text-xs text-green-700 mb-1">OTP CODE</p>
                          <p className="text-2xl font-bold tracking-widest text-green-800">
                            {o.otp_code}
                          </p>
                        </div>
                      ) : (
                        (o.status === "waiting_sms" ||
                          o.status === "pending") && (
                          <p className="text-xs text-amber-600 animate-pulse mt-2">
                            Waiting for SMS… (auto-cancels after ~5 min)
                          </p>
                        )
                      )}

                      <div className="flex items-center justify-between mt-2 gap-2">
                        <p className="text-xs text-gray-400">
                          Cost: ₦{Number(o.cost_naira).toLocaleString()}
                        </p>
                        <div className="flex flex-wrap gap-2 justify-end">
                          {o.phone_number &&
                            ["completed", "waiting_sms", "pending"].includes(
                              o.status
                            ) && (
                              <button
                                onClick={() => resendOrder(o.id)}
                                disabled={resendingId === o.id}
                                className="text-xs text-blue-700 border border-blue-200 hover:bg-blue-50 px-2.5 py-1 rounded disabled:opacity-50"
                              >
                                {resendingId === o.id
                                  ? "Requesting…"
                                  : "Request code again"}
                              </button>
                            )}
                          {(o.status === "waiting_sms" ||
                            o.status === "pending") && (
                            <button
                              onClick={() => cancelOrder(o.id)}
                              disabled={cancellingId === o.id}
                              className="text-xs text-red-600 border border-red-200 hover:bg-red-50 px-2.5 py-1 rounded disabled:opacity-50"
                            >
                              {cancellingId === o.id
                                ? "Cancelling…"
                                : "Cancel & Refund"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-2 mb-4 border-b border-gray-200">
              <button
                onClick={() => setTab("orders")}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                  tab === "orders"
                    ? "border-red-600 text-red-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                SMS Orders ({orders.length})
              </button>
              <button
                onClick={() => setTab("accounts")}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                  tab === "accounts"
                    ? "border-red-600 text-red-600"
                    : "border-transparent text-gray-500"
                }`}
              >
                Accounts ({accountOrders.length})
              </button>
              <button
                onClick={() => setTab("transactions")}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                  tab === "transactions"
                    ? "border-red-600 text-red-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Transactions ({transactions.length})
              </button>
            </div>

            {tab === "orders" && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-8">
                {orders.length === 0 ? (
                  <p className="p-6 text-sm text-gray-500 text-center">
                    No orders yet. Use the form above to buy a number.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                        <tr>
                          <th className="px-4 py-3">Service</th>
                          <th className="px-4 py-3">Number</th>
                          <th className="px-4 py-3">OTP</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Amount</th>
                          <th className="px-4 py-3">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {orders.map((o) => (
                          <tr key={o.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              {o.service_name}
                              <span className="text-gray-400 text-xs ml-1">
                                ({o.country_code})
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs">
                              {o.phone_number || "—"}
                            </td>
                            <td className="px-4 py-3 font-mono font-semibold text-green-700">
                              {o.otp_code || "—"}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`text-xs px-2 py-0.5 rounded ${statusColor(
                                  o.status
                                )}`}
                              >
                                {o.status}
                              </span>
                              {o.phone_number &&
                                ["completed", "waiting_sms", "pending"].includes(
                                  o.status
                                ) && (
                                  <button
                                    onClick={() => resendOrder(o.id)}
                                    disabled={resendingId === o.id}
                                    className="block mt-1 text-xs text-blue-700 underline disabled:opacity-50"
                                  >
                                    {resendingId === o.id
                                      ? "Requesting…"
                                      : "Request code again"}
                                  </button>
                                )}
                              {(o.status === "waiting_sms" ||
                                o.status === "pending") && (
                                <button
                                  onClick={() => cancelOrder(o.id)}
                                  disabled={cancellingId === o.id}
                                  className="block mt-1 text-xs text-red-600 underline disabled:opacity-50"
                                >
                                  {cancellingId === o.id
                                    ? "Cancelling…"
                                    : "Cancel"}
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              ₦{Number(o.cost_naira).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500">
                              {formatDate(o.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            
            {tab === "accounts" && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {accountOrders.length === 0 ? (
                  <p className="p-6 text-sm text-gray-500 text-center">
                    No account purchases yet.{" "}
                    <a href="/buy-accounts" className="text-red-600 underline">
                      Buy accounts
                    </a>
                  </p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {accountOrders.map((a) => (
                      <div key={a.id} className="p-4 space-y-2">
                        <div className="flex justify-between gap-2">
                          <p className="font-medium text-sm text-gray-900">
                            {a.product_name}
                          </p>
                          <span className="text-xs text-gray-500 shrink-0">
                            ₦{Number(a.cost_naira).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400">
                          {a.status} · {new Date(a.created_at).toLocaleString()}
                        </p>
                        {a.delivery_text && (
                          <div>
                            <button
                              type="button"
                              className="text-xs text-red-600 font-semibold underline mb-1"
                              onClick={() =>
                                navigator.clipboard.writeText(a.delivery_text || "")
                              }
                            >
                              Copy credentials
                            </button>
                            <pre className="text-xs bg-gray-50 border rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all">
                              {a.delivery_text}
                            </pre>
                          </div>
                        )}
                        {a.delivery_link && (
                          <a
                            href={a.delivery_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block text-xs text-red-600 font-semibold underline"
                          >
                            Open download link
                          </a>
                        )}
                        {!a.delivery_text && !a.delivery_link && (
                          <div className="space-y-1">
                            <p className="text-xs text-amber-600">
                              Delivery not loaded yet.
                            </p>
                            <button
                              type="button"
                              disabled={refreshingAccId === a.id}
                              onClick={() => refreshAccountDelivery(a.id)}
                              className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-md font-semibold disabled:opacity-50"
                            >
                              {refreshingAccId === a.id
                                ? "Fetching…"
                                : "Fetch delivery from supplier"}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "transactions" && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-8">
                {transactions.length === 0 ? (
                  <p className="p-6 text-sm text-gray-500 text-center">
                    No transactions yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                        <tr>
                          <th className="px-4 py-3">Type</th>
                          <th className="px-4 py-3">Description</th>
                          <th className="px-4 py-3">Amount</th>
                          <th className="px-4 py-3">Balance After</th>
                          <th className="px-4 py-3">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {transactions.map((t) => (
                          <tr key={t.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 capitalize">{t.type}</td>
                            <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                              {t.description || t.reference || "—"}
                            </td>
                            <td
                              className={`px-4 py-3 font-medium ${
                                Number(t.amount) >= 0
                                  ? "text-green-700"
                                  : "text-red-600"
                              }`}
                            >
                              {Number(t.amount) >= 0 ? "+" : ""}
                              ₦{Number(t.amount).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {t.balance_after != null
                                ? `₦${Number(t.balance_after).toLocaleString()}`
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500">
                              {formatDate(t.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </main>

          <Footer
            companyLinks={footerData.company}
            servicesLinks={footerData.services}
            supportLinks={footerData.support}
            copyright={footerData.copyright}
            paymentGateways={footerData.payment_gateways}
          />
        </div>
      )}
    </PurchaseFlow>
  );
}
