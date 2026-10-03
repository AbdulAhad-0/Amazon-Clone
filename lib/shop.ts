import { createClient } from "@/lib/supabase/server";

// ---- server-side pricing (spec §4 business rules, ADR-004/016) ----
// Definitions live in lib/pricing.ts (pure module — no Supabase/Next imports,
// so client components can import pricing helpers without pulling cookies());
// re-exported here so server code keeps one import surface.
export {
  FREE_SHIPPING_CENTS,
  costBreakdown,
  effectivePriceCents,
  shippingCents,
  taxCents,
  type CostBreakdown,
} from "@/lib/pricing";

// ---- shared query shapes ----

export interface ProductCardData {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  priceCents: number;
  discountPct: number;
  ratingAvg: number;
  ratingCount: number;
  stock: number;
  image: string;
}

export interface GroupTileData {
  slug: string;
  name: string;
  image: string;
  /** Real product count in this nav group (no fake numbers, spec §4). */
  count: number;
}

function firstImage(images: { url: string; position: number }[] | null | undefined): string {
  if (!images || images.length === 0) return "";
  return [...images].sort((a, b) => a.position - b.position)[0].url;
}

// ---- home ----

export interface HomeData {
  groupTiles: GroupTileData[];
  topRated: ProductCardData[];
  deals: ProductCardData[];
  groupRails: { slug: string; name: string; items: ProductCardData[] }[];
}

type CardRow = {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  price_cents: number;
  discount_pct: number;
  rating_avg: number;
  rating_count: number;
  stock: number;
  product_images: { url: string; position: number }[] | null;
};

function toCardData(p: CardRow): ProductCardData {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    brand: p.brand,
    priceCents: p.price_cents,
    discountPct: p.discount_pct,
    ratingAvg: Number(p.rating_avg),
    ratingCount: p.rating_count,
    stock: p.stock,
    image: firstImage(p.product_images),
  };
}

export async function getHomeData(): Promise<HomeData> {
  const supabase = await createClient();

  const groupsRes = await supabase
    .from("nav_groups")
    .select("id, slug, name, sort_order")
    .order("sort_order");
  if (groupsRes.error) throw new Error(`nav_groups: ${groupsRes.error.message}`);

  const imgRes = await supabase
    .from("product_images")
    .select("url, position, products!inner(id, slug, rating_avg, categories!inner(nav_group_id))")
    .order("position");
  if (imgRes.error) throw new Error(`product_images: ${imgRes.error.message}`);

  const topRes = await supabase
    .from("products")
    .select("id, slug, title, brand, price_cents, discount_pct, rating_avg, rating_count, stock, product_images(url, position)")
    .order("rating_avg", { ascending: false })
    .order("slug", { ascending: true })
    .limit(8);
  if (topRes.error) throw new Error(`top rated: ${topRes.error.message}`);

  const dealsRes = await supabase
    .from("products")
    .select("id, slug, title, brand, price_cents, discount_pct, rating_avg, rating_count, stock, product_images(url, position)")
    .gt("discount_pct", 0)
    .order("discount_pct", { ascending: false })
    .order("slug", { ascending: true })
    .limit(8);
  if (dealsRes.error) throw new Error(`deals: ${dealsRes.error.message}`);

  // One query feeds both the tile counts and the per-group rails:
  // one row per (product, category-in-group), deduped by product id.
  const membersRes = await supabase
    .from("products")
    .select(
      "id, slug, title, brand, price_cents, discount_pct, rating_avg, rating_count, stock, categories!inner(nav_group_id), product_images(url, position)",
    );
  if (membersRes.error) throw new Error(`group members: ${membersRes.error.message}`);

  type ImgRow = {
    url: string;
    position: number;
    products: { id: string; slug: string; rating_avg: number; categories: { nav_group_id: string } };
  };
  const imgRows = (imgRes.data ?? []) as unknown as ImgRow[];

  const bestProduct = new Map<string, { id: string; rating: number; slug: string }>();
  const imageByProduct = new Map<string, string>();
  for (const row of imgRows) {
    const p = row.products;
    if (!imageByProduct.has(p.id)) imageByProduct.set(p.id, row.url);
    const navId = p.categories.nav_group_id;
    const cur = bestProduct.get(navId);
    if (!cur || p.rating_avg > cur.rating || (p.rating_avg === cur.rating && p.slug < cur.slug)) {
      bestProduct.set(navId, { id: p.id, rating: p.rating_avg, slug: p.slug });
    }
  }

  type MemberRow = CardRow & { categories: { nav_group_id: string } };
  const memberRows = (membersRes.data ?? []) as unknown as MemberRow[];
  const counts = new Map<string, Set<string>>();
  const membersByGroup = new Map<string, Map<string, CardRow>>();
  for (const row of memberRows) {
    const navId = row.categories.nav_group_id;
    if (!counts.has(navId)) counts.set(navId, new Set());
    counts.get(navId)!.add(row.id);
    let bucket = membersByGroup.get(navId);
    if (!bucket) {
      bucket = new Map();
      membersByGroup.set(navId, bucket);
    }
    const prev = bucket.get(row.id);
    if (!prev || Number(row.rating_avg) > Number(prev.rating_avg)) bucket.set(row.id, row);
  }

  const groupTiles: GroupTileData[] = (groupsRes.data ?? [])
    .filter((g) => bestProduct.has(g.id))
    .map((g) => {
      const best = bestProduct.get(g.id)!;
      return {
        slug: g.slug,
        name: g.name,
        image: imageByProduct.get(best.id) ?? "",
        count: counts.get(g.id)?.size ?? 0,
      };
    });

  const groupRails = (groupsRes.data ?? [])
    .map((g) => {
      const bucket = membersByGroup.get(g.id);
      if (!bucket || bucket.size === 0) return null;
      const items = [...bucket.values()]
        .sort((a, b) => Number(b.rating_avg) - Number(a.rating_avg) || (a.slug < b.slug ? -1 : 1))
        .slice(0, 8)
        .map(toCardData);
      return { slug: g.slug, name: g.name, items };
    })
    .filter((r): r is { slug: string; name: string; items: ProductCardData[] } => r !== null);

  const topRated = ((topRes.data ?? []) as CardRow[]).map(toCardData);
  const deals = ((dealsRes.data ?? []) as CardRow[]).map(toCardData);

  return { groupTiles, topRated, deals, groupRails };
}

