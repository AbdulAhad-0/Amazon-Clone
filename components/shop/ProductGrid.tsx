import type { ProductCardData } from "@/lib/shop";
import { ProductCard } from "./ProductCard";

export function ProductGrid({ items }: { items: ProductCardData[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((product) => (
        <ProductCard key={product.slug} product={product} />
      ))}
    </div>
  );
}
