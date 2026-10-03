import Link from "next/link";
import type { CartLine } from "@/lib/cart";
import { MAX_CART_QTY } from "@/lib/cart";
import { effectivePriceCents } from "@/lib/pricing";
import { formatCents } from "@/lib/money";
import { ProductImage } from "./ProductImage";

interface CartLineRowProps {
  line: CartLine;
  lineUpdating?: boolean;
  onQty: (productId: string, qty: number) => void;
  onRemove: (productId: string) => void;
  showLineTotal?: boolean;
}

export function CartLineRow({
  line,
  lineUpdating = false,
  onQty,
  onRemove,
  showLineTotal = true,
}: CartLineRowProps) {
  const unit = effectivePriceCents(line.priceCents, line.discountPct);
  const maxQty = Math.min(line.stock, MAX_CART_QTY);

  return (
    <li
      className={`flex flex-col gap-4 rounded-2xl border border-line bg-paper p-4 sm:flex-row sm:items-center ${
        lineUpdating ? "opacity-70" : ""
      }`}
    >
      <Link
        className="relative block h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-line bg-white focus:outline-2 focus:outline-accent"
        href={`/p/${line.slug}`}
      >
        <ProductImage alt={line.title} src={line.imageUrl} title={line.title} />
      </Link>

      <div className="min-w-0 flex-1">
        <Link
          className="line-clamp-2 text-sm font-medium text-ink hover:text-accent hover:underline focus:outline-2 focus:outline-accent"
          href={`/p/${line.slug}`}
        >
          {line.title}
        </Link>
        <p className="mt-1 text-sm text-ink-muted">
          {formatCents(unit)}
          {line.discountPct > 0 && (
            <s className="ml-2 text-xs">{formatCents(line.priceCents)}</s>
          )}
          {line.stock <= 5 && (
            <span className="ml-2 text-xs font-semibold text-accent">
              Only {line.stock} left
            </span>
          )}
        </p>
        <button
          className="mt-2 min-h-11 text-sm font-semibold text-accent hover:underline focus:outline-2 focus:outline-accent"
          onClick={() => onRemove(line.productId)}
          type="button"
        >
          Remove
        </button>
      </div>

      <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
        <div
          aria-label={`Quantity for ${line.title}`}
          className="flex items-center rounded-full border border-line bg-white"
          role="group"
        >
          <button
            aria-label={`Decrease quantity of ${line.title}`}
            className="min-h-11 min-w-11 px-3 text-ink hover:text-accent focus:outline-2 focus:outline-accent disabled:text-ink-muted/50"
            disabled={line.qty <= 1 || lineUpdating}
            onClick={() => onQty(line.productId, line.qty - 1)}
            type="button"
          >
            −
          </button>
          <span
            aria-live="polite"
            className="w-8 text-center text-sm font-semibold text-ink"
          >
            {line.qty}
          </span>
          <button
            aria-label={`Increase quantity of ${line.title}`}
            className="min-h-11 min-w-11 px-3 text-ink hover:text-accent focus:outline-2 focus:outline-accent disabled:text-ink-muted/50"
            disabled={line.qty >= maxQty || lineUpdating}
            onClick={() => onQty(line.productId, line.qty + 1)}
            type="button"
          >
            +
          </button>
        </div>
        <span className="text-sm font-semibold text-ink">
          {showLineTotal ? formatCents(line.lineTotalCents) : "…"}
        </span>
      </div>
    </li>
  );
}
