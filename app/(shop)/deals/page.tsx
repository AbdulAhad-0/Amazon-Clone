import Link from "next/link";
import { ActiveFilters } from "@/components/shop/ActiveFilters";
import { FilterRail } from "@/components/shop/FilterRail";
import { FilterSheet } from "@/components/shop/FilterSheet";
import { ProductGrid } from "@/components/shop/ProductGrid";
import {
  SEARCH_SORTS,
  SEARCH_PAGE_SIZE,
  applyFilters,
  buildSearchUrl,
  parseSearchParams,
  type SearchParams,
} from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/getUser";

const DEFAULT_SORT = "discount";

interface DealsPageProps {
  searchParams: Promise<SearchParams>;
}

export default async function DealsPage({ searchParams }: DealsPageProps) {
  const raw0 = await searchParams;
  const raw = { ...raw0, deals: "1", sort: raw0.sort ?? DEFAULT_SORT };
  const parsed = parseSearchParams(raw);
  const supabase = await createClient();
  const { items, total, brands } = await applyFilters(supabase, raw);
  const user = await getUser();

  const groupsRes = await supabase.from("nav_groups").select("slug, name").order("sort_order");
  if (groupsRes.error) throw new Error(`nav_groups: ${groupsRes.error.message}`);
  const groups = groupsRes.data ?? [];

  const maxRes = await supabase
    .from("products")
    .select("discount_pct")
    .gt("discount_pct", 0)
    .gt("stock", 0)
    .order("discount_pct", { ascending: false })
    .limit(1);
  const maxOff = maxRes.data?.[0]?.discount_pct ?? 0;

  const pageCount = Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE));
  const hrefForPage = (n: number) => buildSearchUrl({ ...parsed, page: n }, "/deals", DEFAULT_SORT);

  const activeCount = [
    parsed.group,
    parsed.brand,
    parsed.minCents,
    parsed.maxCents,
    parsed.rating,
    parsed.sort !== DEFAULT_SORT ? parsed.sort : undefined,
  ].filter((v) => v !== undefined).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-muted">
        <Link className="hover:text-accent hover:underline" href="/">
          Home
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-ink">Today&rsquo;s Deals</span>
      </nav>

      <div className="flex gap-6 pb-24 md:pb-0">
        <aside className="hidden w-64 shrink-0 md:block">
          <div className="sticky top-20">
            <FilterRail brands={brands} groups={groups} parsed={parsed} sortValues={SEARCH_SORTS} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <h1 className="mb-1 font-display text-2xl font-semibold text-ink sm:text-3xl">
            {total} {total === 1 ? "deal" : "deals"}
          </h1>
          {maxOff > 0 && (
            <p className="mb-4 text-sm font-semibold text-accent">Up to {maxOff}% off</p>
          )}

          <ActiveFilters groups={groups} parsed={parsed} />

          {items.length === 0 ? (
            <div className="rounded-2xl border border-line bg-paper p-8 text-center">
              <p className="text-ink">
                No deals match your filters right now — check back soon or clear your filters.
              </p>
              <Link
                className="mt-4 inline-block rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white hover:opacity-90 focus:outline-2 focus:outline-accent"
                href="/deals"
              >
                Clear all filters
              </Link>
            </div>
          ) : (
            <>
              <ProductGrid items={items} signedIn={user !== null} />
              {pageCount > 1 && (
                <nav aria-label="Pagination" className="mt-6 flex items-center justify-between">
                  {parsed.page > 1 ? (
                    <Link
                      className="rounded-full border border-line px-4 py-2 text-ink hover:bg-paper focus:outline-2 focus:outline-accent"
                      href={hrefForPage(parsed.page - 1)}
                    >
                      ← Previous
                    </Link>
                  ) : (
                    <span className="px-4 py-2 text-ink-muted">← Previous</span>
                  )}
                  <span className="text-sm text-ink-muted">
                    Page {parsed.page} of {pageCount}
                  </span>
                  {parsed.page < pageCount ? (
                    <Link
                      className="rounded-full border border-line px-4 py-2 text-ink hover:bg-paper focus:outline-2 focus:outline-accent"
                      href={hrefForPage(parsed.page + 1)}
                    >
                      Next →
                    </Link>
                  ) : (
                    <span className="px-4 py-2 text-ink-muted">Next →</span>
                  )}
                </nav>
              )}
            </>
          )}
        </div>
      </div>

      <FilterSheet
        activeCount={activeCount}
        brands={brands}
        groups={groups}
        parsed={parsed}
        resultCount={total}
        sortValues={SEARCH_SORTS}
      />
    </div>
  );
}
