export interface Profile {
  id: string;
  username: string;
  email: string | null;
  balance: number;
  role: 'user' | 'admin';
  created_at: string;
}

export interface SiteSetting {
  key: string;
  value: any;
}

export interface MenuItem {
  id: string;
  location: 'header' | 'footer_company' | 'footer_services' | 'footer_support';
  label: string;
  url: string;
  is_external: boolean;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface PriceOverride {
  id: string;
  service_name: string;
  service_id: string | null;
  country_code: string;
  country_name: string | null;
  override_price_naira: number | null;
  custom_margin_percent: number | null;
  is_active: boolean;
}

export interface Order {
  id: string;
  user_id: string | null;
  smspool_order_id: string | null;
  service_name: string;
  service_id: string | null;
  country_code: string;
  country_name: string | null;
  phone_number: string | null;
  cost_naira: number;
  cost_usd: number | null;
  status: 'pending' | 'waiting_sms' | 'completed' | 'cancelled' | 'refunded' | 'expired';
  otp_code: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface SMSPoolService {
  ID: number | string;
  name: string;
  favourite?: number;
}

export interface SMSPoolCountry {
  ID: number | string;
  name: string;
  short_name: string;
  region?: string;
}

export interface SMSPoolPrice {
  // Depending on endpoint; adjust after testing real responses
  service: string;
  country: string;
  price: number; // USD
  success_rate?: number;
}

export interface PricedService {
  serviceId: string;
  serviceName: string;
  countryCode: string;
  countryName: string;
  baseUsd: number;
  finalNaira: number;
  stock?: number | string;
  successRate?: number;
}
