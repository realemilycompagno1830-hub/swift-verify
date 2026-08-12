import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function AdminDashboard() {
  const supabase = await createClient();

  const [
    { count: orderCount },
    { count: userCount },
    { data: recentOrders },
  ] = await Promise.all([
    supabase.from("orders").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase
      .from("orders")
      .select("id, service_name, country_code, status, cost_naira, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-sm text-gray-500 mt-1">
          Overview of Swift Verify operations
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Total Orders
          </p>
          <p className="text-3xl font-bold mt-1">{orderCount ?? 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Users
          </p>
          <p className="text-3xl font-bold mt-1">{userCount ?? 0}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Quick Links
          </p>
          <div className="mt-2 space-y-1">
            <Link
              href="/admin/price-config"
              className="block text-sm text-red-600 hover:underline"
            >
              Price Overrides →
            </Link>
            <Link
              href="/admin/menu-builder"
              className="block text-sm text-red-600 hover:underline"
            >
              Menu Builder →
            </Link>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-sm">Recent Orders</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-5 py-3">Service</th>
                <th className="px-5 py-3">Country</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(recentOrders || []).map((o) => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium">{o.service_name}</td>
                  <td className="px-5 py-3">{o.country_code}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        o.status === "completed"
                          ? "bg-green-50 text-green-700"
                          : o.status === "waiting_sms"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">₦{Number(o.cost_naira).toLocaleString()}</td>
                  <td className="px-5 py-3 text-gray-500">
                    {new Date(o.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
              {(!recentOrders || recentOrders.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                    No orders yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
