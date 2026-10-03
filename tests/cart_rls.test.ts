import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function env(name: string): string {
  const raw = readFileSync(".env.local", "utf8");
  const line = raw.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  const value = line?.slice(name.length + 1).trim();
  if (!value) throw new Error(`missing env ${name} in .env.local (never skipped)`);
  return value;
}

const url = env("NEXT_PUBLIC_SUPABASE_URL");
const anon = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const service = env("SUPABASE_SERVICE_ROLE_KEY");

const suffix = Math.random().toString(36).slice(2, 8);
const emailA = `cart-test-a-${suffix}@example.com`;
const emailB = `cart-test-b-${suffix}@example.com`;
const pass = "Cart-Test-Passw0rd!1";

const admin = createClient(url, service, { auth: { persistSession: false } });
let clientA: SupabaseClient;
let clientB: SupabaseClient;
let idA = "";
let idB = "";
let productId = "";
let rowA = "";
let rowB = "";
let mergeA = "";
let mergeB = "";

type Resp = { user?: { id: string } | null; error?: { message?: string | null } | null; data?: { user?: { id: string } | null } | null };
function userOf(r: Resp): { id: string } | null {
  return r.user ?? r.data?.user ?? null;
}
function errOf(r: { error?: { message?: string | null } | null }): string | null {
  return r.error?.message ?? null;
}

describe("cart_items + cart_merges RLS (live)", () => {
  beforeAll(async () => {
    const ua = await admin.auth.admin.createUser({ email: emailA, password: pass, email_confirm: true });
    const ub = await admin.auth.admin.createUser({ email: emailB, password: pass, email_confirm: true });
    const ea = errOf(ua);
    const eb = errOf(ub);
    if (ea) throw new Error(ea);
    if (eb) throw new Error(eb);
    const uA = userOf(ua);
    const uB = userOf(ub);
    if (!uA || !uB) throw new Error("createUser returned no user");
    idA = uA.id;
    idB = uB.id;

    const prod = await admin
      .from("products")
      .select("id")
      .order("slug")
      .limit(1)
      .maybeSingle();
    if (!prod.data) throw new Error("test database has no products — run `npm run seed` first");
    productId = prod.data.id;

    clientA = createClient(url, anon, { auth: { persistSession: false } });
    clientB = createClient(url, anon, { auth: { persistSession: false } });
    const sa = await clientA.auth.signInWithPassword({ email: emailA, password: pass });
    const sb = await clientB.auth.signInWithPassword({ email: emailB, password: pass });
    if (sa.error) throw new Error(`signIn A: ${sa.error.message}`);
    if (sb.error) throw new Error(`signIn B: ${sb.error.message}`);
  });

  afterAll(async () => {
    if (idA) await admin.auth.admin.deleteUser(idA);
    if (idB) await admin.auth.admin.deleteUser(idB);
  });

  it("user A inserts own cart row, user B inserts own cart row", async () => {
    const a = await clientA
      .from("cart_items")
      .insert({ user_id: idA, product_id: productId, qty: 2 })
      .select("id, qty");
    expect(errOf(a)).toBeNull();
    expect(a.data).toHaveLength(1);
    rowA = a.data![0].id;
    expect(a.data![0].qty).toBe(2);

    const b = await clientB
      .from("cart_items")
      .insert({ user_id: idB, product_id: productId, qty: 3 })
      .select("id, qty");
    expect(errOf(b)).toBeNull();
    expect(b.data).toHaveLength(1);
    rowB = b.data![0].id;
  });

  it("user A reads only own rows, never B's", async () => {
    const all = await clientA.from("cart_items").select("user_id");
    expect(errOf(all)).toBeNull();
    expect(all.data).toEqual([{ user_id: idA }]);

    const other = await clientA.from("cart_items").select("id").eq("user_id", idB);
    expect(other.data).toEqual([]);
  });

  it("user A cannot update B's row (0 rows affected)", async () => {
    const hacked = await clientA.from("cart_items").update({ qty: 9 }).eq("id", rowB).select();
    expect(hacked.data).toEqual([]);
    const { data } = await admin.from("cart_items").select("qty").eq("id", rowB);
    expect(data).toEqual([{ qty: 3 }]);
  });

  it("user A cannot delete B's row (0 rows affected)", async () => {
    const hacked = await clientA.from("cart_items").delete().eq("id", rowB).select();
    expect(hacked.data).toEqual([]);
    const { data } = await admin.from("cart_items").select("id").eq("id", rowB);
    expect(data).toHaveLength(1);
  });

  it("DB check rejects qty 0 and qty 31", async () => {
    const zero = await clientA
      .from("cart_items")
      .insert({ user_id: idA, product_id: productId, qty: 0 });
    expect(errOf(zero)).toMatch(/check/i);

    const over = await clientA
      .from("cart_items")
      .insert({ user_id: idA, product_id: productId, qty: 31 });
    expect(errOf(over)).toMatch(/check/i);
  });

  it("UNIQUE(user_id, product_id) rejects a duplicate line", async () => {
    const dup = await clientA
      .from("cart_items")
      .insert({ user_id: idA, product_id: productId, qty: 1 });
    expect(errOf(dup)).toMatch(/duplicate|uniq/i);
  });

  it("cart_merges: own-row insert/select only; markers unique per (user, merge)", async () => {
    const ma = await clientA
      .from("cart_merges")
      .insert({ user_id: idA, merge_id: `merge-${suffix}-a` })
      .select("merge_id");
    expect(errOf(ma)).toBeNull();
    expect(ma.data).toHaveLength(1);
    mergeA = `merge-${suffix}-a`;

    const mb = await clientB
      .from("cart_merges")
      .insert({ user_id: idB, merge_id: `merge-${suffix}-b` })
      .select("merge_id");
    expect(errOf(mb)).toBeNull();
    mergeB = `merge-${suffix}-b`;

    const seen = await clientA.from("cart_merges").select("user_id");
    expect(seen.data).toEqual([{ user_id: idA }]);

    const dup = await clientA
      .from("cart_merges")
      .insert({ user_id: idA, merge_id: mergeA });
    expect(errOf(dup)).toMatch(/duplicate|uniq/i);

    const hackedDelete = await clientA
      .from("cart_merges")
      .delete()
      .eq("merge_id", mergeB);
    expect(hackedDelete.data ?? []).toEqual([]);
    const still = await admin.from("cart_merges").select("merge_id").eq("merge_id", mergeB);
    expect(still.data).toHaveLength(1);
  });

  it("cleanup: deleting users cascades cart rows and merge markers to zero", async () => {
    await admin.auth.admin.deleteUser(idA);
    await admin.auth.admin.deleteUser(idB);
    const rows = await admin
      .from("cart_items")
      .select("id", { count: "exact", head: true })
      .in("user_id", [idA, idB]);
    expect(rows.count).toBe(0);
    const merges = await admin
      .from("cart_merges")
      .select("merge_id", { count: "exact", head: true })
      .in("user_id", [idA, idB]);
    expect(merges.count).toBe(0);
    idA = "";
    idB = "";
    rowA = "";
    rowB = "";
    mergeA = "";
    mergeB = "";
  });
});
