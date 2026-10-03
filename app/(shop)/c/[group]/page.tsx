import Link from "next/link";
import { notFound } from "next/navigation";
import { ActiveFilters } from "@/components/shop/ActiveFilters";
import { CategoryChips } from "@/components/shop/CategoryChips";
import { FilterRail, SORT_LABELS } from "@/components/shop/FilterRail";
import { FilterSheet } from "@/components/shop/FilterSheet";
import { ProductCard } from "@/components/shop/ProductCard";
import { ProductGrid } from "@/components/shop/ProductGrid";
import {
  SEARCH_PAGE_SIZE,
  applyFilters,
  buildSearchUrl,
  parseSearchParams,
  type SearchParams,
  type SortValue,
} from "@/lib/search";
import { getCategoryChips, getGroupMeta, getTopRatedRail } from "@/lib/shop";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/getUser";

// Category sort set (spec Part 3): Top rated default, price asc/desc, newest,
// biggest discount. NO "Best sellers" — real order-based ranking is a
// post-Slice-6 task once order_items exist (noted in docs/progress.md).
const CATEGORY_SORTS: readonly SortValue[] = ["rating", "price_asc", "price_desc", "newest", "discount"];
const CATEGORY_SORT_LABELS: Record<string, string> = { ...SORT_LABELS, rating: "Top rated" };
const CATEGORY_DEFAULT_SORT: SortValue = "rating";

interface CategoryPageProps {
  params: Promise<{ group: string }>;
  searchParams: Promise<SearchParams>;
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { group } = await params;
  const raw = await searchParams;

  const meta = await getGroupMeta(group);
  if (!meta) notFound();

  // Default sort = Top rated; invalid/absent sort falls back to it.
  const preParsed = parseSearchParams(raw);
  const effectiveSort: SortValue = CATEGORY_SORTS.includes(preParsed.sort) ? preParsed.sort : CATEGORY_DEFAULT_SORT;
  const forced: SearchParams = { ...raw, group, sort: effectiveSort };

  const supabase = await createClient();
  const { items, total, brands } = await applyFilters(supabase, forced);
  const user = await getUser();
  const { chips, allCount } = await getCategoryChips(meta.id);

  // UI sees the same params minus the path-owned group.
  const parsed = { ...parseSearchParams(forced), group: undefined };
  const baseUrl = `/c/${meta.slug}`;

  const hasAnyFilter = [
    parsed.cat,
    parsed.brand,
    parsed.minCents,
    parsed.maxCents,
    parsed.rating,
    parsed.deals,
  ].some((v) => v !== undefined);
  const showRail = parsed.page === 1 && !hasAnyFilter && total > 0;
  const rail = showRail ? await getTopRatedRail(meta.id) : [];

  const pageCount = Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE));
  const activeCount = [
    parsed.cat,
    parsed.brand,
    parsed.minCents,
    parsed.maxCents,
    parsed.rating,
    parsed.deals,
  ].filter((v) => v !== undefined).length;

  const filterContext = {
    parsed,
    groups: [],
    brands,
    baseUrl,
    defaultSort: CATEGORY_DEFAULT_SORT,
    sortLabels: CATEGORY_SORT_LABELS,
    sortValues: CATEGORY_SORTS,
    showGroup: false,
    showDeals: true,
  };

  const hrefForPage = (n: number) =>
    buildSearchUrl({ ...parsed, page: n }, baseUrl, CATEGORY_DEFAULT_SORT);

  return (
    <div className="pb-24 md:pb-0">
      {/* Header band */}
      <header className="mb-6 border-b border-line bg-ink text-white">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <nav aria-label="Breadcrumb" className="mb-3 text-sm text-white/70">
            <Link className="hover:text-white hover:underline focus:outline-2 focus:outline-accent" href="/">
              Home
            </Link>
            <span aria-hidden="true"> / </span>
            <span className="text-white">{meta.name}</span>
          </nav>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="font-display text-3xl font-semibold sm:text-4xl">{meta.name}</h1>
            <p className="text-sm text-white/80">
              {total} {total === 1 ? "product" : "products"}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4">
        <CategoryChips allCount={allCount} baseUrl={baseUrl} chips={chips} parsed={parsed} />

        <div className="flex gap-6">
          <aside className="hidden w-64 shrink-0 md:block">
            <div className="sticky top-20">
              <FilterRail {...filterContext} />
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <ActiveFilters
              baseUrl={baseUrl}
              defaultSort={CATEGORY_DEFAULT_SORT}
              groups={[]}
              parsed={parsed}
            />

            {showRail && rail.length > 0 && (
              <section aria-label="Top rated" className="mb-8">
                <h2 className="mb-3 font-display text-lg font-semibold text-ink">Top rated</h2>
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {rail.map((product) => (
                    <div className="w-44 shrink-0" key={product.slug}>
                      <ProductCard product={product} signedIn={user !== null} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {items.length === 0 ? (
              <div className="rounded-2xl border border-line bg-paper p-8 text-center">
                <p className="text-ink">
                  {total === 0 && !hasAnyFilter
                    ? "This category is empty — no products here yet."
                    : total === 0
                      ? "No products match your filters — try different ones."
                      : `Page ${parsed.page} is out of range.`}
                </p>
                <Link
                  className="mt-4 inline-block rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white hover:opacity-90 focus:outline-2 focus:outline-accent"
                  href={
                    total === 0 && hasAnyFilter
                      ? baseUrl
                      : total === 0
                        ? "/"
                        : hrefForPage(1)
                  }
                >
                  {total === 0 && hasAnyFilter
                    ? "Clear filters"
                    : total === 0
                      ? "Back to home"
                      : "Back to first page"}
                </Link>
              </div>
            ) : (
              <ProductGrid items={items} signedIn={user !== null} />
            )}

            {pageCount > 1 && items.length > 0 && (
              <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-4 text-sm">
                {parsed.page > 1 ? (
                  <Link
                    className="rounded-full border border-line px-4 py-2 text-ink hover:bg-paper focus:outline-2 focus:outline-accent"
                    href={hrefForPage(parsed.page - 1)}
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span aria-disabled="true" className="rounded-full border border-line px-4 py-2 text-ink-muted/50">
                    ← Previous
                  </span>
                )}
                <span className="text-ink-muted">
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
                  <span aria-disabled="true" className="rounded-full border border-line px-4 py-2 text-ink-muted/50">
                    Next →
                  </span>
                )}
              </nav>
            )}
          </div>
        </div>

        <FilterSheet {...filterContext} resultCount={total} activeCount={activeCount} />
      </div>
    </div>
  );
}
