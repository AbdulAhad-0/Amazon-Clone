import Link from "next/link";
import { ProductGrid } from "@/components/shop/ProductGrid";
import { applyFilters, parseSearchParams, type SearchParams } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

interface SearchPageProps {
  searchParams: Promise<SearchParams>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const raw = await searchParams;
  const parsed = parseSearchParams(raw);
  const supabase = await createClient();
  const { items, total } = await applyFilters(supabase, raw);

  const q = parsed.q;
  const word = total === 1 ? "result" : "results";
  const heading = q !== undefined ? `${total} ${word} for “${q}”` : `${total} ${word}`;
  const clearHref = q !== undefined ? `/search?q=${encodeURIComponent(q)}` : "/search";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-muted">
        <Link className="hover:text-accent hover:underline" href="/">
          Home
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-ink">Search</span>
      </nav>

      <h1 className="mb-6 font-display text-2xl font-semibold text-ink sm:text-3xl">{heading}</h1>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-line bg-paper p-8 text-center">
          <p className="text-ink">
            No products match{q !== undefined ? <> for “{q}”</> : null} — try different keywords or
            clear your filters.
          </p>
          <Link
            className="mt-4 inline-block rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white hover:opacity-90 focus:outline-2 focus:outline-accent"
            href={clearHref}
          >
            Clear all filters
          </Link>
        </div>
      ) : (
        <ProductGrid items={items} />
      )}
    </div>
  );
}
