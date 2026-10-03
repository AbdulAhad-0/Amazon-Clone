import Link from "next/link";
import { ProductGrid } from "@/components/shop/ProductGrid";
import { SEARCH_PAGE_SIZE } from "@/lib/search";
import { getBestSellers } from "@/lib/best-sellers";
import { getUser } from "@/lib/supabase/getUser";

interface BestSellersPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function BestSellersPage({ searchParams }: BestSellersPageProps) {
  const sp = await searchParams;
  const pageRaw = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  const { items, fallback, totalUnits } = await getBestSellers();
  const user = await getUser();

  const pageCount = Math.max(1, Math.ceil(items.length / SEARCH_PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const slice = items.slice((current - 1) * SEARCH_PAGE_SIZE, current * SEARCH_PAGE_SIZE);
  const hrefForPage = (n: number) => `/best-sellers${n > 1 ? `?page=${n}` : ""}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-muted">
        <Link className="hover:text-accent hover:underline" href="/">
          Home
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-ink">Best Sellers</span>
      </nav>

      <h1 className="mb-2 font-display text-2xl font-semibold text-ink sm:text-3xl">
        Best sellers
      </h1>

      {fallback && (
        <p className="mb-6 rounded-2xl border border-line bg-paper p-4 text-sm text-ink-muted">
          Best sellers are ranked by units sold on Vendra. Until there are enough orders, this
          list shows our top rated products.
        </p>
      )}
      {!fallback && (
        <p className="mb-6 text-sm text-ink-muted">
          Ranked by {totalUnits} units sold across non-cancelled orders.
        </p>
      )}

      {slice.length === 0 ? (
        <div className="rounded-2xl border border-line bg-paper p-8 text-center">
          <p className="text-ink">No products to show yet — check back soon.</p>
          <Link
            className="mt-4 inline-block rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white hover:opacity-90 focus:outline-2 focus:outline-accent"
            href="/search"
          >
            Browse everything
          </Link>
        </div>
      ) : (
        <>
          <ProductGrid items={slice} signedIn={user !== null} />
          {pageCount > 1 && (
            <nav aria-label="Pagination" className="mt-6 flex items-center justify-between">
              {current > 1 ? (
                <Link
                  className="rounded-full border border-line px-4 py-2 text-ink hover:bg-paper focus:outline-2 focus:outline-accent"
                  href={hrefForPage(current - 1)}
                >
                  ← Previous
                </Link>
              ) : (
                <span className="px-4 py-2 text-ink-muted">← Previous</span>
              )}
              <span className="text-sm text-ink-muted">
                Page {current} of {pageCount}
              </span>
              {current < pageCount ? (
                <Link
                  className="rounded-full border border-line px-4 py-2 text-ink hover:bg-paper focus:outline-2 focus:outline-accent"
                  href={hrefForPage(current + 1)}
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
  );
}
