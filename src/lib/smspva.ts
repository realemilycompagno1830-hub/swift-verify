/**
 * SMSPVA.com API client
 * Docs: https://docs.smspva.com/ and https://smspva.com/new_theme_api.html
 *
 * Modern: https://api.smspva.com  (header: apikey)
 * Legacy: https://smspva.com/priemnik.php?metod=...
 *
 * Env: SMSPVA_API_KEY
 */

const MODERN_BASE =
  (process.env.SMSPVA_BASE_URL || "https://api.smspva.com").replace(/\/$/, "");
const LEGACY_BASE = "https://smspva.com/priemnik.php";

function getApiKey(): string {
  return (process.env.SMSPVA_API_KEY || "").trim();
}

function assertKey() {
  if (!getApiKey()) throw new Error("SMSPVA_API_KEY is not set in Vercel");
}

/** Popular service codes used by SMSPVA (opt*) */
/** Official SMSPVA service codes (from docs.smspva.com services list) */
export const SMSPVA_SERVICES: { id: string; name: string }[] = [
  { id: "opt2", name: "Facebook" },
  { id: "opt16", name: "WhatsApp" },
  { id: "opt29", name: "Telegram" },
  { id: "opt1", name: "Instagram" },
  { id: "opt198", name: "TikTok" },
  { id: "opt25", name: "Google" },
  { id: "opt45", name: "Discord" },
  { id: "opt22", name: "Twitter / X" },
  { id: "opt9", name: "Viber" },
  { id: "opt44", name: "Amazon" },
  { id: "opt131", name: "Apple" },
  { id: "opt86", name: "PayPal" },
  { id: "opt100", name: "Signal" },
  { id: "opt14", name: "Steam" },
  { id: "opt8", name: "Tinder" },
  { id: "opt56", name: "Snapchat" },
  { id: "opt32", name: "LinkedIn" },
  { id: "opt23", name: "Netflix" },
  { id: "opt38", name: "eBay" },
  { id: "opt46", name: "Airbnb" },
  { id: "opt7", name: "Uber" },
  { id: "opt132", name: "OpenAI / ChatGPT" },
  { id: "opt19", name: "Other" },
  { id: "opt81", name: "Bolt" },
  { id: "opt112", name: "Coinbase" },
  { id: "opt40", name: "DoorDash" },
  { id: "opt53", name: "Deliveroo" },
  { id: "opt98", name: "Clubhouse" },
  { id: "opt145", name: "Bumble" },
  { id: "opt78", name: "Blizzard" },
];

export const SMSPVA_COUNTRIES: {
  code: string;
  name: string;
}[] = [
  { code: "US", name: "United States" },
  { code: "UK", name: "United Kingdom" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "AU", name: "Australia" },
  { code: "MX", name: "Mexico" },
  { code: "CA", name: "Canada" },
  { code: "NL", name: "Netherlands" },
  { code: "PL", name: "Poland" },
  { code: "UA", name: "Ukraine" },
  { code: "RU", name: "Russia" },
  { code: "KZ", name: "Kazakhstan" },
  { code: "ID", name: "Indonesia" },
  { code: "PH", name: "Philippines" },
  { code: "IN", name: "India" },
  { code: "NG", name: "Nigeria" },
  { code: "KE", name: "Kenya" },
  { code: "ZA", name: "South Africa" },
  { code: "BR", name: "Brazil" },
  { code: "AR", name: "Argentina" },
  { code: "TR", name: "Turkey" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "FI", name: "Finland" },
  { code: "DK", name: "Denmark" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "CZ", name: "Czech Republic" },
  { code: "HK", name: "Hong Kong" },
  { code: "TH", name: "Thailand" },
  { code: "VN", name: "Vietnam" },
  { code: "MY", name: "Malaysia" },
  { code: "SG", name: "Singapore" },
  { code: "IL", name: "Israel" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "EG", name: "Egypt" },
  { code: "MA", name: "Morocco" },
  { code: "CO", name: "Colombia" },
  { code: "CL", name: "Chile" },
  { code: "PE", name: "Peru" },
  { code: "IE", name: "Ireland" },
  { code: "BE", name: "Belgium" },
  { code: "AT", name: "Austria" },
  { code: "CH", name: "Switzerland" },
  { code: "NZ", name: "New Zealand" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "CN", name: "China" },
];

export function normalizeSmspvaService(input: string): string {
  const s = String(input || "").toLowerCase().trim();
  if (s.startsWith("opt")) return s;
  const map: Record<string, string> = {
    facebook: "opt2",
    "facebook / meta viewpoints": "opt2",
    whatsapp: "opt16",
    telegram: "opt29",
    instagram: "opt1",
    "instagram (+threads)": "opt1",
    tiktok: "opt198",
    google: "opt25",
    gmail: "opt25",
    discord: "opt45",
    twitter: "opt22",
    "twitter / x": "opt22",
    x: "opt22",
    viber: "opt9",
    amazon: "opt44",
    microsoft: "opt15",
    apple: "opt131",
    paypal: "opt86",
    signal: "opt100",
    steam: "opt14",
    tinder: "opt8",
    snapchat: "opt56",
    linkedin: "opt32",
    netflix: "opt23",
    ebay: "opt38",
    airbnb: "opt46",
    uber: "opt7",
    openai: "opt132",
    chatgpt: "opt132",
    other: "opt19",
  };
  for (const [k, v] of Object.entries(map)) {
    if (s.includes(k)) return v;
  }
  return s;
}

