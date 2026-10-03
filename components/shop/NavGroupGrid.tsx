import Link from "next/link";
import type { GroupTileData } from "@/lib/shop";
import { ProductImage } from "./ProductImage";

interface NavGroupGridProps {
  tiles: GroupTileData[];
}

// Owner rule: only groups with at least one product ever reach this component
// (getHomeData filters them out).
export function NavGroupGrid({ tiles }: NavGroupGridProps) {
  if (tiles.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {tiles.map((tile) => (
        <Link
          className="group relative overflow-hidden rounded-2xl border border-line bg-paper focus:outline-2 focus:outline-accent"
          href={`/c/${tile.slug}`}
          key={tile.slug}
        >
          <div className="relative aspect-[4/3] w-full bg-white">
            <ProductImage alt={tile.name} src={tile.image} title={tile.name} />
          </div>
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <span className="font-display text-base font-semibold text-ink group-hover:text-accent">
                {tile.name}
              </span>
              <p className="text-xs text-ink-muted">
                {tile.count} {tile.count === 1 ? "product" : "products"}
              </p>
            </div>
            <span aria-hidden="true" className="shrink-0 text-ink-muted">
              →
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
