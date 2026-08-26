/**
 * 5sim.net API client
 * Docs: https://5sim.net/docs
 * Auth: Authorization: Bearer <JWT API key from 5sim profile>
 * Base: https://5sim.net/v1
 */

const BASE = (process.env.FIVESIM_BASE_URL || "https://5sim.net/v1").replace(
  /\/$/,
  ""
);

function getApiKey(): string {
  let key = (process.env.FIVESIM_API_KEY || "").trim();
  // User sometimes pastes "Bearer xxx" — strip it
  if (key.toLowerCase().startsWith("bearer ")) {
    key = key.slice(7).trim();
  }
  return key;
}

function assertKey() {
  if (!getApiKey()) throw new Error("FIVESIM_API_KEY is not set in Vercel");
}

async function fiveGet(path: string, auth = true) {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (auth) {
    assertKey();
    headers.Authorization = `Bearer ${getApiKey()}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    method: "GET",
    headers,
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
    if (res.status === 401 || /unauthor/i.test(String(msg))) {
      throw new Error(
        "Unauthorized – check FIVESIM_API_KEY in Vercel (use the JWT from 5sim profile → API key, not SMSPool key). Redeploy after saving."
      );
    }
    throw new Error(String(msg));
  }
  return json;
}

/** Guest endpoints (no auth required) */
export async function listCountriesGuest() {
  return fiveGet("/guest/countries", false);
}

export async function listProductsGuest(country: string) {
  return fiveGet(`/guest/products/${encodeURIComponent(country)}`, false);
}

export async function listPricesGuest() {
  return fiveGet("/guest/prices", false);
}

export async function getPricesByProductGuest(product: string) {
  return fiveGet(
    `/guest/prices?product=${encodeURIComponent(product)}`,
    false
  );
}

export async function getUserProfile() {
  return fiveGet("/user/profile", true);
}

export async function buyActivation(
  country: string,
  product: string,
  operator: string = "any"
) {
  return fiveGet(
    `/user/buy/activation/${encodeURIComponent(country)}/${encodeURIComponent(
      operator
    )}/${encodeURIComponent(product)}`,
    true
  );
}

export async function checkOrder(orderId: string | number) {
  return fiveGet(`/user/check/${orderId}`, true);
}

export async function cancelOrder(orderId: string | number) {
  return fiveGet(`/user/cancel/${orderId}`, true);
}

export async function finishOrder(orderId: string | number) {
  return fiveGet(`/user/finish/${orderId}`, true);
}

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
  return (
    COUNTRY_ALIASES[key] ||
    COUNTRY_ALIASES[key.replace(/\s+/g, "")] ||
    key.replace(/\s+/g, "")
  );
}

export function normalizeFiveSimProduct(input: string): string {
  let s = String(input || "")
    .toLowerCase()
    .trim();
  s = s
    .replace(/facebook\s*\/\s*meta.*/i, "facebook")
    .replace(/meta.?facebook/i, "facebook")
    .replace(/facebook.*/i, "facebook")
    .replace(/whatsapp.*/i, "whatsapp")
    .replace(/instagram.*/i, "instagram")
    .replace(/telegram.*/i, "telegram")
    .replace(/tik\s*tok.*/i, "tiktok")
    .replace(/google.*/i, "google")
    .replace(/discord.*/i, "discord")
    .replace(/twitter|x\.com/i, "twitter")
    .replace(/[^a-z0-9]/g, "");
  return s;
}

/** Build service list from 5sim guest prices map */
export function flattenFiveSimPrices(prices: any): {
  services: { id: string; name: string }[];
  countries: { id: string; code: string; name: string }[];
  priceMap: Record<string, { cost: number; count: number }>;
} {
  const servicesMap = new Map<string, string>();
  const countriesMap = new Map<string, string>();
  const priceMap: Record<string, { cost: number; count: number }> = {};

  // Shape is often: { russia: { whatsapp: { any: { cost, count } } } }
  if (!prices || typeof prices !== "object") {
    return { services: [], countries: [], priceMap };
  }

  for (const [country, products] of Object.entries(prices)) {
    if (!products || typeof products !== "object") continue;
    const cName = String(country);
    countriesMap.set(cName, cName);
    for (const [product, operators] of Object.entries(products as any)) {
      if (!operators || typeof operators !== "object") continue;
      servicesMap.set(product, product);
      let bestCost = Infinity;
      let bestCount = 0;
      for (const op of Object.values(operators as any)) {
        const cost = Number((op as any)?.cost ?? (op as any)?.price ?? NaN);
        const count = Number((op as any)?.count ?? (op as any)?.qty ?? 0);
        if (!Number.isNaN(cost) && cost < bestCost) bestCost = cost;
        if (count > bestCount) bestCount = count;
      }
      if (bestCost < Infinity) {
        priceMap[`${product}__${cName}`] = {
          cost: bestCost,
          count: bestCount,
        };
      }
    }
  }

  const services = Array.from(servicesMap.keys())
    .map((id) => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const countries = Array.from(countriesMap.keys())
    .map((id) => ({
      id,
      code: id.toUpperCase(),
      name: id.charAt(0).toUpperCase() + id.slice(1),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { services, countries, priceMap };
}

export function calcNairaFromFiveSimUsd(
  costUsd: number,
  usdNgnRate: number,
  markupPercent: number
): number {
  return Math.max(
    1,
    Math.ceil(
      Number(costUsd) * Number(usdNgnRate) * (1 + Number(markupPercent) / 100)
    )
  );
}

/** @deprecated 5sim guest costs are USD; prefer calcNairaFromFiveSimUsd */
export function calcNairaFromFiveSimRub(

  costRub: number,
  rubNgnRate: number,
  markupPercent: number
): number {
  return Math.max(
    1,
    Math.ceil(Number(costRub) * Number(rubNgnRate) * (1 + Number(markupPercent) / 100))
  );
}
