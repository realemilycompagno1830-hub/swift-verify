/**
 * 5sim.net API client
 * Docs: https://5sim.net/docs
 * Auth: Authorization: Bearer <API_KEY>
 * Base: https://5sim.net/v1
 */

const BASE = process.env.FIVESIM_BASE_URL || "https://5sim.net/v1";
const API_KEY = process.env.FIVESIM_API_KEY;

function assertKey() {
  if (!API_KEY) throw new Error("FIVESIM_API_KEY is not set");
}

async function fiveGet(path: string) {
  assertKey();
  const res = await fetch(`${BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg =
      typeof json === "string"
        ? json
        : json?.message || json?.error || text || res.statusText;
    throw new Error(String(msg));
  }
  return json;
}

/** Guest: list countries */
export async function listCountries() {
  return fiveGet("/guest/countries");
}

/** Guest: products for a country → { facebook: { qty, cost, ... }, ... } */
export async function listProducts(country: string) {
  return fiveGet(`/guest/products/${encodeURIComponent(country)}`);
}

/** Prices map */
export async function listPrices() {
  return fiveGet("/guest/prices");
}

export async function getPricesByProduct(product: string) {
  return fiveGet(`/guest/prices?product=${encodeURIComponent(product)}`);
}

export async function getUserProfile() {
  return fiveGet("/user/profile");
}

/**
 * Buy activation number
 * GET /user/buy/activation/{country}/{operator}/{product}
 * operator often "any"
 */
export async function buyActivation(
  country: string,
  product: string,
  operator: string = "any"
) {
  return fiveGet(
    `/user/buy/activation/${encodeURIComponent(country)}/${encodeURIComponent(
      operator
    )}/${encodeURIComponent(product)}`
  );
}

export async function checkOrder(orderId: string | number) {
  return fiveGet(`/user/check/${orderId}`);
}

export async function cancelOrder(orderId: string | number) {
  return fiveGet(`/user/cancel/${orderId}`);
}

export async function finishOrder(orderId: string | number) {
  return fiveGet(`/user/finish/${orderId}`);
}

/** Map SMSPool-style country codes/names toward 5sim country slugs when possible */
export const COUNTRY_ALIASES: Record<string, string> = {
  us: "usa",
  usa: "usa",
  unitedstates: "usa",
  "united states": "usa",
  uk: "england",
  gb: "england",
  unitedkingdom: "england",
  "united kingdom": "england",
  england: "england",
  ng: "nigeria",
  nigeria: "nigeria",
  ru: "russia",
  russia: "russia",
  in: "india",
  india: "india",
  ph: "philippines",
  philippines: "philippines",
  id: "indonesia",
  indonesia: "indonesia",
  de: "germany",
  germany: "germany",
  fr: "france",
  france: "france",
  ca: "canada",
  canada: "canada",
  au: "australia",
  australia: "australia",
  br: "brazil",
  brazil: "brazil",
  mx: "mexico",
  mexico: "mexico",
  nl: "netherlands",
  netherlands: "netherlands",
  pl: "poland",
  poland: "poland",
  es: "spain",
  spain: "spain",
  it: "italy",
  italy: "italy",
  tr: "turkey",
  turkey: "turkey",
  ua: "ukraine",
  ukraine: "ukraine",
  ke: "kenya",
  kenya: "kenya",
  za: "southafrica",
  "south africa": "southafrica",
  southafrica: "southafrica",
};

export function normalizeFiveSimCountry(input: string): string {
  const key = String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
  return COUNTRY_ALIASES[key] || COUNTRY_ALIASES[key.replace(/\s+/g, "")] || key.replace(/\s+/g, "");
}

export function normalizeFiveSimProduct(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/facebook.?meta|meta.?facebook/i, "facebook")
    .replace(/whatsapp/i, "whatsapp")
    .replace(/instagram/i, "instagram")
    .replace(/telegram/i, "telegram")
    .replace(/tiktok/i, "tiktok")
    .replace(/google/i, "google")
    .replace(/discord/i, "discord")
    .replace(/twitter|x\.com/i, "twitter")
    .trim();
}
