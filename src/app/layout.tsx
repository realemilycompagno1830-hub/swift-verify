import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || "https://swift-verify.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Swift Verify | Instant Virtual Numbers for SMS Verification",
    template: "%s | Swift Verify",
  },
  description:
    "Get instant virtual numbers for WhatsApp, Telegram, Instagram, OpenAI and 1200+ services. Pay in Naira. Fast delivery.",
  applicationName: "Swift Verify",
  keywords: [
    "SMS verification",
    "virtual number",
    "WhatsApp number",
    "Nigeria",
    "Paystack",
    "Swift Verify",
  ],
  authors: [{ name: "Swift Verify" }],
  openGraph: {
    type: "website",
    locale: "en_NG",
    url: siteUrl,
    siteName: "Swift Verify",
    title: "Swift Verify | Instant Virtual Numbers",
    description:
      "Buy temporary virtual numbers for SMS verification. WhatsApp, Telegram, Instagram & more. Paid in Naira.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Swift Verify",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Swift Verify | Instant Virtual Numbers",
    description:
      "Buy temporary virtual numbers for SMS verification. Paid in Naira.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [{ url: "/favicon.ico" }, { url: "/icon.png", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
