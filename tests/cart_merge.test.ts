import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { addLine, getCartLines, mergeGuest, setLineQty, MAX_CART_QTY, type CartResult } from "../lib/cart";

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
const email = `cart-merge-${suffix}@example.com`;
const pass = "Cart-Merge-Passw0rd!1";

const admin = createClient(url, service, { auth: { persistSession: false } });
let client: SupabaseClient;
let userId = "";
let productId = "";
let originalStock = 0;

type Resp = { user?: { id: string } | null; error?: { message?: string | null } | null; data?: { user?: { id: string } | null } | null };
function userOf(r: Resp): { id: string } | null {
  return r.user ?? r.data?.user ?? null;
}
function errOf(r: { error?: { message?: string | null } | null }): string | null {
  return r.error?.message ?? null;
}

function expectOk(res: CartResult): Extract<CartResult, { ok: true }> {
  if (!res.ok) throw new Error(`expected ok, got ${res.error}`);
  return res;
}

async function lineQty(): Promise<number> {
  const lines = await getCartLines(client);
  if (lines.length === 0) return 0;
  expect(lines).toHaveLength(1);
  return lines[0].qty;
}

describe("cart core against live DB (merge, stock, clamp)", () => {
  beforeAll(async () => {
    const created = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true });
    const e = errOf(created);
    if (e) throw new Error(e);
    const u = userOf(created);
    if (!u) throw new Error("createUser returned no user");
    userId = u.id;

    const prod = await admin
      .from("products")
      .select("id, stock")
      .gte("stock", 30)
      .order("slug")
      .limit(1)
      .maybeSingle();
    if (!prod.data) throw new Error("test database has no product with stock ≥ 30 — run `npm run seed` first");
    productId = prod.data.id;
    originalStock = prod.data.stock;

    client = createClient(url, anon, { auth: { persistSession: false } });
    const signIn = await client.auth.signInWithPassword({ email, password: pass });
    if (signIn.error) throw new Error(`signIn: ${signIn.error.message}`);
  });

  afterAll(async () => {
    if (originalStock > 0 && productId) {
      await admin.from("products").update({ stock: originalStock }).eq("id", productId);
    }
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it("merge double-run with the same merge id applies quantities exactly once", async () => {
    const mergeId = crypto.randomUUID();
    const guest = [{ productId, qty: 2 }];

    const first = expectOk(await mergeGuest(client, userId, guest, mergeId));
    expect(first.alreadyMerged).toBeUndefined();
    expect(await lineQty()).toBe(2);

    const second = expectOk(await mergeGuest(client, userId, guest, mergeId));
    expect(second.alreadyMerged).toBe(true);
    expect(await lineQty()).toBe(2);
    expect(second.lines).toHaveLength(1);
    expect(second.lines[0].qty).toBe(2);
  });

  it("a new merge id adds on top, capped at MAX_CART_QTY", async () => {
    const mergeId = crypto.randomUUID();
    const res = expectOk(await mergeGuest(client, userId, [{ productId, qty: 40 }], mergeId));
    expect(res.alreadyMerged).toBeUndefined();
    expect(await lineQty()).toBe(MAX_CART_QTY);
  });

  it("addLine rejects qty > stock with STOCK + available (server-side check)", async () => {
    await admin.from("products").update({ stock: 3 }).eq("id", productId);
    await admin.from("cart_items").delete().eq("user_id", userId);

    const reject = await addLine(client, userId, productId, 5);
    expect(reject.ok).toBe(false);
    if (!reject.ok) {
      expect(reject.error).toBe("STOCK");
      expect(reject.available).toBe(3);
    }
    const lines = await getCartLines(client);
    expect(lines).toHaveLength(0);
  });

  it("addLine adds within stock, then soft-caps at stock", async () => {
    expectOk(await addLine(client, userId, productId, 2));
    expect(await lineQty()).toBe(2);

    // 2 + 2 would be 4, but stock is 3 → capped, never above stock
    expectOk(await addLine(client, userId, productId, 2));
    expect(await lineQty()).toBe(3);

    // one more unit is allowed by the qty check (1 ≤ stock) but stays at stock
    expectOk(await addLine(client, userId, productId, 1));
    expect(await lineQty()).toBe(3);
  });

  it("merge caps guest qty at the low stock", async () => {
    await admin.from("cart_items").delete().eq("user_id", userId);
    const mergeId = crypto.randomUUID();
    expectOk(await mergeGuest(client, userId, [{ productId, qty: 30 }], mergeId));
    expect(await lineQty()).toBe(3);
  });

  it("setLineQty 0 removes the line; totals come back empty", async () => {
    const res = expectOk(await setLineQty(client, userId, productId, 0));
    expect(res.lines).toHaveLength(0);
    expect(res.totals.totalCents).toBe(0);
    expect(await lineQty()).toBe(0);
  });

  it("setLineQty above stock is rejected with STOCK", async () => {
    const res = await setLineQty(client, userId, productId, 4);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("STOCK");
      expect(res.available).toBe(3);
    }
    const lines = await getCartLines(client);
    expect(lines).toHaveLength(0);
  });

  it("cleanup: remove test cart rows and restore stock", async () => {
    await admin.from("cart_items").delete().eq("user_id", userId);
    await admin.from("cart_merges").delete().eq("user_id", userId);
    await admin.from("products").update({ stock: originalStock }).eq("id", productId);
    const rows = await admin
      .from("cart_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    expect(rows.count).toBe(0);
  });
});
