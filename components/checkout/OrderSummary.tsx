import type { CartTotals } from "@/lib/cart";
import { FREE_SHIPPING_CENTS } from "@/lib/pricing";
import { formatCents } from "@/lib/money";

interface OrderSummaryProps {
  totals: CartTotals;
  itemCount: number;
}

// Server-rendered money — same numbers place_order will re-verify (ADR-016).
export function OrderSummary({ totals, itemCount }: OrderSummaryProps) {
  return (
    <aside aria-label="Order summary" className="rounded-2xl border border-line bg-paper p-5">
      <h2 className="mb-4 font-display text-lg font-semibold text-ink">Order summary</h2>
      <p className="mb-4 text-sm text-ink-muted">
        {itemCount} {itemCount === 1 ? "item" : "items"}
      </p>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-muted">Subtotal</dt>
          <dd className="text-ink">{formatCents(totals.subtotalCents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">Estimated shipping</dt>
          <dd className={totals.shippingCents === 0 ? "font-semibold text-green-700" : "text-ink"}>
            {totals.shippingCents === 0 ? "FREE" : formatCents(totals.shippingCents)}
          </dd>
        </div>
        {totals.shippingCents > 0 && (
          <p className="text-xs text-ink-muted">
            Free shipping over {formatCents(FREE_SHIPPING_CENTS)}.
          </p>
        )}
        <div className="flex justify-between">
          <dt className="text-ink-muted">Estimated tax (8%)</dt>
          <dd className="text-ink">{formatCents(totals.taxCents)}</dd>
        </div>
        <div className="flex justify-between border-t border-line pt-2 font-semibold">
          <dt className="text-ink">Total</dt>
          <dd className="text-ink" data-testid="checkout-total">
            {formatCents(totals.totalCents)}
          </dd>
        </div>
      </dl>
      <p className="mt-4 rounded-xl bg-white p-3 text-xs text-ink-muted">
        No surprises: the total you see here is exactly what the server charges — nothing is
        added later.
      </p>
    </aside>
  );
}
