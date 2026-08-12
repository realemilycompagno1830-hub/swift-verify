# Swift Verify

**Instant Virtual Numbers for SMS Verification – Optimized for Nigeria**

A fully dynamic, $0/month (free-tier) Next.js + Supabase platform for reselling temporary SMS numbers via SMSPool, with Paystack & Monnify wallet funding.

## Architecture (Permanent Free Tier)

| Layer              | Technology                          | Cost   |
|--------------------|-------------------------------------|--------|
| Frontend + Backend | Next.js 15/16 (App Router)          | Free   |
| Hosting            | Vercel                              | Free   |
| Database + Auth    | Supabase (PostgreSQL)               | Free   |
| SMS Wholesale      | SMSPool API                         | Pay-as-you-go |
| Payments           | Paystack + Monnify                  | % fees |

## Features Scaffolded

- Clean public UI matching the provided design references (white + signal red)
- Fully editable content via Supabase (`site_settings`, `menus`, `price_overrides`)
- Global profit margin + per-service/country price overrides
- Guest browse → frictionless signup on "Buy Number"
- Wallet system with transaction ledger
- SMSPool integration helpers (purchase, check, cancel)
- Responsive mobile-first design
- Admin panel structure ready for the second image

## Quick Start

### 1. Setup

```bash
cd swift-verify
cp .env.example .env.local
# Fill in all keys
npm install
```

### 2. Supabase

1. Create a project at https://database.new
2. Run the entire SQL from `supabase/schema.sql` in the SQL Editor
3. Promote yourself to admin:
   ```sql
   UPDATE profiles SET role = 'admin' WHERE email = 'you@example.com';
   ```
4. Copy Project URL + anon key + service_role key into `.env.local`

### 3. SMSPool

- Register at https://www.smspool.net
- Get your 32-character API key and fund the account
- Put key in `.env.local`

### 4. Payments

- Paystack: https://dashboard.paystack.com → API Keys
- Monnify: https://app.monnify.com → API Keys + Contract Code
- Use test keys first

### 5. Run

```bash
npm run dev
```

Open http://localhost:3000

### 6. Deploy

Push to GitHub → Import in Vercel → Add all Environment Variables → Deploy.

## Project Structure

```
src/
├── app/
│   ├── page.tsx              # Public landing (matches Image 1)
│   ├── layout.tsx
│   ├── admin/                # Admin dashboard (extend from Image 2)
│   └── api/                  # purchase, check, webhooks
├── components/
│   ├── Header.tsx
│   ├── OrderWidget.tsx
│   ├── WalletCard.tsx
│   ├── StatusFeed.tsx
│   └── Footer.tsx
├── lib/
│   ├── smspool.ts
│   └── supabase/
└── types/

supabase/schema.sql           # Complete DB + RLS
```

## Pricing Logic

```ts
finalNaira = override_price_naira
  ?? Math.ceil(baseUsd * usdNgnRate * (1 + globalMarkupPercent / 100))
```

## Critical Next Implementation Steps

1. `/api/services` – fetch SMSPool + apply margins/overrides
2. Auth modal + Paystack Inline / Monnify on Buy click
3. Webhooks for payment confirmation → credit wallet → purchase number
4. 3-second polling on `/sms/check` + auto-refund after 15 min
5. Full Admin pages (Price Config, Menu Builder, Footer, Settings)
6. Protect `/admin` with role check

## Security

- All secrets via Vercel Environment Variables only
- Service role key only on server
- RLS enabled on every table
- Validate payment webhooks with signatures

---

All site content (logo, menus, prices, announcements, footer) is stored in Supabase and editable from the admin panel without code changes or redeploys.
