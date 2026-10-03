"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CartLine, CartTotals } from "@/lib/cart";
import {
  GUEST_CART_EVENT,
  readGuestCart,
  removeGuestLine,
  setGuestQty,
  writeGuestCart,
} from "@/lib/guestCart";
import { CartLineRow } from "./CartLineRow";
import { CartSummary } from "./CartSummary";

interface PreviewResponse {
  lines?: CartLine[];
  totals?: CartTotals;
  dropped?: number;
}

interface GuestState {
  status: "loading" | "ready" | "empty" | "error";
  lines: CartLine[];
  totals: CartTotals | null;
  dropped: number;
}

export function GuestCart() {
  const [state, setState] = useState<GuestState>({
    status: "loading",
    lines: [],
    totals: null,
    dropped: 0,
  });
  const [localQty, setLocalQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const items = readGuestCart();
    if (items.length === 0) {
      setState({ status: "empty", lines: [], totals: null, dropped: 0 });
      setLocalQty({});
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/cart-preview", {
        body: JSON.stringify({ items }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!res.ok) throw new Error(`preview ${res.status}`);
      const data = (await res.json()) as PreviewResponse;
      if (!Array.isArray(data.lines) || !data.totals) throw new Error("bad preview payload");

      const dropped = typeof data.dropped === "number" ? data.dropped : 0;
      if (dropped > 0) {
        const keep = new Set(data.lines.map((l) => l.productId));
        writeGuestCart(readGuestCart().filter((i) => keep.has(i.productId)));
      }
      if (data.lines.length === 0) {
        setState({ status: "empty", lines: [], totals: null, dropped });
        setLocalQty({});
        return;
      }
      setState({ status: "ready", lines: data.lines, totals: data.totals, dropped });
      setLocalQty({});
    } catch {
      setState({ status: "error", lines: [], totals: null, dropped: 0 });
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "vendra.cart" || e.key === null) void load();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(GUEST_CART_EVENT, load);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(GUEST_CART_EVENT, load);
    };
  }, [load]);

  function changeQty(productId: string, qty: number) {
    const serverLine = state.lines.find((l) => l.productId === productId);
    const current = localQty[productId] ?? serverLine?.qty ?? 1;
    const next = Math.max(qty, 0);
    if (next === current && next > 0) return;
    setLocalQty((m) => ({ ...m, [productId]: next }));
    setGuestQty(productId, next);
  }

  function removeLine(productId: string) {
    setLocalQty((m) => ({ ...m, [productId]: 0 }));
    removeGuestLine(productId);
  }

  if (state.status === "loading" && state.lines.length === 0) {
    return (
      <div aria-busy="true" aria-live="polite" className="space-y-4">
        <p className="sr-only">Loading your cart…</p>
        {[0, 1].map((i) => (
          <div className="flex gap-4 rounded-2xl border border-line bg-paper p-4" key={i}>
            <div className="h-24 w-24 animate-pulse rounded-xl bg-line" />
            <div className="flex-1 space-y-3 py-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-line" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-line" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-2xl border border-line bg-paper p-8 text-center">
        <p className="text-ink">We couldn&apos;t load your cart.</p>
        <button
          className="mt-4 min-h-11 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:opacity-90 focus:outline-2 focus:outline-accent"
          onClick={() => void load()}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  }

  if (state.status === "empty" || !state.totals) {
    return (
      <div className="rounded-2xl border border-line bg-paper p-8 text-center">
        <p className="font-display text-xl text-ink">Your cart is empty</p>
        {state.dropped > 0 && (
          <p className="mt-2 text-sm text-ink-muted">
            {state.dropped === 1
              ? "1 item was no longer available and was removed."
              : `${state.dropped} items were no longer available and were removed.`}
          </p>
        )}
        <p className="mt-2 text-sm text-ink-muted">
          Browse a category to add your first item.
        </p>
        <Link
          className="mt-4 inline-block min-h-11 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:opacity-90 focus:outline-2 focus:outline-accent"
          href="/c/electronics"
        >
          Browse electronics
        </Link>
      </div>
    );
  }

  const displayLines = state.lines
    .map((line) => {
      const o = localQty[line.productId];
      return o === undefined ? line : { ...line, qty: o };
    })
    .filter((line) => line.qty > 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div>
        {state.dropped > 0 && (
          <p
            aria-live="polite"
            className="mb-4 rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-ink"
          >
            {state.dropped === 1
              ? "1 item was no longer available and was removed from your cart."
              : `${state.dropped} items were no longer available and were removed from your cart.`}
          </p>
        )}

        <ul className="space-y-4">
          {displayLines.map((line) => {
            const updating = localQty[line.productId] !== undefined;
            return (
              <CartLineRow
                key={line.productId}
                line={line}
                lineUpdating={updating && busy}
                onQty={changeQty}
                onRemove={removeLine}
                showLineTotal={!(updating && busy)}
              />
            );
          })}
        </ul>

        <p className="mt-6 text-xs text-ink-muted">
          Prices are re-checked on the server every time you change this cart.
        </p>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <CartSummary pending={busy} totals={state.totals} />
        <Link
          className="mt-4 block min-h-11 w-full rounded-full bg-accent px-6 py-3 text-center text-sm font-semibold text-white hover:opacity-90 focus:outline-2 focus:outline-accent"
          href="/signin?next=/checkout"
        >
          Checkout
        </Link>
        <p className="mt-2 text-center text-xs text-ink-muted">
          Sign in to check out — your cart moves with you.
        </p>
        <Link
          className="mt-3 block min-h-11 w-full rounded-full border border-line bg-white px-6 py-3 text-center text-sm font-semibold text-ink hover:border-accent hover:text-accent focus:outline-2 focus:outline-accent"
          href="/search"
        >
          Continue shopping
        </Link>
      </aside>
    </div>
  );
}
