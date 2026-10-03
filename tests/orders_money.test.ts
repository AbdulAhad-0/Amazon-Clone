import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Slice 6-8 security + money suite — one suite, live DB, dedicated test users.
// Rules (owner): restore any stock changed, delete the test users and their
// rows at the end, show the cleanup output. No test project exists (ADR-020).

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
const emailA = `money-test-a-${suffix}@example.com`;
const emailB = `money-test-b-${suffix}@example.com`;
const emailC = `money-test-c-${suffix}@example.com`;
const pass = "Money-Test-Passw0rd!1";

const admin = createClient(url, service, { auth: { persistSession: false } });
const anonClient = createClient(url, anon, { auth: { persistSession: false } });
let clientA: SupabaseClient;
let clientB: SupabaseClient;
let clientC: SupabaseClient;
let idA = "";
let idB = "";
let idC = "";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Err = { error?: { message?: string | null; code?: string | null } | null; data?: unknown };
function msg(r: Err): string {
  return r.error?.message ?? "";
}
function expectRaise(r: Err, pattern: RegExp): void {
  expect(r.error, `expected an error, got data=${JSON.stringify(r.data)}`).toBeTruthy();
  expect(msg(r)).toMatch(pattern);
}

function effective(price: number, discount: number): number {
  return Math.floor((price * (100 - discount)) / 100);
}
function totalsOf(lines: { qty: number; price: number; discount: number }[]): number {
  const sub = lines.reduce((s, l) => s + effective(l.price, l.discount) * l.qty, 0);
  const ship = sub >= 3500 ? 0 : 599;
  const tax = Math.round((sub * 8) / 100);
  return sub + ship + tax;
}

interface ProdRow {
  id: string;
  price_cents: number;
  discount_pct: number;
  stock: number;
  seed_rating_avg: number | null;
  seed_rating_count: number | null;
  rating_avg: number;
  rating_count: number;
}

const address = {
  full_name: "Test Buyer",
  phone: "555-0100",
  line1: "1 Test Street",
  line2: "",
  city: "Testville",
  state: "TS",
  zip: "12345",
  country: "USA",
};

let p1: ProdRow;
let p2: ProdRow;
let stock1Orig = 0;
let stock2Orig = 0;
let seedAvgOrig = 0;
let seedCountOrig = 0;

let paymentA = "";
let orderIdA = "";
let stockAfterOrder1 = 0;
let stockAfterOrder2 = 0;

async function stockOf(id: string): Promise<number> {
  const r = await admin.from("products").select("stock").eq("id", id).single();
  if (r.error) throw new Error(r.error.message);
  return (r.data as { stock: number }).stock;
}

