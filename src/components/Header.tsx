"use client";

import Link from "next/link";
import { useState } from "react";

interface MenuItem {
  label: string;
  url: string;
  is_external?: boolean;
}

interface HeaderProps {
  logoText?: string;
  logoUrl?: string;
  menuItems?: MenuItem[];
  isLoggedIn?: boolean;
  username?: string;
  balance?: number;
  onLoginClick?: () => void;
}

export default function Header({
  logoText = "SWIFTVERIFY.NG",
  logoUrl,
  menuItems = [
    { label: "Home", url: "/" },
    { label: "SMS Verification", url: "/" },
    { label: "Buy Accounts", url: "/accounts" },
    { label: "Gift Cards", url: "/gift-cards" },
  ],
  isLoggedIn = false,
  username,
  balance = 0,
  onLoginClick,
}: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const logoParts = (logoText || "SWIFTVERIFY.NG").split(".");
  const mainPart = logoParts[0] || logoText;
  const restPart = logoParts.length > 1 ? "." + logoParts.slice(1).join(".") : "";

  return (
    <header className="border-b border-gray-100 bg-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={logoText || "Logo"}
                className="h-8 sm:h-9 w-auto object-contain"
              />
            ) : (
              <span className="text-lg sm:text-xl font-bold tracking-tight">
                <span className="text-red-600">{mainPart}</span>
                <span className="text-black">{restPart}</span>
              </span>
            )}
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6 lg:gap-8">
            {menuItems.map((item) =>
              item.is_external ? (
                <a
                  key={item.label}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-gray-700 hover:text-red-600 transition-colors"
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.label}
                  href={item.url}
                  className="text-sm font-medium text-gray-700 hover:text-red-600 transition-colors"
                >
                  {item.label}
                </Link>
              )
            )}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 sm:gap-3">
            {isLoggedIn ? (
              <>
                <div className="hidden sm:flex items-center gap-2 text-sm">
                  <span className="text-gray-600">
                    <strong>{username}</strong>
                  </span>
                  <span className="font-semibold text-green-700">
                    ₦
                    {Number(balance).toLocaleString("en-NG", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <Link
                  href="/admin"
                  className="bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-semibold px-3 sm:px-4 py-2 rounded-md transition-colors"
                >
                  DASHBOARD
                </Link>
              </>
            ) : (
              <button
                onClick={onLoginClick}
                className="bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-semibold px-3 sm:px-4 py-2 rounded-md transition-colors"
              >
                LOGIN / SIGNUP
              </button>
            )}

            <button
              className="md:hidden p-2"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {mobileOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="md:hidden pb-4 space-y-1 border-t border-gray-100 pt-3">
            {menuItems.map((item) =>
              item.is_external ? (
                <a
                  key={item.label}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block py-2 text-sm font-medium text-gray-700 hover:text-red-600"
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.label}
                  href={item.url}
                  className="block py-2 text-sm font-medium text-gray-700 hover:text-red-600"
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </Link>
              )
            )}
          </div>
        )}
      </div>
    </header>
  );
}
