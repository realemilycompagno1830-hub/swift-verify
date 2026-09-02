/**
 * DarkStore API client
 * Docs: https://dark.shopping/developer
 * Base: https://dark.shopping/api/v1/
 * Auth: key query param
 * Order: GET/POST /order/create?key=&product=&quantity=&idempotence_id=
 */

const BASE = (process.env.DARKSTORE_BASE_URL || "https://dark.shopping/api/v1").replace(
  /\/$/,
  ""
);

function getKey(): string {
  return (process.env.DARKSTORE_API_KEY || "").trim();
}

function assertKey() {
  if (!getKey()) throw new Error("DARKSTORE_API_KEY is not set in Vercel");
}

function extractError(json: any, fallback: string): string {
  if (!json || typeof json !== "object") return fallback;
  const candidates = [
    json.message,
    json.error,
    json.name,
    json.data?.message,
    json.data?.error,
    Array.isArray(json.errors) ? json.errors[0]?.message : null,
  ];
  for (const c of candidates) {
    if (c != null && String(c).trim() && String(c).toUpperCase() !== "OK") {
      return String(c).trim();
    }
  }
  return fallback;
}

async function parseJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

async function darkGet(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {}
) {
  assertKey();
  const url = new URL(`${BASE}${path.startsWith("/") ? path : `/${path}`}`);
  url.searchParams.set("key", getKey());
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
  const json = await parseJson(res);
  if (!res.ok) {
    throw new Error(extractError(json, `HTTP ${res.status}`));
  }
  if (json?.success === false) {
    throw new Error(extractError(json, "Supplier rejected the request"));
  }
  return json;
}

async function darkPost(
  path: string,
  body: Record<string, string | number | boolean | undefined>
) {
  assertKey();
  const form = new URLSearchParams();
  form.set("key", getKey());
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined && v !== null && v !== "") form.set(k, String(v));
  }
  const res = await fetch(`${BASE}${path.startsWith("/") ? path : `/${path}`}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
    cache: "no-store",
  });
  const json = await parseJson(res);
  if (!res.ok) {
    throw new Error(extractError(json, `HTTP ${res.status}`));
  }
  if (json?.success === false) {
    throw new Error(extractError(json, "Supplier rejected the request"));
  }
  return json;
}

export async function listCategories() {
  return darkGet("/category/list");
}

export async function listProducts(opts: {
  page?: number;
  perPage?: number;
  name?: string;
  category_id?: number;
  only_in_stock?: number | boolean;
} = {}) {
  const onlyInStock =
    opts.only_in_stock === true
      ? 1
      : opts.only_in_stock === false
      ? 0
      : opts.only_in_stock;
  return darkGet("/product/list", {
    page: opts.page || 1,
    "per-page": opts.perPage || 50,
    name: opts.name,
    category_id: opts.category_id,
    only_in_stock: onlyInStock,
  });
}

export async function viewProduct(id: number) {
  return darkGet("/product/view", { id });
}

export async function getBalance(): Promise<{ balance: number; raw: any }> {
  const json = await darkGet("/user/balance");
  const data = json?.data ?? json;
  const balance = Number(
    data?.balance ?? data?.amount ?? data?.money ?? json?.balance ?? 0
  );
  return { balance: Number.isNaN(balance) ? 0 : balance, raw: json };
}

/**
 * Create order at DarkStore.
 * Docs: GET https://dark.shopping/api/v1/order/create?key=&product=&quantity=
 * Success: { success: true, data: { status: "ok"|"pending", id, link? } }
 */
export async function createOrder(
  productId: number,
  quantity = 1,
  idempotenceId?: string
) {
  const params: Record<string, string | number | undefined> = {
    product: productId,
    quantity,
  };
  if (idempotenceId) params.idempotence_id = idempotenceId;

  let json: any;
  let lastErr: Error | null = null;

  // Prefer GET (documented example URL), then POST
  try {
    json = await darkGet("/order/create", params);
  } catch (e1: any) {
    lastErr = e1 instanceof Error ? e1 : new Error(String(e1?.message || e1));
    try {
      json = await darkPost("/order/create", params);
      lastErr = null;
    } catch (e2: any) {
      lastErr = e2 instanceof Error ? e2 : new Error(String(e2?.message || e2));
    }
  }

  if (lastErr && !json) {
    throw lastErr;
  }

  const data = json?.data ?? json;
  if (json?.success === false) {
    throw new Error(extractError(json, "Supplier rejected the order"));
  }

  const orderId = data?.id ?? data?.order_id ?? json?.id ?? null;
  const status = String(data?.status || json?.status || "").toLowerCase();
  const link = data?.link ?? json?.link ?? null;

  // success:true with pending is valid (delivery later)
  if (orderId == null && !link && status !== "ok" && status !== "pending") {
    console.error("DarkStore createOrder unexpected response", JSON.stringify(json).slice(0, 800));
    throw new Error(
      extractError(
        json,
        "Supplier did not confirm the order. Check supplier balance/stock and try again."
      )
    );
  }

  return {
    raw: json,
    orderId: orderId != null ? String(orderId) : null,
    status: status || (link ? "ok" : "pending"),
    link: link ? String(link) : null,
    data,
  };
}

export async function orderStatus(orderId: string | number) {
  return darkGet("/order/status", { id: orderId });
}

export async function orderDownload(orderId: string | number) {
  return darkGet("/order/download", { id: orderId });
}

export async function softOrderDownload(orderId: string | number) {
  assertKey();
  const url = new URL(`${BASE}/order/download`);
  url.searchParams.set("key", getKey());
  url.searchParams.set("id", String(orderId));
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const json = await parseJson(res);
  return { ok: res.ok, status: res.status, json };
}

export async function softOrderStatus(orderId: string | number) {
  assertKey();
  const url = new URL(`${BASE}/order/status`);
  url.searchParams.set("key", getKey());
  url.searchParams.set("id", String(orderId));
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const json = await parseJson(res);
  return { ok: res.ok, status: res.status, json };
}

/** RUB → NGN with markup */
export function calcNairaFromRub(
  costRub: number,
  rubNgnRate: number,
  markupPercent: number
): number {
  return Math.max(
    1,
    Math.ceil(Number(costRub) * Number(rubNgnRate) * (1 + Number(markupPercent) / 100))
  );
}


export function extractProductList(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  const d = res.data ?? res;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.items)) return d.items;
  if (Array.isArray(d?.products)) return d.products;
  if (Array.isArray(res.products)) return res.products;
  return [];
}

export function isPreferredSocial(name: string, category?: string): boolean {
  const s = `${name} ${category || ""}`.toLowerCase();
  return /facebook|instagram|tiktok|threads|twitter|\bx\b|youtube|telegram/.test(
    s
  );
}

export function normalizeProduct(raw: any) {
  const id = Number(raw?.id ?? raw?.product_id);
  return {
    darkstore_id: id,
    name: String(raw?.name || raw?.title || `Product ${id}`),
    description: String(raw?.description || raw?.desc || ""),
    category_name: String(
      raw?.category_name || raw?.category?.name || raw?.category || "Other"
    ),
    category_id: Number(raw?.category_id ?? raw?.category?.id ?? 0) || null,
    image_url: raw?.image || raw?.image_url || raw?.img || null,
    stock: Number(raw?.count ?? raw?.stock ?? raw?.quantity ?? 0),
    cost_rub: Number(raw?.price ?? raw?.cost ?? raw?.price_rub ?? 0),
    raw,
  };
}
