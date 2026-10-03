import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/shop/ProductCard";
import { getCategoryPage } from "@/lib/shop";
import { getUser } from "@/lib/supabase/getUser";

interface CategoryPageProps {
  params: Promise<{ group: string }>;
  searchParams: Promise<{ page?: string }>;
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { group } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const data = await getCategoryPage(group, page);
  if (!data) notFound();

  const user = await getUser();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-muted">
        <Link className="hover:text-accent hover:underline" href="/">
          Home
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-ink">{data.name}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-3xl font-semibold text-ink">{data.name}</h1>
        <p className="text-sm text-ink-muted">
          {data.total} {data.total === 1 ? "product" : "products"}
        </p>
      </div>

      {data.products.length === 0 ? (
        <div className="rounded-2xl border border-line bg-paper p-8 text-center">
          <p className="text-ink">
            {data.total === 0
              ? "This category is empty — no products here yet."
              : `Page ${page} is out of range.`}
          </p>
          <Link
            className="mt-4 inline-block rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white hover:opacity-90 focus:outline-2 focus:outline-accent"
            href={data.total === 0 ? "/" : `/c/${group}`}
          >
            {data.total === 0 ? "Back to home" : "Back to first page"}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {data.products.map((product) => (
            <ProductCard key={product.slug} product={product} signedIn={user !== null} />
          ))}
        </div>
      )}

      {data.pageCount > 1 && (
        <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-4 text-sm">
          {page > 1 ? (
            <Link
              className="rounded-full border border-line px-4 py-2 text-ink hover:bg-paper focus:outline-2 focus:outline-accent"
              href={`/c/${group}?page=${page - 1}`}
            >
              ← Previous
            </Link>
          ) : (
            <span aria-disabled="true" className="rounded-full border border-line px-4 py-2 text-ink-muted/50">
              ← Previous
            </span>
          )}
          <span className="text-ink-muted">
            Page {page} of {data.pageCount}
          </span>
          {page < data.pageCount ? (
            <Link
              className="rounded-full border border-line px-4 py-2 text-ink hover:bg-paper focus:outline-2 focus:outline-accent"
              href={`/c/${group}?page=${page + 1}`}
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
  );
}
