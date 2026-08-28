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
export const SMSPVA_SERVICES: { id: string; name: string }[] = [
  { id: "opt20", name: "Facebook" },
  { id: "opt1", name: "WhatsApp" },
  { id: "opt16", name: "Telegram" },
  { id: "opt29", name: "Instagram" },
  { id: "opt81", name: "TikTok" },
  { id: "opt25", name: "Google" },
  { id: "opt45", name: "Discord" },
  { id: "opt22", name: "Twitter / X" },
  { id: "opt9", name: "Viber" },
  { id: "opt10", name: "WeChat" },
  { id: "opt19", name: "Amazon" },
  { id: "opt15", name: "Microsoft" },
  { id: "opt28", name: "Yahoo" },
  { id: "opt6", name: "Airbnb" },
  { id: "opt7", name: "Uber" },
  { id: "opt8", name: "Tinder" },
  { id: "opt2", name: "VK" },
  { id: "opt4", name: "Mail.ru" },
  { id: "opt86", name: "PayPal" },
  { id: "opt100", name: "Signal" },
  { id: "opt14", name: "Steam" },
  { id: "opt21", name: "Twitch" },
  { id: "opt23", name: "Netflix" },
  { id: "opt43", name: "Apple" },
  { id: "opt27", name: "Yandex" },
  { id: "opt61", name: "Badoo" },
  { id: "opt56", name: "Snapchat" },
  { id: "opt32", name: "LinkedIn" },
  { id: "opt39", name: "OkCupid" },
  { id: "opt38", name: "eBay" },
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
    facebook: "opt20",
    "facebook / meta viewpoints": "opt20",
    whatsapp: "opt1",
    telegram: "opt16",
    instagram: "opt29",
    "instagram (+threads)": "opt29",
    tiktok: "opt81",
    google: "opt25",
    discord: "opt45",
    twitter: "opt22",
    "twitter / x": "opt22",
    x: "opt22",
    viber: "opt9",
    amazon: "opt19",
    microsoft: "opt15",
    apple: "opt43",
    paypal: "opt86",
    signal: "opt100",
    steam: "opt14",
    tinder: "opt8",
    snapchat: "opt56",
    linkedin: "opt32",
    netflix: "opt23",
    ebay: "opt38",
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

/** Price for service+country (USD string often) */
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
