"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

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
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [balance, setBalance] = useState(0);
  const [role, setRole] = useState("user");
  const [orders, setOrders] = useState<Order[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tab, setTab] = useState<"orders" | "transactions">("orders");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

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

    const [{ data: ordersData }, { data: txData }] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, service_name, country_code, phone_number, otp_code, status, cost_naira, created_at, expires_at"
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
    ]);

    setOrders(ordersData || []);
    setTransactions(txData || []);
    setLoading(false);
  }, [router]);

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-gray-500">Loading your dashboard…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg">
            <span className="text-red-600">SWIFTVERIFY</span>
            <span className="text-black">.NG</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-600 hidden sm:inline">{username}</span>
            <span className="font-semibold text-green-700">
              ₦{balance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
            </span>
            {role === "admin" && (
              <Link
                href="/admin"
                className="text-xs border border-gray-300 px-2 py-1 rounded hover:bg-gray-50"
              >
                Admin
              </Link>
            )}
            <Link
              href="/"
              className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded"
            >
              Buy Number
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">
              View your orders, OTP codes, and transactions
            </p>
          </div>
          <button
            onClick={() => load()}
            className="text-sm text-gray-600 border border-gray-300 px-3 py-1.5 rounded hover:bg-white"
          >
            Refresh
          </button>
        </div>

        {actionMessage && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-4 py-2">
            {actionMessage}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Wallet Balance
            </p>
            <p className="text-3xl font-bold text-green-700 mt-1">
              ₦{balance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex justify-center bg-red-600 hover:bg-red-700 text-white font-semibold text-sm px-5 py-2.5 rounded-lg"
          >
            Fund Wallet / Buy Number
          </Link>
        </div>

        {activeOrders.length > 0 && (
          <div className="mb-6">
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
                    (o.status === "waiting_sms" || o.status === "pending") && (
                      <p className="text-xs text-amber-600 animate-pulse mt-2">
                        Waiting for SMS… (auto-cancels after ~15 min)
                      </p>
                    )
                  )}

                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-gray-400">
                      Cost: ₦{Number(o.cost_naira).toLocaleString()}
                    </p>
                    {(o.status === "waiting_sms" || o.status === "pending") && (
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
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 mb-4 border-b border-gray-200">
          <button
            onClick={() => setTab("orders")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === "orders"
                ? "border-red-600 text-red-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            All Orders ({orders.length})
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
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {orders.length === 0 ? (
              <p className="p-6 text-sm text-gray-500 text-center">
                No orders yet.{" "}
                <Link href="/" className="text-red-600 underline">
                  Buy a number
                </Link>
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
                          {(o.status === "waiting_sms" ||
                            o.status === "pending") && (
                            <button
                              onClick={() => cancelOrder(o.id)}
                              disabled={cancellingId === o.id}
                              className="block mt-1 text-xs text-red-600 underline disabled:opacity-50"
                            >
                              {cancellingId === o.id ? "Cancelling…" : "Cancel"}
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

        {tab === "transactions" && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
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
    </div>
  );
}
