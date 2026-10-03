import Link from "next/link";
import { ActiveFilters } from "@/components/shop/ActiveFilters";
import { FilterRail } from "@/components/shop/FilterRail";
import { FilterSheet } from "@/components/shop/FilterSheet";
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
  const { items, total, brands } = await applyFilters(supabase, raw);

  const groupsRes = await supabase.from("nav_groups").select("slug, name").order("sort_order");
  if (groupsRes.error) throw new Error(`nav_groups: ${groupsRes.error.message}`);
  const groups = groupsRes.data ?? [];

  const q = parsed.q;
  const word = total === 1 ? "result" : "results";
  const heading = q !== undefined ? `${total} ${word} for “${q}”` : `${total} ${word}`;
  const clearHref = q !== undefined ? `/search?q=${encodeURIComponent(q)}` : "/search";

  const activeCount = [
    parsed.group,
    parsed.brand,
    parsed.minCents,
    parsed.maxCents,
    parsed.rating,
    parsed.sort !== "relevance" ? parsed.sort : undefined,
  ].filter((v) => v !== undefined).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-muted">
        <Link className="hover:text-accent hover:underline" href="/">
          Home
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-ink">Search</span>
      </nav>

      <div className="flex gap-6 pb-24 md:pb-0">
        <aside className="hidden w-64 shrink-0 md:block">
          <div className="sticky top-20">
            <FilterRail brands={brands} groups={groups} parsed={parsed} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <h1 className="mb-4 font-display text-2xl font-semibold text-ink sm:text-3xl">{heading}</h1>

          <ActiveFilters groups={groups} parsed={parsed} />

          {items.length === 0 ? (
            <div className="rounded-2xl border border-line bg-paper p-8 text-center">
              <p className="text-ink">
                No products match{q !== undefined ? <> for “{q}”</> : null} — try different keywords
                or clear your filters.
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
      </div>

      <FilterSheet
        activeCount={activeCount}
        brands={brands}
        groups={groups}
        parsed={parsed}
        resultCount={total}
      />
    </div>
  );
}
