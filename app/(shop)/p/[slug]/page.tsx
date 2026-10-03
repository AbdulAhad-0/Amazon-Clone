import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BuyBox } from "@/components/shop/BuyBox";
import { Gallery } from "@/components/shop/Gallery";
import { ProductCard } from "@/components/shop/ProductCard";
import { RatingStars } from "@/components/shop/RatingStars";
import { getProductDetail } from "@/lib/shop";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ qty?: string }>;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getProductDetail(slug);
  return { title: detail ? `${detail.title} · Vendra` : "Product · Vendra" };
}

export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const { slug } = await params;
  const sp = await searchParams;

  const detail = await getProductDetail(slug);
  if (!detail) notFound();

  const maxQty = detail.stock > 0 ? Math.min(detail.stock, 10) : 1;
  const requested = Number.parseInt(sp.qty ?? "1", 10) || 1;
  const qty = Math.min(Math.max(requested, 1), maxQty);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-muted">
        <Link className="hover:text-accent hover:underline" href="/">
          Home
        </Link>
        <span aria-hidden="true"> / </span>
        <Link className="hover:text-accent hover:underline" href={`/c/${detail.navGroupSlug}`}>
          {detail.navGroupName}
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-ink">{detail.title}</span>
      </nav>

      <div className="grid gap-8 md:grid-cols-2">
        <Gallery images={detail.images} title={detail.title} />

        <div>
          {detail.brand && <p className="mb-1 text-sm text-ink-muted">{detail.brand}</p>}
          <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">{detail.title}</h1>
          <RatingStars avg={detail.ratingAvg} count={detail.ratingCount} />

          <div className="mt-6">
            <BuyBox
              discountPct={detail.discountPct}
              priceCents={detail.priceCents}
              qty={qty}
              slug={detail.slug}
              stock={detail.stock}
            />
          </div>

          <section aria-label="Description" className="mt-8">
            <h2 className="mb-2 font-display text-lg font-semibold text-ink">Description</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-ink-muted">
              {detail.description}
            </p>
          </section>
        </div>
      </div>

      {detail.related.length > 0 && (
        <section aria-label="Related products" className="mt-12">
          <h2 className="mb-4 font-display text-xl font-semibold text-ink">Related products</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {detail.related.map((product) => (
              <ProductCard key={product.slug} product={product} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
