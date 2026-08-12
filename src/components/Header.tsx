"use client";

import Link from "next/link";
import { useState } from "react";

interface HeaderProps {
  logoText?: string;
  menuItems?: { label: string; url: string }[];
  isLoggedIn?: boolean;
  username?: string;
  balance?: number;
}

export default function Header({
  logoText = "SWIFTVERIFY.NG",
  menuItems = [
    { label: "Home", url: "/" },
    { label: "SMS Verification", url: "/" },
    { label: "Buy Accounts", url: "/accounts" },
    { label: "Gift Cards", url: "/gift-cards" },
  ],
  isLoggedIn = false,
  username,
  balance = 0,
}: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="border-b border-gray-100 bg-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-1">
            <span className="text-xl font-bold tracking-tight">
              <span className="text-red-600">{logoText.split(".")[0]}</span>
              <span className="text-black">
                {logoText.includes(".") ? "." + logoText.split(".").slice(1).join(".") : ""}
              </span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {menuItems.map((item) => (
              <Link
                key={item.label}
                href={item.url}
                className="text-sm font-medium text-gray-700 hover:text-red-600 transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Auth / Wallet */}
          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <div className="hidden sm:flex items-center gap-3 text-sm">
                <span className="text-gray-600">
                  Account: <strong>{username}</strong>
                </span>
                <span className="font-semibold text-green-700">
                  ₦{balance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                </span>
              </div>
            ) : null}

            <Link
              href={isLoggedIn ? "/admin" : "/"}
              className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-md transition-colors"
            >
              {isLoggedIn ? "DASHBOARD" : "LOGIN / QUICK SIGNUP"}
            </Link>

            {/* Mobile menu button */}
            <button
              className="md:hidden p-2"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileOpen && (
          <div className="md:hidden pb-4 space-y-2">
            {menuItems.map((item) => (
              <Link
                key={item.label}
                href={item.url}
                className="block py-2 text-sm font-medium text-gray-700 hover:text-red-600"
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
