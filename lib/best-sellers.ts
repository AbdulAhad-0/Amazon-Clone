import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { MIN_SALES_FOR_RANKING } from "@/lib/constants";
import type { ProductCardData } from "@/lib/shop";

export interface BestSellersData {
  items: ProductCardData[];
  fallback: boolean;
  totalUnits: number;
}

interface Row {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  price_cents: number;
  discount_pct: number;
  rating_avg: number;
  rating_count: number;
  seed_rating_count: number | null;
  stock: number;
  product_images: { url: string; position: number }[] | null;
}

const CARD_SELECT =
  "id, slug, title, brand, price_cents, discount_pct, rating_avg, rating_count, seed_rating_count, stock, product_images(url, position)";

function toCard(r: Row): ProductCardData {
  const images = [...(r.product_images ?? [])].sort((a, b) => a.position - b.position);
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    brand: r.brand,
    priceCents: Number(r.price_cents),
    discountPct: Number(r.discount_pct),
    ratingAvg: Number(r.rating_avg),
    ratingCount: Number(r.rating_count) - Number(r.seed_rating_count ?? 0),
    stock: r.stock,
    image: images[0]?.url ?? "",
  };
}

async function fetchCards(admin: ReturnType<typeof createAdminClient>, ids: string[]): Promise<Map<string, ProductCardData>> {
  const map = new Map<string, ProductCardData>();
  if (ids.length === 0) return map;
  const res = await admin.from("products").select(CARD_SELECT).in("id", ids).gt("stock", 0);
  if (res.error) throw new Error(`best-sellers cards: ${res.error.message}`);
  for (const r of (res.data ?? []) as Row[]) map.set(r.id, toCard(r));
  return map;
}

// Rank by units sold (sum of qty over non-cancelled order_items), ties by
// rating then id, in-stock only. Falls back to top rated when order_items is
// missing or total units < MIN_SALES_FOR_RANKING. Never claims fake sales.
export async function getBestSellers(): Promise<BestSellersData> {
  const admin = createAdminClient();
  let units = new Map<string, number>();
  let totalUnits = 0;
  let salesOk = false;

  try {
    const orders = await admin.from("orders").select("id").neq("status", "cancelled").limit(1000);
    if (orders.error) throw orders.error;
    const orderIds = (orders.data ?? []).map((o) => o.id);
    if (orderIds.length > 0) {
      const items = await admin
        .from("order_items")
        .select("product_id, qty")
        .in("order_id", orderIds)
        .limit(1000);
      if (items.error) throw items.error;
      for (const it of (items.data ?? []) as { product_id: string; qty: number }[]) {
        units.set(it.product_id, (units.get(it.product_id) ?? 0) + it.qty);
        totalUnits += it.qty;
      }
    }
    salesOk = totalUnits >= MIN_SALES_FOR_RANKING;
  } catch {
    salesOk = false; // order_items table missing or unreadable -> fallback
  }

  if (!salesOk) {
    const res = await admin
      .from("products")
      .select(CARD_SELECT)
      .gt("stock", 0)
      .order("rating_avg", { ascending: false })
      .order("id", { ascending: true })
      .limit(100);
    if (res.error) throw new Error(`best-sellers fallback: ${res.error.message}`);
    return {
      items: ((res.data ?? []) as Row[]).map(toCard),
      fallback: true,
      totalUnits,
    };
  }

  const rankedIds = [...units.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100)
    .map(([id]) => id);
  const cards = await fetchCards(admin, rankedIds);
  const withSales = rankedIds
    .map((id, i) => ({ id, i, card: cards.get(id) }))
    .filter((x): x is { id: string; i: number; card: ProductCardData } => Boolean(x.card));

  // ties: rating desc then id asc (rank order preserved for equal units)
  withSales.sort((a, b) => {
    const ua = units.get(a.id) ?? 0;
    const ub = units.get(b.id) ?? 0;
    if (ua !== ub) return ub - ua;
    if (a.card.ratingAvg !== b.card.ratingAvg) return b.card.ratingAvg - a.card.ratingAvg;
    return a.id < b.id ? -1 : 1;
  });

  return { items: withSales.map((x) => x.card), fallback: false, totalUnits };
}
