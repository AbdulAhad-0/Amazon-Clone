import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("STOP: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const svc = createClient(url, serviceKey, { auth: { persistSession: false } });

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function check(error: { message: string } | null, what: string): void {
  if (error) fail(`${what}: ${error.message}`);
}

async function main() {
  const counts: Record<string, number> = {};
  for (const t of ["nav_groups", "categories", "products", "product_images"]) {
    const { count, error } = await svc.from(t).select("id", { count: "exact" }).limit(1);
    check(error, `count ${t}`);
    counts[t] = count ?? 0;
  }

  const min = await svc.from("products").select("id").order("id", { ascending: true }).limit(1);
  check(min.error, "min id");
  const max = await svc.from("products").select("id").order("id", { ascending: false }).limit(1);
  check(max.error, "max id");

  const baseline = await svc
    .from("products")
    .select("id", { count: "exact" })
    .gt("seed_rating_count", 0)
    .limit(1);
  check(baseline.error, "baseline count");

  const withImages = await svc
    .from("products")
    .select("id, product_images!inner(product_id)", { count: "exact" })
    .limit(1);
  check(withImages.error, "products with images count");

  const nav = await svc.from("nav_groups").select("slug").order("sort_order", { ascending: true });
  check(nav.error, "nav slugs");

  const fn = await svc.rpc("effective_price_cents", { p_price: 1000, p_discount: 50 });
  check(fn.error, "effective_price_cents rpc");

  console.log(
    `counts nav_groups=${counts.nav_groups} categories=${counts.categories} products=${counts.products} images=${counts.product_images}`,
  );
  console.log(
    `ids min=${(min.data?.[0]?.id as string) ?? "(none)"} max=${(max.data?.[0]?.id as string) ?? "(none)"}`,
  );
  console.log(
    `baseline seed_rating_gt0=${baseline.count ?? -1} with_images=${withImages.count ?? -1}`,
  );
  console.log(`nav ${(nav.data ?? []).map((r) => r.slug).join(" ")}`);
  console.log(`price_fn ${fn.data}`);

  if (counts.products !== 184) fail(`products=${counts.products}, expected 184 (ADR-021)`);
  if (counts.categories !== 22) fail(`categories=${counts.categories}, expected 22 (ADR-021)`);
  if (counts.nav_groups !== 7) fail(`nav_groups=${counts.nav_groups}, expected 7 (ADR-021)`);
  if (counts.product_images < counts.products)
    fail(`images=${counts.product_images}, expected >= products (${counts.products})`);
  if ((baseline.count ?? 0) < 1) fail("no product with seed_rating_count > 0");
  if ((withImages.count ?? -1) !== counts.products) fail("not every product has >=1 image");
  if (fn.data !== 500) fail(`effective_price_cents=${fn.data}, expected 500`);
  console.log("verify-seed: OK");
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
