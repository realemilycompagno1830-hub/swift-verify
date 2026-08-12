"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: "⌂" },
  { href: "/admin/settings", label: "Global Settings", icon: "⚙" },
  { href: "/admin/price-config", label: "Price Config", icon: "₦" },
  { href: "/admin/menu-builder", label: "Menu Builder", icon: "☰" },
  { href: "/admin/footer", label: "Footer Editor", icon: "▦" },
];

export default function AdminSidebar({ username }: { username?: string }) {
  const pathname = usePathname();

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
      <div className="p-4 border-b border-gray-100">
        <Link href="/" className="text-lg font-bold">
          <span className="text-red-600">SWIFT</span>
          <span className="text-black">VERIFY</span>
        </Link>
        <p className="text-xs text-gray-500 mt-1">Admin · {username}</p>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {NAV.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/admin" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-red-50 text-red-700"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-gray-100">
        <Link
          href="/"
          className="block text-center text-xs text-gray-500 hover:text-red-600 py-2"
        >
          ← Back to site
        </Link>
      </div>
    </aside>
  );
}