export function normalizeSmspvaCountry(input: string): string {
  const s = String(input || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  const map: Record<string, string> = {
    us: "US",
    usa: "US",
    unitedstates: "US",
    uk: "UK",
    gb: "UK",
    england: "UK",
    unitedkingdom: "UK",
    fr: "FR",
    france: "FR",
    de: "DE",
    germany: "DE",
    es: "ES",
    spain: "ES",
    it: "IT",
    italy: "IT",
    au: "AU",
    australia: "AU",
    mx: "MX",
    mexico: "MX",
    ca: "CA",
    canada: "CA",
    nl: "NL",
    netherlands: "NL",
    ru: "RU",
    russia: "RU",
    ng: "NG",
    nigeria: "NG",
    in: "IN",
    india: "IN",
    id: "ID",
    indonesia: "ID",
    ph: "PH",
    philippines: "PH",
  };
  if (map[s]) return map[s];
  const upper = String(input || "").toUpperCase().slice(0, 2);
  return upper || "US";
}

async function modernGet(path: string) {
  assertKey();
  const res = await fetch(`${MODERN_BASE}${path}`, {
    method: "GET",
    headers: {
      apikey: getApiKey(),
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
      json?.error?.description ||
      json?.message ||
      json?.error ||
      text ||
      res.statusText;
    throw new Error(String(msg));
  }
  return json;
}

async function legacyGet(params: Record<string, string>) {
  assertKey();
  const q = new URLSearchParams({
    ...params,
    apikey: getApiKey(),
  });
  const res = await fetch(`${LEGACY_BASE}?${q.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  const text = await res.text();
  if (text.includes("API KEY NOT FOUND")) {
    throw new Error("Invalid SMSPVA_API_KEY");
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/** Balance (legacy) */
export async function getBalance() {
  return legacyGet({ metod: "get_balance", service: "opt1" });
}

/** Count available numbers for service+country */
export async function getCount(country: string, service: string) {
  const c = normalizeSmspvaCountry(country);
  const s = normalizeSmspvaService(service);
  return legacyGet({ metod: "get_count", country: c, service: s });
}

/** Extract a sane USD price from SMSPVA API payloads */
export function parseUsdPrice(payload: any): number {
  if (payload == null) return 0;
  if (typeof payload === "number" && payload > 0) return payload;
  if (typeof payload === "string") {
    const n = Number(payload.replace(",", ".").replace(/[^0-9.]/g, ""));
    return !Number.isNaN(n) && n > 0 ? n : 0;
  }
  // Prefer explicit price fields only — NEVER use "response" (often "1" = success)
  const candidates = [
    payload.price,
    payload.Price,
    payload.data?.price,
    payload.cost,
    payload.data?.cost,
  ];
  for (const c of candidates) {
    if (c == null) continue;
    const n = Number(String(c).replace(",", "."));
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return 0;
}

/**
 * Normalize to realistic USD activation price.
 * SMSPVA website shows ~$0.50–$5 for most SMS activations.
 * If value looks like cents (e.g. 175), convert; if absurd, reject.
 */
export function normalizeActivationUsd(raw: number): number {
  if (!raw || Number.isNaN(raw) || raw <= 0) return 0;
  let usd = raw;
  // 50–5000 often means cents
  if (usd >= 50 && usd <= 5000) usd = usd / 100;
  // Still absurd for a single SMS activation
  if (usd > 25) return 0;
  if (usd < 0.01) return 0;
  return usd;
}

/** Price for service+country (USD) */
export async function getServicePrice(country: string, service: string) {
  const c = normalizeSmspvaCountry(country);
  const s = normalizeSmspvaService(service);
  return legacyGet({
    metod: "get_service_price",
    country: c,
    service: s,
  });
}

/**
 * Min USD among base price + all operator prices from one service row.
 * SMSPVA website "from $1.75" is the cheapest operator; single-price
 * endpoints often return a higher default (e.g. $3.02).
 */
function minPriceFromRow(row: any): number {
  if (!row || typeof row !== "object") return 0;
  const vals: number[] = [];
  for (const key of ["p", "price", "Price", "cost"]) {
    if (row[key] != null) {
      const n = normalizeActivationUsd(parseUsdPrice(row[key]));
      if (n > 0) vals.push(n);
    }
  }
  const po = row.po || row.operators || row.MobileOperators;
  if (po && typeof po === "object") {
    for (const v of Object.values(po)) {
      const n = normalizeActivationUsd(parseUsdPrice(v));
      if (n > 0) vals.push(n);
    }
  }
  if (!vals.length) return 0;
  return Math.min(...vals);
}

/**
 * All service prices for a country (modern).
 * GET /activation/serviceprice/{country}
 * → data: [{ s, sd, c, p, po: { OpName: "0.58", ... } }, ...]
 */
export async function getCountryServicePrices(
  country: string
): Promise<Map<string, { minUsd: number; baseUsd: number }>> {
  const c = normalizeSmspvaCountry(country);
  const map = new Map<string, { minUsd: number; baseUsd: number }>();
  try {
    const json = await modernGet(`/activation/serviceprice/${c}`);
    const rows = Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json)
      ? json
      : [];
    for (const row of rows) {
      const sid = String(row.s || row.Service || row.service || "").toLowerCase();
      if (!sid) continue;
      const minUsd = minPriceFromRow(row);
      const baseUsd = normalizeActivationUsd(
        parseUsdPrice(row.p ?? row.price ?? row.Price)
      );
      if (minUsd > 0) map.set(sid, { minUsd, baseUsd: baseUsd || minUsd });
    }
  } catch (e) {
    console.error("SMSPVA country prices", c, e);
  }
  return map;
}

/** Returns lowest operator USD price for service+country (0 if unknown). */
export async function getServicePriceUsd(
  country: string,
  service: string
): Promise<number> {
  const c = normalizeSmspvaCountry(country);
  const s = normalizeSmspvaService(service).toLowerCase();

  // 1) Country bulk prices — take MIN over operators (matches website "from $X")
  try {
    const map = await getCountryServicePrices(c);
    const hit = map.get(s);
    if (hit && hit.minUsd > 0) return hit.minUsd;
  } catch {
    /* fall through */
  }

  // 2) Single service modern
  try {
    const json = await modernGet(`/activation/serviceprice/${c}/${s}`);
    const data = json?.data ?? json;
    const min = minPriceFromRow(data);
    if (min > 0) return min;
    const p = normalizeActivationUsd(parseUsdPrice(data));
    if (p > 0) return p;
  } catch {
    /* fall through */
  }

  // 3) Legacy
  try {
    const res = await getServicePrice(c, s);
    const p = normalizeActivationUsd(parseUsdPrice(res));
    if (p > 0) return p;
  } catch {
    /* fall through */
  }

  return 0;
}

/**
 * Buy number – try modern API first, fall back to legacy
 */
export async function getNumber(country: string, service: string) {
  const c = normalizeSmspvaCountry(country);
  const s = normalizeSmspvaService(service);

  // Modern
  try {
    const json = await modernGet(`/activation/number/${c}/${s}`);
    const data = json?.data || json;
    const orderId = data?.orderId ?? data?.id;
    const phone = data?.phoneNumber ?? data?.number;
    if (orderId && phone) {
      return {
        id: String(orderId),
        number: String(phone),
        country: c,
        service: s,
        expireIn: data?.orderExpireIn,
        source: "modern" as const,
      };
    }
  } catch (e) {
    console.error("SMSPVA modern getNumber failed, trying legacy", e);
  }

  // Legacy
  const leg = await legacyGet({
    metod: "get_number",
    country: c,
    service: s,
  });
  if (String(leg?.response) === "1" && leg?.id && leg?.number) {
    return {
      id: String(leg.id),
      number: String(leg.number),
      country: c,
      service: s,
      source: "legacy" as const,
    };
  }
  if (String(leg?.response) === "2") {
    throw new Error("No numbers available for this service/country right now");
  }
  throw new Error(
    leg?.error || leg?.raw || JSON.stringify(leg) || "Failed to get number"
  );
}

/** Poll SMS */
export async function getSms(
  orderId: string,
  country: string,
  service: string
) {
  const c = normalizeSmspvaCountry(country);
  const s = normalizeSmspvaService(service);

  // Modern
  try {
    const json = await modernGet(`/activation/sms/${orderId}`);
    const data = json?.data || json;
    const code =
      data?.sms ||
      data?.code ||
      data?.text?.match?.(/\d{4,8}/)?.[0] ||
      null;
    if (code) {
      return { status: "ok", sms: String(code), number: data?.phoneNumber };
    }
  } catch {
    /* try legacy */
  }

  const leg = await legacyGet({
    metod: "get_sms",
    country: c,
    service: s,
    id: orderId,
  });
  // response 1 = got sms, 2 = waiting, 4 = already shown
  if (String(leg?.response) === "1" && leg?.sms) {
    return { status: "ok", sms: String(leg.sms), number: leg?.number };
  }
  if (String(leg?.response) === "4" && leg?.sms) {
    return { status: "ok", sms: String(leg.sms), number: leg?.number };
  }
  return { status: "waiting", sms: null, number: leg?.number };
}

/** Cancel / denial */
export async function cancelNumber(
  orderId: string,
  country: string,
  service: string
) {
  const c = normalizeSmspvaCountry(country);
  const s = normalizeSmspvaService(service);
  try {
    await modernGet(`/activation/cancelorder/${orderId}`);
  } catch {
    /* legacy */
  }
  try {
    await legacyGet({
      metod: "denial",
      country: c,
      service: s,
      id: orderId,
    });
  } catch {
    try {
      await legacyGet({
        metod: "get_denial",
        country: c,
        service: s,
        id: orderId,
      });
    } catch {
      /* ignore */
    }
  }
}

export function calcNairaFromUsd(
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
