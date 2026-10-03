import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("STOP: missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const db = createClient(url, anonKey, { auth: { persistSession: false } });

async function main() {
  const { data, error } = await db
    .from("products")
    .select("title, price_cents")
    .limit(3);
  if (error) {
    console.error(`STOP: anon select failed: ${error.message}`);
    process.exit(1);
  }
  if (!data || data.length !== 3) {
    console.error(`STOP: expected 3 rows, got ${data ? data.length : "null"}`);
    process.exit(1);
  }
  for (const row of data) console.log(`${row.title} | ${row.price_cents}`);
  console.log("verify-public-read: OK (anon, NEXT_PUBLIC vars only)");
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
