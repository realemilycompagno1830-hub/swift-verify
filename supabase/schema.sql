-- Swift Verify / SMSAUTO.NG Supabase Schema
-- Run this in Supabase SQL Editor after creating the project

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES (extends auth.users)
-- ============================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  balance DECIMAL(12,2) DEFAULT 0.00 NOT NULL, -- in Naira
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email, balance, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.email,
    0.00,
    'user'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- SITE SETTINGS (key-value store for everything editable)
-- ============================================
CREATE TABLE public.site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default settings
INSERT INTO public.site_settings (key, value) VALUES
('brand', '{"logo_text": "SWIFTVERIFY.NG", "logo_color": "#DC2626", "site_name": "Swift Verify"}'),
('headline', '{"title": "GET INSTANT VIRTUAL NUMBERS FOR VERIFICATION", "subtitle": "WhatsApp, Telegram, OpenAI, and 1200+ other services. Quick. Reliable. Paid with Naira."}'),
('announcement', '{"enabled": true, "message": "NOTICE: New US WhatsApp numbers added. High success rates!"}'),
('global_margin', '{"markup_percent": 150, "mode": "add_to_base"}'), -- 150% markup example
('colors', '{"primary": "#DC2626", "background": "#FFFFFF", "text": "#000000"}'),
('footer', '{
  "company": [{"label": "About Us", "url": "/about"}, {"label": "Contact", "url": "/contact"}],
  "services": [{"label": "SMS Verification", "url": "/"}, {"label": "Virtual Numbers", "url": "/"}],
  "support": [{"label": "FAQ", "url": "/faq"}, {"label": "Support Ticket", "url": "/support"}, {"label": "WhatsApp Status", "url": "/status"}],
  "copyright": "© 2026 SWIFTVERIFY.NG. All Rights Reserved.",
  "payment_gateways": ["paystack", "monnify"]
}'),
('features', '{"instant_delivery": true, "high_success": true, "automated": true}');

-- ============================================
-- MENUS (header navigation + extras)
-- ============================================
CREATE TABLE public.menus (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location TEXT NOT NULL CHECK (location IN ('header', 'footer_company', 'footer_services', 'footer_support')),
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  is_external BOOLEAN DEFAULT false,
  parent_id UUID REFERENCES public.menus(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.menus (location, label, url, sort_order) VALUES
('header', 'Home', '/', 1),
('header', 'SMS Verification', '/', 2),
('header', 'Buy Accounts', '/accounts', 3),
('header', 'Gift Cards', '/gift-cards', 4);

-- ============================================
-- PRICE OVERRIDES (service + country specific Naira prices)
-- ============================================
CREATE TABLE public.price_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_name TEXT NOT NULL,          -- e.g. "WhatsApp"
  service_id TEXT,                     -- SMSPool service ID if known
  country_code TEXT NOT NULL,          -- e.g. "US", "GB", "NG"
  country_name TEXT,
  override_price_naira DECIMAL(10,2),  -- fixed final price in ₦ (null = use margin)
  custom_margin_percent DECIMAL(6,2),  -- optional per-service margin
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(service_name, country_code)
);

-- Example overrides matching the screenshot
INSERT INTO public.price_overrides (service_name, country_code, country_name, override_price_naira) VALUES
('WhatsApp', 'US', 'United States', 800.00),
('WhatsApp', 'GB', 'United Kingdom', 600.00),
('Telegram', 'GB', 'United Kingdom', 600.00),
('OpenAI', 'US', 'United States', 950.00);

-- ============================================
-- ORDERS
-- ============================================
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  smspool_order_id TEXT,
  service_name TEXT NOT NULL,
  service_id TEXT,
  country_code TEXT NOT NULL,
  country_name TEXT,
  phone_number TEXT,
  cost_naira DECIMAL(10,2) NOT NULL,
  cost_usd DECIMAL(10,4),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'waiting_sms', 'completed', 'cancelled', 'refunded', 'expired')),
  otp_code TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_user ON public.orders(user_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_smspool ON public.orders(smspool_order_id);

-- ============================================
-- TRANSACTIONS (wallet ledger)
-- ============================================
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'purchase', 'refund', 'adjustment')),
  amount DECIMAL(12,2) NOT NULL, -- positive for credit, negative for debit
  balance_after DECIMAL(12,2),
  reference TEXT, -- Paystack/Monnify reference or order id
  gateway TEXT, -- 'paystack', 'monnify', 'system'
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_user ON public.transactions(user_id);

-- ============================================
-- PAYMENT LOGS
-- ============================================
CREATE TABLE public.payment_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id),
  gateway TEXT NOT NULL,
  reference TEXT UNIQUE,
  amount DECIMAL(12,2),
  status TEXT,
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update own
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Public read for settings, menus, prices
CREATE POLICY "Public read site_settings" ON public.site_settings FOR SELECT USING (true);
CREATE POLICY "Public read menus" ON public.menus FOR SELECT USING (true);
CREATE POLICY "Public read price_overrides" ON public.price_overrides FOR SELECT USING (true);

-- Orders & transactions: own only
CREATE POLICY "Users view own orders" ON public.orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users view own transactions" ON public.transactions FOR SELECT USING (auth.uid() = user_id);

-- Admin policies (using a helper function)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE POLICY "Admins full access profiles" ON public.profiles FOR ALL USING (public.is_admin());
CREATE POLICY "Admins full access settings" ON public.site_settings FOR ALL USING (public.is_admin());
CREATE POLICY "Admins full access menus" ON public.menus FOR ALL USING (public.is_admin());
CREATE POLICY "Admins full access overrides" ON public.price_overrides FOR ALL USING (public.is_admin());
CREATE POLICY "Admins full access orders" ON public.orders FOR ALL USING (public.is_admin());
CREATE POLICY "Admins full access transactions" ON public.transactions FOR ALL USING (public.is_admin());
CREATE POLICY "Admins full access payment_logs" ON public.payment_logs FOR ALL USING (public.is_admin());

-- Service role bypasses RLS automatically when using service_role key