// ---- category page ----

export interface CategoryPageData {
  name: string;
  total: number;
  page: number;
  pageCount: number;
  products: ProductCardData[];
}

export async function getCategoryPage(slug: string, page: number): Promise<CategoryPageData | null> {
  const supabase = await createClient();
  const PER_PAGE = 24;

  const groupRes = await supabase
    .from("nav_groups")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  if (groupRes.error) throw new Error(`nav_groups: ${groupRes.error.message}`);
  if (!groupRes.data) return null;
  const group = groupRes.data;

  const countRes = await supabase
    .from("products")
    .select("id, categories!inner(nav_group_id)", { count: "exact" })
    .eq("categories.nav_group_id", group.id)
    .limit(1);
  if (countRes.error) throw new Error(`category count: ${countRes.error.message}`);
  const total = countRes.count ?? 0;

  const listRes = await supabase
    .from("products")
    .select(
      "id, slug, title, brand, price_cents, discount_pct, rating_avg, rating_count, stock, categories!inner(nav_group_id), product_images(url, position)",
    )
    .eq("categories.nav_group_id", group.id)
    .order("rating_avg", { ascending: false })
    .order("slug", { ascending: true })
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  if (listRes.error) throw new Error(`category products: ${listRes.error.message}`);

  type CatRow = {
    id: string;
    slug: string;
    title: string;
    brand: string | null;
    price_cents: number;
    discount_pct: number;
    rating_avg: number;
    rating_count: number;
    stock: number;
    product_images: { url: string; position: number }[] | null;
  };
  const products: ProductCardData[] = ((listRes.data ?? []) as CatRow[]).map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    brand: p.brand,
    priceCents: p.price_cents,
    discountPct: p.discount_pct,
    ratingAvg: Number(p.rating_avg),
    ratingCount: p.rating_count,
    stock: p.stock,
    image: firstImage(p.product_images),
  }));

  return {
    name: group.name,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PER_PAGE)),
    products,
  };
}

// ---- category page support (Slice 5, Part 3) ----

export interface GroupMeta {
  id: string;
  slug: string;
  name: string;
}

export async function getGroupMeta(slug: string): Promise<GroupMeta | null> {
  const supabase = await createClient();
  const res = await supabase
    .from("nav_groups")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (res.error) throw new Error(`nav_groups: ${res.error.message}`);
  return res.data ?? null;
}

export interface CategoryChipData {
  slug: string;
  name: string;
  count: number;
}

