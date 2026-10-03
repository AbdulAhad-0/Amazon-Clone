import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { navGroups, categoryToNavGroup } from "../data/nav-groups";

const EXPECTED_PRODUCTS = 194;
const EXPECTED_CATEGORIES = 24;

function stop(msg: string): never {
  console.error(`STOP: ${msg}`);
  process.exit(1);
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface SeedProductJson {
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
}

async function main() {
  const catRes = await fetch("https://dummyjson.com/products/categories");
  if (!catRes.ok) stop(`categories endpoint HTTP ${catRes.status}`);
  const sourceCats: { slug: string; name: string }[] = await catRes.json();

  if (sourceCats.length !== EXPECTED_CATEGORIES)
    stop(`categories=${sourceCats.length}, expected ${EXPECTED_CATEGORIES} — seed-products.json NOT written`);

  const unmapped = sourceCats
    .map((c) => c.slug)
    .filter((s) => !(s in categoryToNavGroup));
  if (unmapped.length)
    stop(`source categories missing from mapping: ${unmapped.join(", ")}`);

  const stale = Object.keys(categoryToNavGroup).filter(
    (s) => !sourceCats.some((c) => c.slug === s),
  );
  if (stale.length)
    stop(`mapping lists categories absent from source: ${stale.join(", ")}`);

  const prodRes = await fetch("https://dummyjson.com/products?limit=200");
  if (!prodRes.ok) stop(`products endpoint HTTP ${prodRes.status}`);
  const payload = await prodRes.json();

  if (payload.total !== EXPECTED_PRODUCTS)
    stop(`products total=${payload.total}, expected ${EXPECTED_PRODUCTS} — seed-products.json NOT written`);
  if (payload.products.length !== payload.total)
    stop(`fetched ${payload.products.length} of total ${payload.total} (limit too low)`);

  const seen = new Set<string>();
  const products: SeedProductJson[] = payload.products.map((p: Record<string, unknown>) => {
    let slug = slugify(String(p.title));
    if (seen.has(slug)) slug = `${slug}-${p.id}`;
    seen.add(slug);

    const images = (p.images as string[] | undefined) ?? [];
    if (images.length === 0) stop(`product ${p.id} (${p.title}) has zero images`);
    for (const url of images)
      if (!url.startsWith("https://cdn.dummyjson.com/"))
        stop(`product ${p.id} image not on cdn.dummyjson.com: ${url}`);

    const reviews = Array.isArray(p.reviews) ? p.reviews.length : 0;

    return {
      slug,
      title: String(p.title),
      description: String(p.description ?? ""),
      brand: (p.brand as string | undefined) ?? null,
      categorySlug: String(p.category),
      priceCents: Math.round(Number(p.price) * 100),
      discountPct: Math.min(100, Math.max(0, Math.round(Number(p.discountPercentage ?? 0)))),
      seedRatingAvg: Math.round(Number(p.rating ?? 0) * 100) / 100,
      seedRatingCount: reviews,
      stock: (p.stock as number | undefined) ?? 50,
      images,
    };
  });

  if (!products.every((p) => Number.isInteger(p.priceCents)))
    stop("non-integer priceCents produced");
  if (!products.every((p) => p.priceCents > 0))
    stop("priceCents <= 0 produced (products.price_cents check would reject)");

  const categories = sourceCats.map((c, i) => ({
    slug: c.slug,
    name: c.name,
    navGroupSlug: categoryToNavGroup[c.slug],
    sortOrder: i,
  }));

  const out = {
    fetchedAt: new Date().toISOString(),
    navGroups,
    categories,
    products,
  };
  const outFile = join(process.cwd(), "data", "seed-products.json");
  writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`written: ${outFile}`);
  console.log(
    `products=${products.length} categories=${categories.length} navGroups=${navGroups.length} uniqueSlugs=${seen.size}`,
  );
}

main().catch((e) => stop(e instanceof Error ? e.message : String(e)));
