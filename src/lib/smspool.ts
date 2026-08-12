/**
 * SMSPool API Client
 * Docs: https://www.smspool.net/article/how-to-use-the-smspool-api
 * Postman: https://documenter.getpostman.com/view/30155063/2s9YXmZ1JY
 *
 * All requests are form-data POST (or GET for some list endpoints)
 * Responses are JSON.
 */

const BASE_URL = process.env.SMSPOOL_BASE_URL || 'https://api.smspool.net';
const API_KEY = process.env.SMSPOOL_API_KEY;

if (!API_KEY && process.env.NODE_ENV === 'production') {
  console.warn('SMSPOOL_API_KEY is not set');
}

async function smspoolRequest(
  endpoint: string,
  params: Record<string, string | number | undefined> = {},
  method: 'GET' | 'POST' = 'POST'
): Promise<any> {
  const url = new URL(`${BASE_URL}${endpoint}`);
  const form = new FormData();

  // Always include key
  form.append('key', API_KEY || '');

  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      form.append(k, String(v));
    }
  }

  const options: RequestInit = {
    method,
    body: method === 'POST' ? form : undefined,
    headers: method === 'GET' ? undefined : undefined, // FormData sets multipart
    cache: 'no-store',
  };

  // For GET endpoints that support query
  if (method === 'GET') {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.append(k, String(v));
    });
    url.searchParams.append('key', API_KEY || '');
  }

  const res = await fetch(method === 'GET' ? url.toString() : `${BASE_URL}${endpoint}`, options);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SMSPool API error ${res.status}: ${text}`);
  }

  return res.json();
}

/** Retrieve all services */
export async function getServices(country?: string | number) {
  return smspoolRequest('/service/retrieve_all', country ? { country } : {}, 'POST');
}

/** Retrieve all countries */
export async function getCountries() {
  return smspoolRequest('/country/retrieve_all', {}, 'POST');
}

/** Get balance */
export async function getBalance() {
  return smspoolRequest('/request/balance');
}

/** Get price for a specific service + country (USD) */
export async function getServicePrice(country: string | number, service: string | number) {
  // There are pricing endpoints; adjust based on real docs
  // Common pattern: /request/price or similar. Check Postman for exact.
  // For now we use a common pattern; you may need to call pricing endpoint.
  return smspoolRequest('/request/price', { country, service });
}

/**
 * Purchase SMS number
 * Returns { order_id, number, ... } on success
 */
export async function purchaseSMS(params: {
  country: string | number;
  service: string | number;
  pool?: string | number;
  max_price?: number;
  pricing_option?: 0 | 1; // 0=cheapest, 1=highest success
}) {
  return smspoolRequest('/purchase/sms', {
    country: params.country,
    service: params.service,
    pool: params.pool,
    max_price: params.max_price,
    pricing_option: params.pricing_option ?? 1,
  });
}

/** Check SMS status / retrieve code */
export async function checkSMS(orderId: string) {
  return smspoolRequest('/sms/check', { orderid: orderId });
}

/** Cancel order (refund if eligible) */
export async function cancelSMS(orderId: string) {
  return smspoolRequest('/sms/cancel', { orderid: orderId });
}

/** Active orders */
export async function getActiveOrders() {
  return smspoolRequest('/request/active');
}

/**
 * Helper: Apply Naira pricing with global margin + overrides
 * baseUsd comes from SMSPool (or cached)
 */
export function calculateNairaPrice(
  baseUsd: number,
  globalMarkupPercent: number,
  overridePriceNaira: number | null | undefined,
  customMargin?: number | null,
  usdNgnRate: number = 1600
): number {
  if (overridePriceNaira != null && overridePriceNaira > 0) {
    return Math.ceil(overridePriceNaira);
  }

  const margin = customMargin != null ? customMargin : globalMarkupPercent;
  const naira = baseUsd * usdNgnRate * (1 + margin / 100);
  return Math.ceil(naira); // always round up to whole Naira
}