/** Sub-category chips with counts + the unfiltered group total for "All". */
export async function getCategoryChips(
  navGroupId: string,
): Promise<{ chips: CategoryChipData[]; allCount: number }> {
  const supabase = await createClient();

  const catsRes = await supabase
    .from("categories")
    .select("id, slug, name")
    .eq("nav_group_id", navGroupId)
    .order("name");
  if (catsRes.error) throw new Error(`categories: ${catsRes.error.message}`);

  const chips: CategoryChipData[] = [];
  for (const c of catsRes.data ?? []) {
    const countRes = await supabase
      .from("products")
      .select("id, categories!inner(id)", { count: "exact", head: true })
      .eq("categories.id", c.id);
    if (countRes.error) throw new Error(`category count: ${countRes.error.message}`);
    chips.push({ slug: c.slug, name: c.name, count: countRes.count ?? 0 });
  }

  const allRes = await supabase
    .from("products")
    .select("id, categories!inner(nav_group_id)", { count: "exact", head: true })
    .eq("categories.nav_group_id", navGroupId);
  if (allRes.error) throw new Error(`group count: ${allRes.error.message}`);

  return { chips, allCount: allRes.count ?? 0 };
}

/** "Top rated" rail: 8 best-rated products in the group, no filters applied. */
export async function getTopRatedRail(navGroupId: string): Promise<ProductCardData[]> {
  const supabase = await createClient();
  const res = await supabase
    .from("products")
    .select(
      "id, slug, title, brand, price_cents, discount_pct, rating_avg, rating_count, stock, categories!inner(nav_group_id), product_images(url, position)",
    )
    .eq("categories.nav_group_id", navGroupId)
    .order("rating_avg", { ascending: false })
    .order("slug", { ascending: true })
    .limit(8);
  if (res.error) throw new Error(`top rated: ${res.error.message}`);

  type RailRow = {
    id: string;
    slug: string;
    title: string;
    brand: string | null;
    price_cents: number;
    discount_pct: number;
    rating_avg: number;
    rating_count: number;
    stock: number;
    product_images: { url: string; position: number }[] | null;
  };
  return ((res.data ?? []) as RailRow[]).map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    brand: p.brand,
    priceCents: p.price_cents,
    discountPct: p.discount_pct,
    ratingAvg: Number(p.rating_avg),
    ratingCount: p.rating_count,
    stock: p.stock,
    image: firstImage(p.product_images),
  }));
}

// ---- product detail ----

export interface ProductDetailData {
  id: string;
  slug: string;
  title: string;
  description: string;
  brand: string | null;
  priceCents: number;
  discountPct: number;
  stock: number;
  ratingAvg: number;
  ratingCount: number;
  categoryName: string;
  navGroupSlug: string;
  navGroupName: string;
  images: string[];
  related: ProductCardData[];
}

export async function getProductDetail(slug: string): Promise<ProductDetailData | null> {
  const supabase = await createClient();

  const res = await supabase
    .from("products")
    .select(
      "id, slug, title, description, brand, price_cents, discount_pct, stock, rating_avg, rating_count, categories!inner(name, nav_group_id, nav_groups!inner(slug, name)), product_images(url, position)",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (res.error) throw new Error(`product: ${res.error.message}`);
  if (!res.data) return null;

  type DetailRow = {
    id: string;
    slug: string;
    title: string;
    description: string;
    brand: string | null;
    price_cents: number;
    discount_pct: number;
    stock: number;
    rating_avg: number;
    rating_count: number;
    categories: { name: string; nav_group_id: string; nav_groups: { slug: string; name: string } };
    product_images: { url: string; position: number }[] | null;
  };
  const p = res.data as unknown as DetailRow;
  const images = [...(p.product_images ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((img) => img.url);

  const relRes = await supabase
    .from("products")
    .select(
      "id, slug, title, brand, price_cents, discount_pct, rating_avg, rating_count, stock, categories!inner(nav_group_id), product_images(url, position)",
    )
    .eq("categories.nav_group_id", p.categories.nav_group_id)
    .neq("slug", p.slug)
    .order("rating_avg", { ascending: false })
    .order("slug", { ascending: true })
    .limit(8);
  if (relRes.error) throw new Error(`related: ${relRes.error.message}`);

  type RelRow = {
    id: string;
    slug: string;
    title: string;
    brand: string | null;
    price_cents: number;
    discount_pct: number;
    rating_avg: number;
    rating_count: number;
    stock: number;
    product_images: { url: string; position: number }[] | null;
  };
  const related: ProductCardData[] = ((relRes.data ?? []) as RelRow[]).map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    brand: r.brand,
    priceCents: r.price_cents,
    discountPct: r.discount_pct,
    ratingAvg: Number(r.rating_avg),
    ratingCount: r.rating_count,
    stock: r.stock,
    image: firstImage(r.product_images),
  }));

  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    brand: p.brand,
    priceCents: p.price_cents,
    discountPct: p.discount_pct,
    stock: p.stock,
    ratingAvg: Number(p.rating_avg),
    ratingCount: p.rating_count,
    categoryName: p.categories.name,
    navGroupSlug: p.categories.nav_groups.slug,
    navGroupName: p.categories.nav_groups.name,
    images,
    related,
  };
}
