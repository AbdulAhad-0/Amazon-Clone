import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductCardData } from "@/lib/shop";

// ---- escaping: raw input NEVER reaches a filter string unescaped ----

const RESERVED = /[\\%_*,'()[\]"]/g;

export function escapeLike(input: string): string {
  return input.replace(RESERVED, (c) => `\\${c}`);
}

// Builds a PostgREST or-clause from CONSTANT column names and one escaped,
// double-quoted value. Commas/parens inside q are escaped, so q can never
// add clauses; LIKE wildcards are escaped, so q can never add patterns.
export function buildQOrClause(q: string): string {
  const pattern = `%${escapeLike(q)}%`;
  return `title.ilike."${pattern}",description.ilike."${pattern}",brand.ilike."${pattern}"`;
}

// ---- param parsing (pure; the only place user params are interpreted) ----

export type SearchParams = Record<string, string | string[] | undefined>;

export const SORT_VALUES = ["relevance", "price_asc", "price_desc", "rating", "newest"] as const;
export type SortValue = (typeof SORT_VALUES)[number];

export interface ParsedSearchParams {
  q?: string;
  group?: string;
  brand?: string;
  minCents?: number;
  maxCents?: number;
  rating?: 3 | 4;
  sort: SortValue;
  page: number;
}

function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

export function dollarsToCents(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+(\.\d{1,2})?$/.test(value)) return undefined;
  return Math.round(parseFloat(value) * 100);
}

export function parseSearchParams(raw: SearchParams): ParsedSearchParams {
  const out: ParsedSearchParams = { sort: "relevance", page: 1 };

  const q = first(raw.q);
  if (q !== undefined) out.q = q;

  const group = first(raw.group);
  if (group !== undefined) out.group = group;

  const brand = first(raw.brand);
  if (brand !== undefined) out.brand = brand;

  let minCents = dollarsToCents(first(raw.min));
  let maxCents = dollarsToCents(first(raw.max));
  if (minCents !== undefined && maxCents !== undefined && minCents > maxCents) {
    [minCents, maxCents] = [maxCents, minCents];
  }
  if (minCents !== undefined) out.minCents = minCents;
  if (maxCents !== undefined) out.maxCents = maxCents;

  const rating = first(raw.rating);
  if (rating === "4" || rating === "3") out.rating = Number(rating) as 3 | 4;

  const sort = first(raw.sort);
  if (sort !== undefined && (SORT_VALUES as readonly string[]).includes(sort)) {
    out.sort = sort as SortValue;
  }

  const page = first(raw.page);
  if (page !== undefined && /^\d+$/.test(page)) {
    const n = Number.parseInt(page, 10);
    if (n >= 1) out.page = n;
  }

  return out;
}

// ---- URL building (rail + sheet both write through this one helper) ----

function centsToDollars(cents: number): string {
  return (cents / 100).toString();
}

export function buildSearchUrl(parsed: ParsedSearchParams): string {
  const params = new URLSearchParams();
  if (parsed.q !== undefined) params.set("q", parsed.q);
  if (parsed.group !== undefined) params.set("group", parsed.group);
  if (parsed.brand !== undefined) params.set("brand", parsed.brand);
  if (parsed.minCents !== undefined) params.set("min", centsToDollars(parsed.minCents));
  if (parsed.maxCents !== undefined) params.set("max", centsToDollars(parsed.maxCents));
  if (parsed.rating !== undefined) params.set("rating", String(parsed.rating));
  if (parsed.sort !== "relevance") params.set("sort", parsed.sort);
  if (parsed.page !== 1) params.set("page", String(parsed.page));
  const qs = params.toString();
  return qs === "" ? "/search" : `/search?${qs}`;
}

// ---- query execution (validated values only; eq/in are bound params) ----

export const SEARCH_PAGE_SIZE = 24;

export interface SearchResult {
  items: ProductCardData[];
  total: number;
  page: number;
  pageSize: number;
  brands: string[];
}

const ORDERS: Record<SortValue, { col: string; asc: boolean }[]> = {
  relevance: [
    { col: "rating_avg", asc: false },
    { col: "slug", asc: true },
  ],
  price_asc: [
    { col: "price_cents", asc: true },
    { col: "slug", asc: true },
  ],
  price_desc: [
    { col: "price_cents", asc: false },
    { col: "slug", asc: true },
  ],
  rating: [
    { col: "rating_avg", asc: false },
    { col: "slug", asc: true },
  ],
  newest: [
    { col: "created_at", asc: false },
    { col: "slug", asc: true },
  ],
};

interface ImageRow {
  url: string;
  position: number;
}

interface ProductRow {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  price_cents: number;
  discount_pct: number;
  rating_avg: number;
  rating_count: number;
  stock: number;
  product_images: ImageRow[] | null;
}

function firstImage(images: ImageRow[] | null): string {
  if (!images || images.length === 0) return "";
  return [...images].sort((a, b) => a.position - b.position)[0]?.url ?? "";
}

export async function applyFilters(qb: SupabaseClient, raw: SearchParams): Promise<SearchResult> {
  const p = parseSearchParams(raw);

  let navGroupId: string | undefined;
  if (p.group !== undefined) {
    const g = await qb.from("nav_groups").select("id").eq("slug", p.group).maybeSingle();
    if (g.error) throw new Error(`nav_groups: ${g.error.message}`);
    if (g.data) navGroupId = g.data.id;
  }

  let brand: string | undefined;
  if (p.brand !== undefined) {
    const b = await qb.from("products").select("brand").eq("brand", p.brand).limit(1);
    if (b.error) throw new Error(`brand check: ${b.error.message}`);
    if ((b.data ?? []).length > 0) brand = p.brand;
  }

  const select = navGroupId !== undefined
    ? "id, slug, title, brand, price_cents, discount_pct, rating_avg, rating_count, stock, product_images(url, position), categories!inner(nav_group_id)"
    : "id, slug, title, brand, price_cents, discount_pct, rating_avg, rating_count, stock, product_images(url, position)";

  let query = qb.from("products").select(select, { count: "exact" });
  if (navGroupId !== undefined) query = query.eq("categories.nav_group_id", navGroupId);
  if (brand !== undefined) query = query.eq("brand", brand);
  if (p.minCents !== undefined) query = query.gte("price_cents", p.minCents);
  if (p.maxCents !== undefined) query = query.lte("price_cents", p.maxCents);
  if (p.rating !== undefined) query = query.gte("rating_avg", p.rating);
  if (p.q !== undefined) query = query.or(buildQOrClause(p.q));
  for (const o of ORDERS[p.sort]) query = query.order(o.col, { ascending: o.asc });
  const from = (p.page - 1) * SEARCH_PAGE_SIZE;
  query = query.range(from, from + SEARCH_PAGE_SIZE - 1);

  const res = await query;
  if (res.error) throw new Error(`search: ${res.error.message}`);

  const items: ProductCardData[] = ((res.data ?? []) as unknown as ProductRow[]).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    brand: row.brand,
    priceCents: row.price_cents,
    discountPct: row.discount_pct,
    ratingAvg: Number(row.rating_avg),
    ratingCount: row.rating_count,
    stock: row.stock,
    image: firstImage(row.product_images),
  }));

  const brands = [...new Set(items.map((i) => i.brand).filter((b): b is string => b !== null))].sort();

  return {
    items,
    total: res.count ?? 0,
    page: p.page,
    pageSize: SEARCH_PAGE_SIZE,
    brands,
  };
}
