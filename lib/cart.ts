import type { SupabaseClient } from "@supabase/supabase-js";
import { effectivePriceCents, FREE_SHIPPING_CENTS, shippingCents, taxCents } from "@/lib/pricing";

export const MAX_CART_QTY = 30;
export const MAX_GUEST_LINES = 100;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GuestLine {
  productId: string;
  qty: number;
}

export interface CartLine {
  productId: string;
  title: string;
  slug: string;
  priceCents: number;
  discountPct: number;
  qty: number;
  imageUrl: string;
  stock: number;
  lineTotalCents: number;
}

export interface CartTotals {
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  freeShippingGapCents: number;
}

export type CartResult =
  | { ok: true; lines: CartLine[]; totals: CartTotals; dropped?: number; alreadyMerged?: boolean }
  | { ok: false; error: "STOCK" | "AUTH" | "SERVER"; available?: number };

// localStorage may hold anything (other tabs, older versions, tampering):
// malformed input yields [] — never throws, never trusts stored prices.
export function parseGuestCart(raw: unknown): GuestLine[] {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(data)) return [];

  const byId = new Map<string, number>();
  for (const entry of data) {
    if (typeof entry !== "object" || entry === null) continue;
    const productId = (entry as { productId?: unknown }).productId;
    const qty = (entry as { qty?: unknown }).qty;
    if (typeof productId !== "string" || !UUID_RE.test(productId)) continue;
    const n = typeof qty === "number" && Number.isFinite(qty) ? Math.floor(qty) : 1;
    const clamped = Math.min(Math.max(n, 1), MAX_CART_QTY);
    byId.set(productId, Math.min((byId.get(productId) ?? 0) + clamped, MAX_CART_QTY));
  }
  if (byId.size > MAX_GUEST_LINES) {
    return [...byId].slice(0, MAX_GUEST_LINES).map(([productId, qty]) => ({ productId, qty }));
  }
  return [...byId].map(([productId, qty]) => ({ productId, qty }));
}

// All money on the server from DB rows — effective price, free-shipping
// threshold and 8% tax come from lib/shop.ts (ADR-004/016, spec §4).
export function cartTotals(lines: Pick<CartLine, "qty" | "priceCents" | "discountPct">[]): CartTotals {
  if (lines.length === 0) {
    return {
      subtotalCents: 0,
      shippingCents: 0,
      taxCents: 0,
      totalCents: 0,
      freeShippingGapCents: FREE_SHIPPING_CENTS,
    };
  }
  const subtotalCents = lines.reduce(
    (sum, line) => sum + effectivePriceCents(line.priceCents, line.discountPct) * line.qty,
    0,
  );
  const shipping = shippingCents(subtotalCents);
  const tax = taxCents(subtotalCents);
  return {
    subtotalCents,
    shippingCents: shipping,
    taxCents: tax,
    totalCents: subtotalCents + shipping + tax,
    freeShippingGapCents: Math.max(0, FREE_SHIPPING_CENTS - subtotalCents),
  };
}

interface ProductRow {
  id: string;
  slug: string;
  title: string;
  price_cents: number;
  discount_pct: number;
  stock: number;
  product_images: { url: string; position: number }[] | null;
}

function firstImage(images: { url: string; position: number }[] | null): string {
  if (!images || images.length === 0) return "";
  return [...images].sort((a, b) => a.position - b.position)[0]?.url ?? "";
}

function toLines(rows: ProductRow[], qtys: Map<string, number>): CartLine[] {
  return rows.map((row) => {
    const qty = qtys.get(row.id) ?? 1;
    const unit = effectivePriceCents(row.price_cents, row.discount_pct);
    return {
      productId: row.id,
      title: row.title,
      slug: row.slug,
      priceCents: row.price_cents,
      discountPct: row.discount_pct,
      qty,
      imageUrl: firstImage(row.product_images),
      stock: row.stock,
      lineTotalCents: unit * qty,
    };
  });
}

