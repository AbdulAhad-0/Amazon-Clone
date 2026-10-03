import type { CartTotals } from "@/lib/cart";
import { FREE_SHIPPING_CENTS } from "@/lib/pricing";
import { formatCents } from "@/lib/money";

interface CartSummaryProps {
  totals: CartTotals;
  pending?: boolean;
}

export function CartSummary({ totals, pending = false }: CartSummaryProps) {
  const gap = totals.freeShippingGapCents;
  const progressPct = Math.min(
    100,
    Math.round(((FREE_SHIPPING_CENTS - gap) / FREE_SHIPPING_CENTS) * 100),
  );

  return (
    <div
      aria-busy={pending}
      className="rounded-2xl border border-line bg-paper p-5"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">Order summary</h2>
        {pending && (
          <span aria-live="polite" className="text-xs font-semibold text-accent">
            Updating…
          </span>
        )}
      </div>

      <div className="mb-4">
        {gap > 0 ? (
          <>
            <p className="text-sm text-ink">
              <span className="font-semibold">{formatCents(gap)}</span> away from FREE
              shipping
            </p>
            <div
              aria-hidden="true"
              className="mt-2 h-2 overflow-hidden rounded-full bg-line"
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </>
        ) : (
          <p className="text-sm font-semibold text-green-700">
            Your order qualifies for FREE shipping
          </p>
        )}
      </div>

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
        <div className="flex justify-between">
          <dt className="text-ink-muted">Estimated tax (8%)</dt>
          <dd className="text-ink">{formatCents(totals.taxCents)}</dd>
        </div>
        <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
          <dt className="text-ink">Total</dt>
          <dd className="text-ink">{formatCents(totals.totalCents)}</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-ink-muted">
        Total shown before you checkout — nothing is charged now.
      </p>
    </div>
  );
}
