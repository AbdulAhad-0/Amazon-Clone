import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("STOP: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

interface SeedFile {
  fetchedAt: string;
  navGroups: { slug: string; name: string; sortOrder: number }[];
  categories: {
    slug: string;
    name: string;
    navGroupSlug: string;
    sortOrder: number;
  }[];
  products: {
    slug: string;
    title: string;
    description: string;
    brand: string | null;
    categorySlug: string;
    priceCents: number;
    discountPct: number;
    seedRatingAvg: number;
    seedRatingCount: number;
    stock: number;
    images: string[];
  }[];
}

function fail(msg: string): never {
  console.error(`STOP: ${msg}`);
  process.exit(1);
}

function check(error: { message: string } | null, what: string): void {
  if (error) fail(`${what}: ${error.message}`);
}

const data = JSON.parse(
  readFileSync(join(process.cwd(), "data", "seed-products.json"), "utf8"),
) as SeedFile;

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

async function main() {
  const navRows = data.navGroups.map((g) => ({
    slug: g.slug,
    name: g.name,
    sort_order: g.sortOrder,
  }));
  check(
    (await db.from("nav_groups").upsert(navRows, { onConflict: "slug" })).error,
    "nav_groups upsert",
  );
  const nav = await db.from("nav_groups").select("id,slug");
  check(nav.error, "nav_groups select");
  const navId = new Map((nav.data ?? []).map((r) => [r.slug as string, r.id as string]));
  for (const g of data.navGroups)
    console.log(`nav ${g.slug}: ${navId.has(g.slug) ? "upserted" : "MISSING ID"}`);

  const catRows = data.categories.map((c) => {
    const id = navId.get(c.navGroupSlug);
    if (!id) fail(`nav group ${c.navGroupSlug} missing (category ${c.slug})`);
    return { slug: c.slug, name: c.name, nav_group_id: id, sort_order: c.sortOrder };
  });
  check(
    (await db.from("categories").upsert(catRows, { onConflict: "slug" })).error,
    "categories upsert",
  );
  const cat = await db.from("categories").select("id,slug");
  check(cat.error, "categories select");
  const catId = new Map((cat.data ?? []).map((r) => [r.slug as string, r.id as string]));

  const existing = await db.from("products").select("slug");
  check(existing.error, "products select (existing slugs)");
  const existingSlugs = new Set((existing.data ?? []).map((r) => r.slug as string));

  const base = (p: SeedFile["products"][number]) => {
    const category_id = catId.get(p.categorySlug);
    if (!category_id) fail(`category ${p.categorySlug} missing (product ${p.slug})`);
    return {
      slug: p.slug,
      title: p.title,
      description: p.description,
      category_id: category_id as string,
      brand: p.brand,
      price_cents: p.priceCents,
      discount_pct: p.discountPct,
      stock: p.stock,
      seed_rating_avg: p.seedRatingAvg,
      seed_rating_count: p.seedRatingCount,
    };
  };

  const fresh = data.products.filter((p) => !existingSlugs.has(p.slug));
  const rerun = data.products.filter((p) => existingSlugs.has(p.slug));

  if (fresh.length > 0) {
    check(
      (
        await db
          .from("products")
          .upsert(
            fresh.map((p) => ({
              ...base(p),
              rating_avg: p.seedRatingAvg,
              // ADR-022: rating_count = real reviews only, never the seed's 3
              rating_count: 0,
            })),
            { onConflict: "slug" },
          )
      ).error,
      "products first-load upsert (with rating baseline)",
    );
  }
  if (rerun.length > 0) {
    check(
      (await db.from("products").upsert(rerun.map(base), { onConflict: "slug" })).error,
      "products upsert (existing; rating_* untouched)",
    );
  }

  // ADR-022: rows still carrying the untouched seed baseline (count == seed_count
  // and avg == seed_avg) get rating_count reset to 0 — real reviews only.
  const preState = await db
    .from("products")
    .select("id,rating_count,seed_rating_count,rating_avg,seed_rating_avg");
  check(preState.error, "products select (rating reset)");
  const resetIds = (preState.data ?? [])
    .filter(
      (r) =>
        Number(r.rating_count) > 0 &&
        Number(r.rating_count) === Number(r.seed_rating_count) &&
        Number(r.rating_avg) === Number(r.seed_rating_avg),
    )
    .map((r) => r.id as string);
  if (resetIds.length > 0)
    check(
      (await db.from("products").update({ rating_count: 0 }).in("id", resetIds)).error,
      "rating_count baseline reset",
    );
  console.log(`rating_count reset to 0: ${resetIds.length}`);

  const prod = await db.from("products").select("id,slug");
  check(prod.error, "products select (for images)");
  const prodRows = prod.data ?? [];
  const prodId = new Map(prodRows.map((r) => [r.slug as string, r.id as string]));
  const ids = prodRows.map((r) => r.id as string);
  for (let i = 0; i < ids.length; i += 50) {
    check(
      (await db.from("product_images").delete().in("product_id", ids.slice(i, i + 50))).error,
      "product_images delete chunk",
    );
  }
  const imageRows = data.products.flatMap((p) => {
    const pid = prodId.get(p.slug);
    if (!pid) fail(`product ${p.slug} missing for image insert`);
    return p.images.map((u, position) => ({ product_id: pid, url: u, position }));
  });
  check((await db.from("product_images").insert(imageRows)).error, "product_images insert");

  // Upsert never removes rows: delete anything not in the current seed.
  // Safe pre-orders (ADR-021); FK order = products -> categories -> nav_groups.
  const dbProd = await db.from("products").select("slug");
  check(dbProd.error, "products select (delete phase)");
  const seedSlugs = new Set(data.products.map((p) => p.slug));
  const extraProd = (dbProd.data ?? [])
    .map((r) => r.slug as string)
    .filter((s) => !seedSlugs.has(s));
  if (extraProd.length > 0)
    check(
      (await db.from("products").delete().in("slug", extraProd)).error,
      "products delete (excluded)",
    );

  const dbCat = await db.from("categories").select("slug");
  check(dbCat.error, "categories select (delete phase)");
  const seedCat = new Set(data.categories.map((c) => c.slug));
  const extraCat = (dbCat.data ?? [])
    .map((r) => r.slug as string)
    .filter((s) => !seedCat.has(s));
  if (extraCat.length > 0)
    check(
      (await db.from("categories").delete().in("slug", extraCat)).error,
      "categories delete (excluded)",
    );

  const dbNav = await db.from("nav_groups").select("slug");
  check(dbNav.error, "nav_groups select (delete phase)");
  const seedNav = new Set(data.navGroups.map((g) => g.slug));
  const extraNav = (dbNav.data ?? [])
    .map((r) => r.slug as string)
    .filter((s) => !seedNav.has(s));
  if (extraNav.length > 0)
    check(
      (await db.from("nav_groups").delete().in("slug", extraNav)).error,
      "nav_groups delete (excluded)",
    );
  console.log(
    `deleted products=${extraProd.length} categories=${extraCat.length} nav_groups=${extraNav.length}`,
  );

  console.log(
    `categories=${data.categories.length} products=${data.products.length} images=${imageRows.length}`,
  );
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