export async function getCartLines(db: SupabaseClient): Promise<CartLine[]> {
  const res = await db
    .from("cart_items")
    .select(
      "qty, added_at, products(id, slug, title, price_cents, discount_pct, stock, product_images(url, position))",
    )
    .order("added_at", { ascending: true });
  if (res.error) throw new Error(`cart: ${res.error.message}`);

  type Row = { qty: number; products: ProductRow };
  const rows = (res.data ?? []) as unknown as Row[];
  const qtys = new Map<string, number>();
  const products: ProductRow[] = [];
  for (const row of rows) {
    if (!row.products) continue;
    qtys.set(row.products.id, row.qty);
    products.push(row.products);
  }
  return toLines(products, qtys);
}

export async function getCartCount(db: SupabaseClient, userId: string): Promise<number> {
  const res = await db
    .from("cart_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (res.error) throw new Error(`cart count: ${res.error.message}`);
  return res.count ?? 0;
}

async function success(db: SupabaseClient): Promise<Extract<CartResult, { ok: true }>> {
  const lines = await getCartLines(db);
  return { ok: true, lines, totals: cartTotals(lines) };
}

// Guest cart preview: current price/stock/status straight from the DB for the
// ids the client holds — localStorage never stores money.
export async function previewLines(
  db: SupabaseClient,
  guest: GuestLine[],
): Promise<{ lines: CartLine[]; dropped: number }> {
  if (guest.length === 0) return { lines: [], dropped: 0 };
  const ids = guest.map((g) => g.productId);
  const res = await db
    .from("products")
    .select("id, slug, title, price_cents, discount_pct, stock, product_images(url, position)")
    .in("id", ids);
  if (res.error) throw new Error(`preview: ${res.error.message}`);

  const qtys = new Map(guest.map((g) => [g.productId, g.qty]));
  const kept: ProductRow[] = [];
  let dropped = 0;
  for (const row of (res.data ?? []) as unknown as ProductRow[]) {
    if (row.stock < 1) {
      dropped += 1;
      qtys.delete(row.id);
      continue;
    }
    qtys.set(row.id, Math.min(qtys.get(row.id) ?? 1, row.stock, MAX_CART_QTY));
    kept.push(row);
  }
  dropped += ids.filter((id) => !kept.some((row) => row.id === id)).length;
  return { lines: toLines(kept, qtys), dropped };
}

async function loadProduct(db: SupabaseClient, productId: string): Promise<{ id: string; stock: number } | null> {
  const res = await db.from("products").select("id, stock").eq("id", productId).maybeSingle();
  if (res.error) throw new Error(`product: ${res.error.message}`);
  return res.data;
}

// Stock check lives inside every write path (architecture §4): disabled
// buttons are cosmetic — the server rejects qty > stock regardless.
export async function addLine(
  db: SupabaseClient,
  userId: string,
  productId: string,
  qty: number,
): Promise<CartResult> {
  try {
    const requested = Math.min(Math.max(Math.floor(qty) || 1, 1), MAX_CART_QTY);
    const product = await loadProduct(db, productId);
    if (!product) return { ok: false, error: "SERVER" };
    if (requested > product.stock) {
      return { ok: false, error: "STOCK", available: Math.max(product.stock, 0) };
    }

    const existing = await db
      .from("cart_items")
      .select("qty")
      .eq("user_id", userId)
      .eq("product_id", productId)
      .maybeSingle();
    if (existing.error) throw new Error(`cart read: ${existing.error.message}`);

    const next = Math.min((existing.data?.qty ?? 0) + requested, product.stock, MAX_CART_QTY);
    const up = await db
      .from("cart_items")
      .upsert({ user_id: userId, product_id: productId, qty: next }, { onConflict: "user_id,product_id" });
    if (up.error) throw new Error(`cart upsert: ${up.error.message}`);

    return await success(db);
  } catch {
    return { ok: false, error: "SERVER" };
  }
}

export async function setLineQty(
  db: SupabaseClient,
  userId: string,
  productId: string,
  qty: number,
): Promise<CartResult> {
  try {
    if (!Number.isFinite(qty) || qty <= 0) {
      const del = await db.from("cart_items").delete().eq("user_id", userId).eq("product_id", productId);
      if (del.error) throw new Error(`cart delete: ${del.error.message}`);
      return await success(db);
    }

    const requested = Math.min(Math.max(Math.floor(qty), 1), MAX_CART_QTY);
    const product = await loadProduct(db, productId);
    if (!product) return { ok: false, error: "SERVER" };
    if (requested > product.stock) {
      return { ok: false, error: "STOCK", available: Math.max(product.stock, 0) };
    }

    const up = await db
      .from("cart_items")
      .upsert(
        { user_id: userId, product_id: productId, qty: Math.min(requested, product.stock) },
        { onConflict: "user_id,product_id" },
      );
    if (up.error) throw new Error(`cart upsert: ${up.error.message}`);

    return await success(db);
  } catch {
    return { ok: false, error: "SERVER" };
  }
}

// One idempotent merge: the (user_id, merge_id) PK claims the merge before
// any qty is added, so a double run (strict-mode effect, retry) applies once.
// Quantities are added, capped at stock and MAX_CART_QTY; storage is cleared
// by the caller only after ok.
export async function mergeGuest(
  db: SupabaseClient,
  userId: string,
  guest: GuestLine[],
  mergeId: string,
): Promise<CartResult> {
  try {
    if (!mergeId || mergeId.length > 128) return { ok: false, error: "SERVER" };

    const claim = await db
      .from("cart_merges")
      .upsert({ user_id: userId, merge_id: mergeId }, { onConflict: "user_id,merge_id", ignoreDuplicates: true })
      .select("merge_id");
    if (claim.error) throw new Error(`merge claim: ${claim.error.message}`);
    if ((claim.data ?? []).length === 0) {
      const lines = await getCartLines(db);
      return { ok: true, lines, totals: cartTotals(lines), alreadyMerged: true };
    }

    if (guest.length === 0) return await success(db);

    const ids = guest.map((g) => g.productId);
    const prodRes = await db.from("products").select("id, stock").in("id", ids);
    if (prodRes.error) throw new Error(`merge products: ${prodRes.error.message}`);
    const stockById = new Map((prodRes.data ?? []).map((p) => [p.id, p.stock]));
    let dropped = ids.filter((id) => !stockById.has(id)).length;

    const existingRes = await db
      .from("cart_items")
      .select("product_id, qty")
      .eq("user_id", userId)
      .in("product_id", ids);
    if (existingRes.error) throw new Error(`merge cart read: ${existingRes.error.message}`);
    const existing = new Map((existingRes.data ?? []).map((r) => [r.product_id, r.qty]));

    const rows: { user_id: string; product_id: string; qty: number }[] = [];
    for (const g of guest) {
      const stock = stockById.get(g.productId);
      if (stock === undefined) continue;
      if (stock < 1) {
        dropped += 1;
        continue;
      }
      const base = existing.get(g.productId) ?? 0;
      const next = Math.min(base + g.qty, stock, MAX_CART_QTY);
      if (next <= base) continue;
      rows.push({ user_id: userId, product_id: g.productId, qty: next });
    }

    if (rows.length > 0) {
      const up = await db.from("cart_items").upsert(rows, { onConflict: "user_id,product_id" });
      if (up.error) {
        await db.from("cart_merges").delete().eq("user_id", userId).eq("merge_id", mergeId);
        throw up.error;
      }
    }

    const lines = await getCartLines(db);
    return { ok: true, lines, totals: cartTotals(lines), dropped: dropped > 0 ? dropped : undefined };
  } catch {
    return { ok: false, error: "SERVER" };
  }
}
