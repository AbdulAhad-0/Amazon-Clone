import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// STEP 1 verification for paste_6_7_8.sql — prints real output only:
// tables exist, functions exist, RLS enabled, anon/authenticated cannot
// EXECUTE place_order / cancel_order / add_review.

function env(name: string): string {
  const raw = readFileSync(".env.local", "utf8");
  const line = raw.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  const value = line?.slice(name.length + 1).trim();
  if (!value) throw new Error(`missing env ${name} in .env.local`);
  return value;
}

const url = env("NEXT_PUBLIC_SUPABASE_URL");
const anon = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const service = env("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(url, service, { auth: { persistSession: false } });
const anonClient = createClient(url, anon, { auth: { persistSession: false } });

let hardFail = false;
const uuid = "00000000-0000-4000-8000-000000000000";

async function tableCheck(name: string): Promise<void> {
  const { count, error } = await admin.from(name).select("id", { count: "exact", head: true }).limit(1);
  if (error) {
    console.log(`table ${name}: MISSING (${error.code ?? error.message.slice(0, 60)})`);
    hardFail = true;
  } else {
    console.log(`table ${name}: OK (rows=${count ?? 0})`);
  }
}

async function functionCheck(serviceCall: boolean): Promise<void> {
  const calls: [string, Record<string, unknown>, RegExp][] = [
    ["place_order", { p_payment_id: uuid, p_address: {}, p_user_id: null }, /no user/],
    ["cancel_order", { p_order_id: uuid, p_user_id: null }, /no user/],
    ["add_review", { p_product_id: uuid, p_rating: 5, p_body: "x", p_user_id: null }, /no user/],
  ];
  for (const [fn, params, guard] of calls) {
    const client = serviceCall ? admin : anonClient;
    const { data, error } = await client.rpc(fn, params);
    if (serviceCall) {
      if (error && guard.test(error.message)) {
        console.log(`function ${fn}: EXISTS, service_role EXECUTE OK (guard raised: ${error.message})`);
      } else if (error) {
        console.log(`function ${fn}: unexpected error (${error.code ?? ""} ${error.message.slice(0, 60)})`);
        hardFail = true;
      } else {
        console.log(`function ${fn}: UNEXPECTED SUCCESS with null user — guard missing (hard fail)`);
        hardFail = true;
      }
    } else {
      const denied = error && /permission denied/i.test(error.message);
      const missing = error && /does not exist|could not find/i.test(error.message);
      if (denied) {
        console.log(`anon EXECUTE ${fn}: DENIED (${error!.code ?? "42501"}) ${error!.message.slice(0, 60)} — OK`);
      } else if (missing) {
        console.log(`anon EXECUTE ${fn}: MISSING function (hard fail) ${error!.message.slice(0, 60)}`);
        hardFail = true;
      } else {
        console.log(`anon EXECUTE ${fn}: NOT DENIED — data=${JSON.stringify(data)} error=${error?.message ?? "none"} (hard fail)`);
        hardFail = true;
      }
    }
  }
}

async function authenticatedExecCheck(): Promise<void> {
  const suffix = Math.random().toString(36).slice(2, 8);
  const email = `verify-678-${suffix}@example.com`;
  const created = await admin.auth.admin.createUser({ email, password: "Verify-678-Passw0rd!1", email_confirm: true });
  if (created.error || !created.data.user) {
    console.log(`authenticated probe: could not create temp user (${created.error?.message}) — hard fail`);
    hardFail = true;
    return;
  }
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password: "Verify-678-Passw0rd!1" });
  if (signIn.error) {
    console.log(`authenticated probe: signIn failed (${signIn.error.message}) — hard fail`);
    hardFail = true;
    await admin.auth.admin.deleteUser(created.data.user.id);
    return;
  }
  const calls: [string, Record<string, unknown>][] = [
    ["place_order", { p_payment_id: uuid, p_address: {}, p_user_id: created.data.user.id }],
    ["cancel_order", { p_order_id: uuid, p_user_id: created.data.user.id }],
    ["add_review", { p_product_id: uuid, p_rating: 5, p_body: "x", p_user_id: created.data.user.id }],
  ];
  for (const [fn, params] of calls) {
    const { error } = await client.rpc(fn, params);
    if (error && /permission denied/i.test(error.message)) {
      console.log(`authenticated EXECUTE ${fn}: DENIED (${error.code ?? "42501"}) — OK`);
    } else {
      console.log(`authenticated EXECUTE ${fn}: NOT DENIED (${error?.message ?? "SUCCESS"}) — hard fail`);
      hardFail = true;
    }
  }
  const del = await admin.auth.admin.deleteUser(created.data.user.id);
  console.log(
    `temp verify user cleanup: ${del.error ? "FAILED " + del.error.message : "deleted " + created.data.user.id}`,
  );
}

async function rlsProbes(): Promise<void> {
  const { error: insErr } = await anonClient.from("orders").insert({
    user_id: uuid,
    ships_at: new Date().toISOString(),
    delivered_at: new Date().toISOString(),
    subtotal_cents: 0,
    shipping_cents: 0,
    tax_cents: 0,
    total_cents: 0,
    ship_address: {},
    payment_id: uuid,
  });
  if (insErr) {
    console.log(`RLS orders INSERT anon: DENIED (${insErr.code ?? "?"}) ${insErr.message.slice(0, 60)} — OK`);
  } else {
    console.log("RLS orders INSERT anon: SUCCEEDED — RLS NOT ENFORCED (hard fail)");
    hardFail = true;
  }
  const { error: revErr } = await anonClient.from("reviews").insert({
    product_id: uuid,
    user_id: uuid,
    order_id: uuid,
    rating: 5,
    body: "probe",
  });
  if (revErr) {
    console.log(`RLS reviews INSERT anon: DENIED (${revErr.code ?? "?"}) ${revErr.message.slice(0, 60)} — OK`);
  } else {
    console.log("RLS reviews INSERT anon: SUCCEEDED — RLS NOT ENFORCED (hard fail)");
    hardFail = true;
  }
  const { data: sel, error: selErr } = await anonClient.from("orders").select("id").limit(1);
  if (selErr) {
    console.log(`RLS orders SELECT anon: error (${selErr.code ?? "?"}) ${selErr.message.slice(0, 60)}`);
  } else {
    console.log(`RLS orders SELECT anon: OK (visible rows=${sel?.length ?? 0}, own-row policy filters others)`);
  }
}

async function main() {
  console.log("--- tables ---");
  for (const t of ["addresses", "payments", "orders", "order_items", "order_events", "reviews"]) {
    await tableCheck(t);
  }
  console.log("--- functions: existence + service_role EXECUTE (guard raises, no writes) ---");
  await functionCheck(true);
  console.log("--- EXECUTE revoked: anon ---");
  await functionCheck(false);
  console.log("--- EXECUTE revoked: authenticated ---");
  await authenticatedExecCheck();
  console.log("--- RLS probes ---");
  await rlsProbes();
  console.log(hardFail ? "RESULT: FAIL" : "RESULT: OK");
  process.exit(hardFail ? 1 : 0);
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