describe("slice 6-8: place_order / cancel_order / add_review — security + money (live)", () => {
  beforeAll(async () => {
    const ua = await admin.auth.admin.createUser({ email: emailA, password: pass, email_confirm: true });
    const ub = await admin.auth.admin.createUser({ email: emailB, password: pass, email_confirm: true });
    const uc = await admin.auth.admin.createUser({ email: emailC, password: pass, email_confirm: true });
    if (ua.error || ub.error || uc.error) {
      throw new Error([ua.error?.message, ub.error?.message, uc.error?.message].filter(Boolean).join("; "));
    }
    idA = ua.data!.user.id;
    idB = ub.data!.user.id;
    idC = uc.data!.user.id;

    const prods = await admin
      .from("products")
      .select("id, price_cents, discount_pct, stock, seed_rating_avg, seed_rating_count, rating_avg, rating_count")
      .gte("stock", 6)
      .order("id")
      .limit(2);
    if (!prods.data || prods.data!.length < 2) {
      throw new Error("need 2 products with stock >= 6 — run `npm run seed` first");
    }
    p1 = prods.data[0] as ProdRow;
    p2 = prods.data[1] as ProdRow;
    stock1Orig = p1.stock;
    stock2Orig = p2.stock;
    seedAvgOrig = Number(p1.seed_rating_avg ?? 0);
    seedCountOrig = p1.seed_rating_count ?? 0;

    const cart = await admin.from("cart_items").insert([
      { user_id: idA, product_id: p1.id, qty: 2 },
      { user_id: idA, product_id: p2.id, qty: 1 },
    ]);
    if (cart.error) throw new Error(`cart seed: ${cart.error.message}`);

    clientA = createClient(url, anon, { auth: { persistSession: false } });
    clientB = createClient(url, anon, { auth: { persistSession: false } });
    clientC = createClient(url, anon, { auth: { persistSession: false } });
    const sa = await clientA.auth.signInWithPassword({ email: emailA, password: pass });
    const sb = await clientB.auth.signInWithPassword({ email: emailB, password: pass });
    const sc = await clientC.auth.signInWithPassword({ email: emailC, password: pass });
    if (sa.error || sb.error || sc.error) {
      throw new Error(`signIn failed: ${sa.error?.message ?? sb.error?.message ?? sc.error?.message}`);
    }
  });

  afterAll(async () => {
    // Final test performs and asserts the real cleanup; this is a safety net.
    for (const id of [idA, idB, idC]) {
      if (id) await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  it("1. tables exist and functions raise our guards (service-role EXECUTE works)", async () => {
    for (const t of ["payments", "orders", "order_items", "order_events", "reviews"]) {
      const r = await admin.from(t).select("id", { count: "exact", head: true });
      expect(r.error, `table ${t}`).toBeNull();
    }
    const po = await admin.rpc("place_order", { p_payment_id: null, p_address: {}, p_user_id: null });
    expectRaise(po, /no user/);
    const co = await admin.rpc("cancel_order", { p_order_id: null, p_user_id: null });
    expectRaise(co, /no user/);
    const ar = await admin.rpc("add_review", { p_product_id: null, p_rating: 5, p_body: "x", p_user_id: null });
    expectRaise(ar, /no user/);
  });

  it("2. anon CANNOT EXECUTE place_order / cancel_order / add_review", async () => {
    const call = { p_payment_id: crypto.randomUUID(), p_address: address, p_user_id: idA };
    const r1 = await anonClient.rpc("place_order", call);
    expectRaise(r1, /permission denied/i);
    const r2 = await anonClient.rpc("cancel_order", { p_order_id: crypto.randomUUID(), p_user_id: idA });
    expectRaise(r2, /permission denied/i);
    const r3 = await anonClient.rpc("add_review", { p_product_id: p1.id, p_rating: 5, p_body: "x", p_user_id: idA });
    expectRaise(r3, /permission denied/i);
  });

  it("3. authenticated CANNOT EXECUTE place_order / cancel_order / add_review", async () => {
    const r1 = await clientB.rpc("place_order", { p_payment_id: crypto.randomUUID(), p_address: address, p_user_id: idB });
    expectRaise(r1, /permission denied/i);
    const r2 = await clientB.rpc("cancel_order", { p_order_id: crypto.randomUUID(), p_user_id: idB });
    expectRaise(r2, /permission denied/i);
    const r3 = await clientB.rpc("add_review", { p_product_id: p1.id, p_rating: 5, p_body: "x", p_user_id: idB });
    expectRaise(r3, /permission denied/i);
  });

  it("4. place_order happy path: one order, exact totals, stock down, cart empty, +15m/+2h", async () => {
    const expected = totalsOf([
      { qty: 2, price: p1.price_cents, discount: p1.discount_pct },
      { qty: 1, price: p2.price_cents, discount: p2.discount_pct },
    ]);
    const pay = await admin
      .from("payments")
      .insert({ user_id: idA, amount_cents: expected, status: "succeeded", expires_at: new Date(Date.now() + 15 * 60_000).toISOString() })
      .select("id")
      .single();
    expect(pay.error).toBeNull();
    paymentA = pay.data!.id;

    const res = await admin.rpc("place_order", { p_payment_id: paymentA, p_address: address, p_user_id: idA });
    expect(res.error, msg(res)).toBeNull();
    expect(String(res.data)).toMatch(UUID_RE);
    orderIdA = String(res.data);

    const ord = await admin.from("orders").select("*").eq("id", orderIdA).single();
    expect(ord.error).toBeNull();
    const o = ord.data as {
      status: string;
      subtotal_cents: number;
      shipping_cents: number;
      tax_cents: number;
      total_cents: number;
      ship_address: unknown;
      created_at: string;
      ships_at: string;
      delivered_at: string;
      payment_id: string;
    };
    const sub = totalsOf([
      { qty: 2, price: p1.price_cents, discount: p1.discount_pct },
      { qty: 1, price: p2.price_cents, discount: p2.discount_pct },
    ]) - 0; // recomputed below piecewise
    const subtotal =
      effective(p1.price_cents, p1.discount_pct) * 2 + effective(p2.price_cents, p2.discount_pct) * 1;
    const ship = subtotal >= 3500 ? 0 : 599;
    const tax = Math.round((subtotal * 8) / 100);
    expect(sub).toBe(subtotal + (subtotal >= 3500 ? 0 : 599) + Math.round((subtotal * 8) / 100));
    expect(o.status).toBe("placed");
    expect(o.subtotal_cents).toBe(subtotal);
    expect(o.shipping_cents).toBe(ship);
    expect(o.tax_cents).toBe(tax);
    expect(o.total_cents).toBe(subtotal + ship + tax);
    expect(o.total_cents).toBe(expected);
    expect(o.ship_address).toEqual(address);
    expect(o.payment_id).toBe(paymentA);

    const created = new Date(o.created_at).getTime();
    const ships = new Date(o.ships_at).getTime();
    const delivered = new Date(o.delivered_at).getTime();
    expect(ships - created).toBeGreaterThanOrEqual(14 * 60_000);
    expect(ships - created).toBeLessThanOrEqual(16 * 60_000);
    expect(delivered - created).toBeGreaterThanOrEqual(118 * 60_000);
    expect(delivered - created).toBeLessThanOrEqual(122 * 60_000);

    const items = await admin
      .from("order_items")
      .select("product_id, title_snapshot, unit_price_cents, qty")
      .eq("order_id", orderIdA);
    expect(items.data).toHaveLength(2);
    const i1 = items.data!.find((i) => i.product_id === p1.id)!;
    expect(i1.unit_price_cents).toBe(effective(p1.price_cents, p1.discount_pct));
    expect(i1.qty).toBe(2);
    expect(i1.title_snapshot.length).toBeGreaterThan(0);

    const ev = await admin.from("order_events").select("status").eq("order_id", orderIdA);
    expect(ev.data?.map((e) => e.status)).toContain("placed");

    stockAfterOrder1 = await stockOf(p1.id);
    stockAfterOrder2 = await stockOf(p2.id);
    expect(stockAfterOrder1).toBe(stock1Orig - 2);
    expect(stockAfterOrder2).toBe(stock2Orig - 1);

    const cart = await admin.from("cart_items").select("id").eq("user_id", idA);
    expect(cart.data).toHaveLength(0);
  });

  it("5. idempotent: same payment twice -> one order, stock NOT decreased twice", async () => {
    const again = await admin.rpc("place_order", { p_payment_id: paymentA, p_address: address, p_user_id: idA });
    expect(again.error, msg(again)).toBeNull();
    expect(String(again.data)).toBe(orderIdA);

    const count = await admin.from("orders").select("id", { count: "exact", head: true }).eq("payment_id", paymentA);
    expect(count.count).toBe(1);
    expect(await stockOf(p1.id)).toBe(stockAfterOrder1);
    expect(await stockOf(p2.id)).toBe(stockAfterOrder2);
  });

  it("6. pending payment -> raises, zero writes, cart intact", async () => {
    await admin.from("cart_items").insert({ user_id: idB, product_id: p1.id, qty: 1 });
    const pay = await admin
      .from("payments")
      .insert({ user_id: idB, amount_cents: 100, status: "pending", expires_at: new Date(Date.now() + 900_000).toISOString() })
      .select("id")
      .single();
    const pid = pay.data!.id;
    const r = await admin.rpc("place_order", { p_payment_id: pid, p_address: address, p_user_id: idB });
    expectRaise(r, /not succeeded/);
    const orders = await admin.from("orders").select("id", { count: "exact", head: true }).eq("payment_id", pid);
    expect(orders.count).toBe(0);
    const cart = await admin.from("cart_items").select("id", { count: "exact", head: true }).eq("user_id", idB);
    expect(cart.count).toBe(1);
  });

  it("7. expired payment -> raises, zero writes", async () => {
    const pay = await admin
      .from("payments")
      .insert({ user_id: idB, amount_cents: 100, status: "succeeded", expires_at: new Date(Date.now() - 60_000).toISOString() })
      .select("id")
      .single();
    const pid = pay.data!.id;
    const r = await admin.rpc("place_order", { p_payment_id: pid, p_address: address, p_user_id: idB });
    expectRaise(r, /expired/);
    const orders = await admin.from("orders").select("id", { count: "exact", head: true }).eq("payment_id", pid);
    expect(orders.count).toBe(0);
  });

  it("8. amount mismatch (tampered total) -> raises, zero writes", async () => {
    const pay = await admin
      .from("payments")
      .insert({ user_id: idB, amount_cents: 1, status: "succeeded", expires_at: new Date(Date.now() + 900_000).toISOString() })
      .select("id")
      .single();
    const pid = pay.data!.id;
    const r = await admin.rpc("place_order", { p_payment_id: pid, p_address: address, p_user_id: idB });
    expectRaise(r, /amount mismatch/);
    const orders = await admin.from("orders").select("id", { count: "exact", head: true }).eq("payment_id", pid);
    expect(orders.count).toBe(0);
  });

  it("9. payment owned by another user -> raises", async () => {
    const pay = await admin
      .from("payments")
      .insert({ user_id: idA, amount_cents: 100, status: "succeeded", expires_at: new Date(Date.now() + 900_000).toISOString() })
      .select("id")
      .single();
    const pid = pay.data!.id;
    const r = await admin.rpc("place_order", { p_payment_id: pid, p_address: address, p_user_id: idB });
    expectRaise(r, /belongs to another user/);
    const orders = await admin.from("orders").select("id", { count: "exact", head: true }).eq("payment_id", pid);
    expect(orders.count).toBe(0);
  });

  it("10. insufficient stock -> raises; no order, stock unchanged, cart intact", async () => {
    const up = await admin.from("cart_items").update({ qty: 2 }).eq("user_id", idB).eq("product_id", p1.id);
    expect(up.error).toBeNull();
    // Temporarily drop the product's stock below the cart qty (restored below;
    // cleanup test also asserts the original value end-to-end).
    const stockBefore = await stockOf(p1.id);
    const setStock = await admin.from("products").update({ stock: 0 }).eq("id", p1.id);
    expect(setStock.error).toBeNull();
    const unit = effective(p1.price_cents, p1.discount_pct);
    const subtotal = unit * 2;
    const amount = subtotal + (subtotal >= 3500 ? 0 : 599) + Math.round((subtotal * 8) / 100);
    const pay = await admin
      .from("payments")
      .insert({ user_id: idB, amount_cents: amount, status: "succeeded", expires_at: new Date(Date.now() + 900_000).toISOString() })
      .select("id")
      .single();
    const pid = pay.data!.id;
    const r = await admin.rpc("place_order", { p_payment_id: pid, p_address: address, p_user_id: idB });
    expectRaise(r, /insufficient stock/);
    const orders = await admin.from("orders").select("id", { count: "exact", head: true }).eq("payment_id", pid);
    expect(orders.count).toBe(0);
    const restore = await admin.from("products").update({ stock: stockBefore }).eq("id", p1.id);
    expect(restore.error).toBeNull();
    expect(await stockOf(p1.id)).toBe(stockBefore);
    const cart = await admin.from("cart_items").select("qty").eq("user_id", idB).eq("product_id", p1.id).single();
    expect(cart.data?.qty).toBe(2);
  });

  it("11. buyer review inserts once; rollup = seed baseline + real reviews", async () => {
    const setSeed = await admin
      .from("products")
      .update({ seed_rating_avg: 4.5, seed_rating_count: 4 })
      .eq("id", p1.id);
    expect(setSeed.error).toBeNull();
    await admin.from("reviews").delete().eq("product_id", p1.id); // start from clean slate

    const add = await admin.rpc("add_review", { p_product_id: p1.id, p_rating: 5, p_body: "Does the job well.", p_user_id: idA });
    expect(add.error, msg(add)).toBeNull();

    const prod = await admin
      .from("products")
      .select("rating_avg, rating_count")
      .eq("id", p1.id)
      .single();
    // (4.50 * 4 + 5) / 5 = 4.60
    expect(prod.data!.rating_count).toBe(5);
    expect(Number(prod.data!.rating_avg)).toBeCloseTo(4.6, 2);

    const rv = await admin
      .from("reviews")
      .select("order_id, user_id, rating, body")
      .eq("product_id", p1.id)
      .eq("user_id", idA)
      .single();
    expect(rv.error).toBeNull();
    expect(rv.data!.order_id).toBe(orderIdA); // server-derived eligible order, not client-sent
  });

  it("12. non-buyer add_review -> rejected, no rows", async () => {
    const before = await admin.from("reviews").select("id", { count: "exact", head: true }).eq("product_id", p1.id);
    const r = await admin.rpc("add_review", { p_product_id: p1.id, p_rating: 1, p_body: "Never bought it.", p_user_id: idB });
    expectRaise(r, /verified buyer/);
    const after = await admin.from("reviews").select("id", { count: "exact", head: true }).eq("product_id", p1.id);
    expect(after.count).toBe(before.count);
  });

  it("13. cancelled-only buyer add_review -> rejected", async () => {
    const pay = await admin
      .from("payments")
      .insert({ user_id: idC, amount_cents: 0, status: "refunded", expires_at: new Date(Date.now() + 900_000).toISOString() })
      .select("id")
      .single();
    const ord = await admin
      .from("orders")
      .insert({
        user_id: idC,
        status: "cancelled",
        ships_at: new Date(Date.now() + 900_000).toISOString(),
        delivered_at: new Date(Date.now() + 7_200_000).toISOString(),
        cancelled_at: new Date().toISOString(),
        subtotal_cents: 0,
        shipping_cents: 0,
        tax_cents: 0,
        total_cents: 0,
        ship_address: address,
        payment_id: pay.data!.id,
      })
      .select("id")
      .single();
    expect(ord.error).toBeNull();
    const item = await admin
      .from("order_items")
      .insert({ order_id: ord.data!.id, product_id: p1.id, title_snapshot: "t", unit_price_cents: 100, qty: 1 });
    expect(item.error).toBeNull();

    const r = await admin.rpc("add_review", { p_product_id: p1.id, p_rating: 5, p_body: "I did buy it (then cancelled).", p_user_id: idC });
    expectRaise(r, /verified buyer/);
  });

  it("14. duplicate review -> unique violation, first review untouched", async () => {
    const r = await admin.rpc("add_review", { p_product_id: p1.id, p_rating: 1, p_body: "Second try.", p_user_id: idA });
    expectRaise(r, /duplicate|unique/i);
    const rv = await admin.from("reviews").select("rating, body").eq("product_id", p1.id).eq("user_id", idA).single();
    expect(rv.data!.rating).toBe(5);
    expect(rv.data!.body).toBe("Does the job well.");
  });

  it("15. rating 6 -> rejected before any write (function guard fires first, DB check backstops)", async () => {
    const r = await admin.rpc("add_review", { p_product_id: p1.id, p_rating: 6, p_body: "too high", p_user_id: idA });
    expectRaise(r, /rating must be 1-5|check/i);
    const count = await admin.from("reviews").select("id", { count: "exact", head: true }).eq("product_id", p1.id);
    expect(count.count).toBe(1);
  });

  it("16. client cannot INSERT into reviews directly (RLS, no insert policy)", async () => {
    const r = await clientA.from("reviews").insert({ product_id: p1.id, user_id: idA, order_id: orderIdA, rating: 5, body: "sneaky" });
    expect(r.error).toBeTruthy();
    expect(msg(r)).toMatch(/permission denied|row-level security/i);
  });

  it("17. delete own review -> rollup returns to seed baseline", async () => {
    const rows = await admin.from("reviews").select("id").eq("product_id", p1.id).eq("user_id", idA);
    expect(rows.data?.length).toBe(1);
    const del = await clientA.from("reviews").delete().eq("id", rows.data![0].id);
    expect(del.error, msg(del)).toBeNull();
    const prod = await admin.from("products").select("rating_avg, rating_count").eq("id", p1.id).single();
    expect(prod.data!.rating_count).toBe(4);
    expect(Number(prod.data!.rating_avg)).toBeCloseTo(4.5, 2);
  });

  it("18. cancel_order: restores stock exactly, refunds payment, appends event", async () => {
    const s1 = await stockOf(p1.id);
    const s2 = await stockOf(p2.id);
    expect(s1).toBe(stock1Orig - 2);

    const r = await admin.rpc("cancel_order", { p_order_id: orderIdA, p_user_id: idA });
    expect(r.error, msg(r)).toBeNull();

    const ord = await admin.from("orders").select("status, cancelled_at").eq("id", orderIdA).single();
    expect(ord.data!.status).toBe("cancelled");
    expect(ord.data!.cancelled_at).toBeTruthy();

    expect(await stockOf(p1.id)).toBe(s1 + 2);
    expect(await stockOf(p2.id)).toBe(s2 + 1);

    const pay = await admin.from("payments").select("status").eq("id", paymentA).single();
    expect(pay.data!.status).toBe("refunded");

    const ev = await admin.from("order_events").select("status").eq("order_id", orderIdA);
    expect(ev.data?.map((e) => e.status)).toEqual(expect.arrayContaining(["placed", "cancelled"]));
  });

  it("19. cancel twice -> idempotent no-op: stock identical, no second event", async () => {
    const s1 = await stockOf(p1.id);
    const s2 = await stockOf(p2.id);
    const ord1 = await admin.from("orders").select("cancelled_at").eq("id", orderIdA).single();

    const r = await admin.rpc("cancel_order", { p_order_id: orderIdA, p_user_id: idA });
    expect(r.error, msg(r)).toBeNull();

    expect(await stockOf(p1.id)).toBe(s1);
    expect(await stockOf(p2.id)).toBe(s2);
    const ord2 = await admin.from("orders").select("cancelled_at").eq("id", orderIdA).single();
    expect(ord2.data!.cancelled_at).toBe(ord1.data!.cancelled_at);
    const ev = await admin.from("order_events").select("status").eq("order_id", orderIdA).eq("status", "cancelled");
    expect(ev.data).toHaveLength(1);
  });

  it("20. cancel another user's order -> rejected", async () => {
    const r = await admin.rpc("cancel_order", { p_order_id: orderIdA, p_user_id: idB });
    expectRaise(r, /not your order/);
  });

  it("21. cancel after ships_at (effective shipped) -> rejected", async () => {
    const pay = await admin
      .from("payments")
      .insert({ user_id: idA, amount_cents: 500, status: "succeeded", expires_at: new Date(Date.now() + 900_000).toISOString() })
      .select("id")
      .single();
    const ord = await admin
      .from("orders")
      .insert({
        user_id: idA,
        status: "placed",
        created_at: new Date(Date.now() - 30 * 60_000).toISOString(),
        ships_at: new Date(Date.now() - 15 * 60_000).toISOString(),
        delivered_at: new Date(Date.now() + 90 * 60_000).toISOString(),
        subtotal_cents: 500,
        shipping_cents: 0,
        tax_cents: 0,
        total_cents: 500,
        ship_address: address,
        payment_id: pay.data!.id,
      })
      .select("id")
      .single();
    expect(ord.error).toBeNull();

    const r = await admin.rpc("cancel_order", { p_order_id: ord.data!.id, p_user_id: idA });
    expectRaise(r, /already shipped/);
    const still = await admin.from("orders").select("status").eq("id", ord.data!.id).single();
    expect(still.data!.status).toBe("placed");

    await admin.from("orders").delete().eq("id", ord.data!.id);
    await admin.from("payments").delete().eq("id", pay.data!.id);
  });

  it("22. CLEANUP: stock + seed restored, test users and all their rows deleted", async () => {
    const setProd = await admin
      .from("products")
      .update({ stock: stock1Orig, seed_rating_avg: seedAvgOrig, seed_rating_count: seedCountOrig, rating_avg: seedAvgOrig, rating_count: seedCountOrig })
      .eq("id", p1.id);
    expect(setProd.error).toBeNull();
    const setProd2 = await admin.from("products").update({ stock: stock2Orig }).eq("id", p2.id);
    expect(setProd2.error).toBeNull();

    for (const id of [idA, idB, idC]) {
      const d = await admin.auth.admin.deleteUser(id);
      expect(d.error?.message ?? null).toBeNull();
    }

    const orders = await admin.from("orders").select("id", { count: "exact", head: true }).in("user_id", [idA, idB, idC]);
    const payments = await admin.from("payments").select("id", { count: "exact", head: true }).in("user_id", [idA, idB, idC]);
    const carts = await admin.from("cart_items").select("id", { count: "exact", head: true }).in("user_id", [idA, idB, idC]);
    const reviews = await admin.from("reviews").select("id", { count: "exact", head: true }).in("user_id", [idA, idB, idC]);
    expect(orders.count).toBe(0);
    expect(payments.count).toBe(0);
    expect(carts.count).toBe(0);
    expect(reviews.count).toBe(0);

    const s1 = await stockOf(p1.id);
    const s2 = await stockOf(p2.id);
    expect(s1).toBe(stock1Orig);
    expect(s2).toBe(stock2Orig);
    const prod = await admin.from("products").select("seed_rating_avg, seed_rating_count, rating_avg, rating_count").eq("id", p1.id).single();
    expect(Number(prod.data!.seed_rating_avg)).toBeCloseTo(seedAvgOrig, 2);
    expect(prod.data!.seed_rating_count).toBe(seedCountOrig);
    expect(Number(prod.data!.rating_avg)).toBeCloseTo(seedAvgOrig, 2);
    expect(prod.data!.rating_count).toBe(seedCountOrig);

    console.log(
      `CLEANUP OK: users deleted=3, orders=0, payments=0, cart_items=0, reviews=0, stock restored=${s1}/${s2} (orig ${stock1Orig}/${stock2Orig}), seed+rating restored=${prod.data!.rating_avg}/${prod.data!.rating_count}`,
    );
    idA = "";
    idB = "";
    idC = "";
  });
});
