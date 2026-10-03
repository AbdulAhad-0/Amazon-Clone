"use client";

import Link from "next/link";
import type { CartLine, CartTotals } from "@/lib/cart";
import { useOptimisticCart } from "@/hooks/useOptimisticCart";
import { CartLineRow } from "./CartLineRow";
import { CartSummary } from "./CartSummary";

interface CartClientProps {
  initialLines: CartLine[];
  initialTotals: CartTotals;
}

export function CartClient({ initialLines, initialTotals }: CartClientProps) {
  const { displayLines, totals, optimisticQty, pending, changeQty } = useOptimisticCart(
    initialLines,
    initialTotals,
  );

  if (displayLines.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-paper p-8 text-center">
        <p className="font-display text-xl text-ink">Your cart is empty</p>
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

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div>
        <ul className="space-y-4">
          {displayLines.map((line) => {
            const updating = optimisticQty[line.productId] !== undefined;
            return (
              <CartLineRow
                key={line.productId}
                line={line}
                lineUpdating={updating}
                onQty={changeQty}
                onRemove={(productId) => changeQty(productId, 0)}
                showLineTotal={!updating}
              />
            );
          })}
        </ul>

        <div className="mt-6 rounded-2xl border border-line bg-paper p-4">
          <CartSummaryLine pending={pending > 0} />
        </div>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <CartSummary pending={pending > 0} totals={totals} />
        <Link
          className="mt-4 block min-h-11 w-full rounded-full bg-accent px-6 py-3 text-center text-sm font-semibold text-white hover:opacity-90 focus:outline-2 focus:outline-accent"
          href="/checkout"
        >
          Checkout
        </Link>
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

function CartSummaryLine({ pending }: { pending: boolean }) {
  return (
    <p aria-live="polite" className="text-xs text-ink-muted">
      {pending
        ? "Updating your cart — totals refresh from the server…"
        : "Totals are calculated on the server. Free shipping over $35.00."}
    </p>
  );
}
