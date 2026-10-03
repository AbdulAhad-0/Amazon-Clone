import { costBreakdown, type CostBreakdown } from "@/lib/shop";
import { formatCents } from "@/lib/money";

interface BuyBoxProps {
  slug: string;
  priceCents: number;
  discountPct: number;
  stock: number;
  qty: number;
}

// Server component: qty changes via GET form → searchParams → this re-renders
// with costBreakdown() recomputed server-side (ADR-004: no client-side math).
export function BuyBox({ slug, priceCents, discountPct, stock, qty }: BuyBoxProps) {
  const outOfStock = stock === 0;
  const maxQty = outOfStock ? 1 : Math.min(stock, 10);
  const cost: CostBreakdown = costBreakdown(priceCents, discountPct, qty);
  const discounted = discountPct > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-display text-3xl font-semibold text-ink">
          {formatCents(cost.unitEffectiveCents)}
        </span>
        {discounted && (
          <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
            Save {discountPct}%
          </span>
        )}
        {discounted && (
          <s className="text-sm text-ink-muted">{formatCents(priceCents)}</s>
        )}
      </div>

      <p className={`text-sm font-semibold ${outOfStock ? "text-red-600" : "text-green-700"}`}>
        {outOfStock ? "Out of stock" : "In stock"}
      </p>

      <form action={`/p/${slug}`} className="flex items-center gap-3" method="get">
        <label className="text-sm text-ink-muted" htmlFor="qty-label">
          Qty:
        </label>
        <span className="flex items-center rounded-full border border-line">
          <button
            aria-label="Decrease quantity"
            className="px-3 py-1.5 text-ink disabled:text-ink-muted/50 focus:outline-2 focus:outline-accent"
            disabled={qty <= 1}
            name="qty"
            type="submit"
            value={qty - 1}
          >
            −
          </button>
          <span aria-live="polite" className="w-8 text-center text-sm font-semibold text-ink" id="qty-label">
            {qty}
          </span>
          <button
            aria-label="Increase quantity"
            className="px-3 py-1.5 text-ink disabled:text-ink-muted/50 focus:outline-2 focus:outline-accent"
            disabled={qty >= maxQty}
            name="qty"
            type="submit"
            value={qty + 1}
          >
            +
          </button>
        </span>
        {discounted && <span className="text-xs text-ink-muted">max {maxQty}</span>}
      </form>

      <div>
        <button
          className="w-full rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:opacity-90 focus:outline-2 focus:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
          disabled={outOfStock}
          type="button"
        >
          Add to cart
        </button>
        <p className="mt-2 text-xs text-ink-muted">Cart arrives in a later slice — nothing is added yet.</p>
      </div>

      <div className="rounded-2xl border border-line bg-paper p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink">Price details</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">
              Item ({formatCents(cost.unitEffectiveCents)} × {cost.qty})
            </dt>
            <dd className="text-ink">{formatCents(cost.itemCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">Estimated shipping</dt>
            <dd className={cost.shippingCents === 0 ? "text-green-700" : "text-ink"}>
              {cost.shippingCents === 0 ? "FREE" : formatCents(cost.shippingCents)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">Estimated tax (8%)</dt>
            <dd className="text-ink">{formatCents(cost.taxCents)}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2 font-semibold">
            <dt className="text-ink">Total</dt>
            <dd className="text-ink">{formatCents(cost.totalCents)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-ink-muted">
          Estimates shown before you commit — checkout will show the final total. Nothing is charged now.
        </p>
      </div>
    </div>
  );
}
