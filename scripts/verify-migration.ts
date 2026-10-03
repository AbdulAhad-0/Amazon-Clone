import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
  console.error(
    "STOP: missing env among NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const service = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

const wantRls = process.argv.includes("--rls");
let hardFail = false;

async function tableCheck(name: string) {
  const { count, error } = await service
    .from(name)
    .select("id", { count: "exact" })
    .limit(1);
  if (error) {
    console.log(`table ${name}: MISSING (${error.code ?? error.message.slice(0, 50)})`);
  } else {
    console.log(`table ${name}: OK count=${count ?? 0}`);
  }
}

async function functionCheck() {
  const { data, error } = await service.rpc("effective_price_cents", {
    p_price: 1000,
    p_discount: 50,
  });
  if (error) {
    console.log(`function effective_price_cents: MISSING (${error.code ?? error.message.slice(0, 50)})`);
    return;
  }
  const ok = data === 500;
  console.log(`function effective_price_cents(1000,50): ${data} ${ok ? "OK" : "WRONG (expected 500)"}`);
  if (!ok) hardFail = true;
}

async function rlsProbes() {
  const { error: readErr } = await anon.from("products").select("title, price_cents").limit(1);
  if (readErr) {
    console.log(`anon read products: FAIL (${readErr.code ?? readErr.message.slice(0, 50)})`);
    hardFail = true;
  } else {
    console.log("anon read products: OK");
  }

  const { error: writeErr } = await anon
    .from("nav_groups")
    .insert({ slug: "__rls_probe__", name: "probe" });
  if (writeErr) {
    console.log(
      `anon write nav_groups: DENIED (${writeErr.code ?? "no code"}) RLS working as designed`,
    );
  } else {
    console.log("anon write nav_groups: SUCCEEDED — RLS NOT ENFORCED (hard fail)");
    const { error: cleanupErr } = await service
      .from("nav_groups")
      .delete()
      .eq("slug", "__rls_probe__");
    if (cleanupErr) console.log(`cleanup of probe row failed: ${cleanupErr.message.slice(0, 60)}`);
    hardFail = true;
  }
}

async function main() {
  await tableCheck("nav_groups");
  await tableCheck("categories");
  await tableCheck("products");
  await tableCheck("product_images");
  await functionCheck();
  if (wantRls) await rlsProbes();
  console.log(hardFail ? "RESULT: FAIL" : "RESULT: OK");
  process.exit(hardFail ? 1 : 0);
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
