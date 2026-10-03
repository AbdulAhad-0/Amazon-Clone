import Link from "next/link";
import type { ProductCardData } from "@/lib/shop";
import { effectivePriceCents } from "@/lib/shop";
import { formatCents } from "@/lib/money";
import { ProductImage } from "./ProductImage";
import { RatingStars } from "./RatingStars";

export function ProductCard({ product }: { product: ProductCardData }) {
  const effective = effectivePriceCents(product.priceCents, product.discountPct);
  return (
    <Link
      className="flex flex-col rounded-2xl border border-line bg-paper p-3 transition-shadow hover:shadow-md focus:outline-2 focus:outline-accent"
      href={`/p/${product.slug}`}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-white">
        <ProductImage alt={product.title} src={product.image} title={product.title} />
      </div>
      {product.brand && <p className="mt-2 text-xs text-ink-muted">{product.brand}</p>}
      <span className="mt-1 line-clamp-2 text-sm text-ink">{product.title}</span>
      <RatingStars avg={product.ratingAvg} count={product.ratingCount} />
      <span className="mt-1 font-semibold text-ink">
        {formatCents(effective)}
        {product.discountPct > 0 && (
          <s className="ml-2 text-xs font-normal text-ink-muted">{formatCents(product.priceCents)}</s>
        )}
      </span>
    </Link>
  );
}
