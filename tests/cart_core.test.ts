import { describe, expect, it } from "vitest";
import { cartTotals, MAX_CART_QTY, MAX_GUEST_LINES, parseGuestCart } from "../lib/cart";
import { FREE_SHIPPING_CENTS } from "../lib/shop";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";

describe("parseGuestCart (guest storage is never trusted)", () => {
  it("malformed JSON yields [] instead of throwing", () => {
    expect(parseGuestCart("{not json")).toEqual([]);
    expect(parseGuestCart("")).toEqual([]);
    expect(parseGuestCart("null")).toEqual([]);
  });

  it("non-array payloads yield []", () => {
    expect(parseGuestCart('{"productId":"x"}')).toEqual([]);
    expect(parseGuestCart(42)).toEqual([]);
    expect(parseGuestCart(undefined)).toEqual([]);
    expect(parseGuestCart(null)).toEqual([]);
  });

  it("drops non-uuid product ids and junk entries", () => {
    const raw = JSON.stringify([
      { productId: P1, qty: 2 },
      { productId: "not-a-uuid", qty: 5 },
      { productId: 123, qty: 5 },
      "garbage",
      null,
      { qty: 3 },
    ]);
    expect(parseGuestCart(raw)).toEqual([{ productId: P1, qty: 2 }]);
  });

  it("clamps qty into 1..MAX_CART_QTY and floors fractions", () => {
    const raw = JSON.stringify([
      { productId: P1, qty: 0 },
      { productId: P2, qty: 99 },
    ]);
    expect(parseGuestCart(raw)).toEqual([
      { productId: P1, qty: 1 },
      { productId: P2, qty: MAX_CART_QTY },
    ]);

    const fractional = JSON.stringify([{ productId: P1, qty: 2.9 }]);
    expect(parseGuestCart(fractional)).toEqual([{ productId: P1, qty: 2 }]);

    const missing = JSON.stringify([{ productId: P1 }]);
    expect(parseGuestCart(missing)).toEqual([{ productId: P1, qty: 1 }]);
  });

  it("merges duplicate product ids, capped at MAX_CART_QTY", () => {
    const raw = JSON.stringify([
      { productId: P1, qty: 20 },
      { productId: P1, qty: 20 },
    ]);
    expect(parseGuestCart(raw)).toEqual([{ productId: P1, qty: MAX_CART_QTY }]);
  });

  it("caps the number of guest lines", () => {
    const many = Array.from({ length: MAX_GUEST_LINES + 50 }, (_, i) => ({
      productId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      qty: 1,
    }));
    expect(parseGuestCart(JSON.stringify(many))).toHaveLength(MAX_GUEST_LINES);
  });

  it("accepts an already-parsed array (API body path)", () => {
    expect(parseGuestCart([{ productId: P1, qty: 3 }])).toEqual([{ productId: P1, qty: 3 }]);
  });
});

describe("cartTotals (spec §4 business rules)", () => {
  it("effective price, 8% tax, shipping below the free threshold", () => {
    // floor(1000 * 90/100) = 900 × 2 + 500 = 2300 subtotal
    const totals = cartTotals([
      { priceCents: 1000, discountPct: 10, qty: 2 },
      { priceCents: 500, discountPct: 0, qty: 1 },
    ]);
    expect(totals.subtotalCents).toBe(2300);
    expect(totals.shippingCents).toBe(599);
    expect(totals.taxCents).toBe(Math.round((2300 * 8) / 100));
    expect(totals.totalCents).toBe(2300 + 599 + Math.round((2300 * 8) / 100));
    expect(totals.freeShippingGapCents).toBe(FREE_SHIPPING_CENTS - 2300);
  });

  it("free shipping exactly at the threshold", () => {
    const totals = cartTotals([{ priceCents: FREE_SHIPPING_CENTS, discountPct: 0, qty: 1 }]);
    expect(totals.subtotalCents).toBe(FREE_SHIPPING_CENTS);
    expect(totals.shippingCents).toBe(0);
    expect(totals.freeShippingGapCents).toBe(0);
  });

  it("empty cart: all zeroes (no phantom shipping charge), full free-ship gap", () => {
    const totals = cartTotals([]);
    expect(totals.subtotalCents).toBe(0);
    expect(totals.shippingCents).toBe(0);
    expect(totals.taxCents).toBe(0);
    expect(totals.totalCents).toBe(0);
    expect(totals.freeShippingGapCents).toBe(FREE_SHIPPING_CENTS);
  });

  it("floors the effective price (never rounds up)", () => {
    // floor(999 * 50/100) = 499
    const totals = cartTotals([{ priceCents: 999, discountPct: 50, qty: 1 }]);
    expect(totals.subtotalCents).toBe(499);
  });
});
