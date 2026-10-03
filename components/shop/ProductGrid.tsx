import type { ProductCardData } from "@/lib/shop";
import { ProductCard } from "./ProductCard";

interface ProductGridProps {
  items: ProductCardData[];
  signedIn?: boolean;
}

export function ProductGrid({ items, signedIn = false }: ProductGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((product) => (
        <ProductCard key={product.slug} product={product} signedIn={signedIn} />
      ))}
    </div>
  );
}
