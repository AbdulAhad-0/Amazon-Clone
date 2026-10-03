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
              rating_count: p.seedRatingCount,
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

  console.log(
    `categories=${data.categories.length} products=${data.products.length} images=${imageRows.length}`,
  );
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
