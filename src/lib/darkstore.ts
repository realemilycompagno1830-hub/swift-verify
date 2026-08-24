/**
 * DarkStore API client
 * Docs: https://dark.shopping/developer
 * Base: https://dark.shopping/api/v1/
 * Auth: key query/body param
 * Rate limit: ~2 req/s
 */

const BASE = process.env.DARKSTORE_BASE_URL || "https://dark.shopping/api/v1";
const API_KEY = process.env.DARKSTORE_API_KEY;

function assertKey() {
  if (!API_KEY) throw new Error("DARKSTORE_API_KEY is not set");
}

async function darkGet(path: string, params: Record<string, string | number | boolean | undefined> = {}) {
  assertKey();
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("key", API_KEY!);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    const msg = json?.message || json?.name || res.statusText || "Request failed";
    throw new Error(`DarkStore ${res.status || 400}: ${msg}`);
  }
  return json;
}

async function darkPost(path: string, body: Record<string, string | number | boolean | undefined>) {
  assertKey();
  const form = new URLSearchParams();
  form.set("key", API_KEY!);
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined && v !== null && v !== "") form.set(k, String(v));
  }
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    const msg = json?.message || json?.name || res.statusText || "Request failed";
    throw new Error(`DarkStore ${res.status || 400}: ${msg}`);
  }
  return json;
}

export async function listCategories() {
  return darkGet("/category/list");
}

export async function listProducts(opts: {
  category_id?: number;
  only_in_stock?: boolean;
  page?: number;
  perPage?: number;
  name?: string;
} = {}) {
  return darkGet("/product/list", {
    category_id: opts.category_id,
    only_in_stock: opts.only_in_stock ? 1 : undefined,
    page: opts.page || 1,
    "per-page": opts.perPage || 50,
    name: opts.name,
  });
}

export async function viewProduct(id: number) {
  return darkGet("/product/view", { id });
}

export async function getBalance() {
  return darkGet("/user/balance");
}

export async function createOrder(productId: number, quantity = 1, idempotenceId?: string) {
  // DarkStore accepts GET or POST for order/create
  let json: any;
  try {
    json = await darkGet("/order/create", {
      product: productId,
      quantity,
      idempotence_id: idempotenceId,
    });
  } catch (e1: any) {
    try {
      json = await darkPost("/order/create", {
        product: productId,
        quantity,
        idempotence_id: idempotenceId,
      });
    } catch (e2: any) {
      throw new Error(e2?.message || e1?.message || "DarkStore order/create failed");
    }
  }

  // Normalize: some responses wrap in { success, data }
  const data = json?.data ?? json;
  const successFlag = json?.success;
  if (successFlag === false) {
    const msg =
      json?.message ||
      data?.message ||
      "DarkStore rejected the order";
    throw new Error(String(msg));
  }

  // Must have an order id OR a download link, otherwise treat as failure
  const orderId = data?.id ?? data?.order_id ?? json?.id;
  const link = data?.link ?? json?.link;
  if (orderId == null && !link) {
    throw new Error(
      "DarkStore returned no order id. Check supplier balance / stock. Response: " +
        JSON.stringify(json).slice(0, 300)
    );
  }

  return json;
}

export async function orderStatus(orderId: string | number) {
  return darkGet("/order/status", { id: orderId });
}

export async function orderDownload(orderId: string | number) {
  return darkGet("/order/download", { id: orderId });
}

/** Same as darkGet but does not throw — used for polling delivery */
export async function softOrderDownload(orderId: string | number) {
  assertKey();
  const url = new URL(`${BASE}/order/download`);
  url.searchParams.set("key", API_KEY!);
  url.searchParams.set("id", String(orderId));
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export async function softOrderStatus(orderId: string | number) {
  assertKey();
  const url = new URL(`${BASE}/order/status`);
  url.searchParams.set("key", API_KEY!);
  url.searchParams.set("id", String(orderId));
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}


/** Prefer FB / IG / TikTok in name or category for v1 sorting */
export function isPreferredSocial(name: string, categoryName?: string): boolean {
  const t = `${name} ${categoryName || ""}`.toLowerCase();
  return (
    t.includes("facebook") ||
    t.includes("instagram") ||
    t.includes("tiktok") ||
    t.includes("tik tok") ||
    t.includes("fb ") ||
    t.includes("meta")
  );
}

export function calcNairaFromRub(
  costRub: number,
  rubNgnRate: number,
  markupPercent: number,
  overrideNaira?: number | null
): number {
  if (overrideNaira != null && overrideNaira > 0) return Math.ceil(overrideNaira);
  const naira = costRub * rubNgnRate * (1 + markupPercent / 100);
  return Math.max(1, Math.ceil(naira));
}

export function extractProductList(apiResponse: any): any[] {
  const d = apiResponse?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.items)) return d.items;
  if (Array.isArray(apiResponse)) return apiResponse;
  return [];
}

export function normalizeProduct(p: any) {
  const categoryName =
    p.category?.name ||
    p.group?.name ||
    p.category_name ||
    "Other";
  return {
    darkstore_id: Number(p.id),
    name: String(p.name || "Unnamed"),
    description: typeof p.description === "string" ? p.description : "",
    category_name: categoryName,
    category_id: p.category?.id ? Number(p.category.id) : p.category_id || null,
    image_url: p.miniature || p.image || null,
    stock: Number(p.quantity ?? 0),
    cost_rub: Number(p.price ?? 0),
    raw: p,
  };
}
