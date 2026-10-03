import Link from "next/link";
import type { ProductCardData } from "@/lib/shop";
import { getHomeData } from "@/lib/shop";
import { FREE_SHIPPING_CENTS } from "@/lib/pricing";
import { formatCents } from "@/lib/money";
import { NavGroupGrid } from "@/components/shop/NavGroupGrid";
import { ProductCard } from "@/components/shop/ProductCard";
import { getUser } from "@/lib/supabase/getUser";

// Trust copy is grounded in real rules: free-ship threshold comes from the
// pricing module; totals are always shown before checkout (cart breakdown);
// cancel-while-placed is spec §orders policy (Slice 7).
const TRUST_ITEMS = [
  {
    title: `Free shipping over ${formatCents(FREE_SHIPPING_CENTS)}`,
    body: "Reach the threshold and standard shipping is on us.",
  },
  {
    title: "Total before checkout",
    body: "Tax and shipping are shown up front in your cart — no surprises at the end.",
  },
  {
    title: "Cancel before it ships",
    body: "Changed your mind? Cancel any order while it is still being prepared.",
  },
];

interface RailProps {
  title: string;
  href: string;
  items: ProductCardData[];
  signedIn: boolean;
}

function Rail({ title, href, items, signedIn }: RailProps) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title} className="mb-10">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
        <Link
          className="shrink-0 text-sm font-semibold text-accent hover:underline focus:outline-2 focus:outline-accent"
          href={href}
        >
          See all →
        </Link>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {items.map((product) => (
          <div className="w-44 shrink-0" key={product.slug}>
            <ProductCard product={product} signedIn={signedIn} />
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function HomePage() {
  const { groupTiles, topRated, deals, groupRails } = await getHomeData();
  const user = await getUser();
  const signedIn = user !== null;
  const hasProducts = topRated.length > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Typographic hero */}
      <header className="mb-8 rounded-3xl border border-line bg-paper px-6 py-12 sm:px-10 sm:py-16">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-accent">Vendra</p>
        <h1 className="max-w-2xl font-display text-4xl font-semibold leading-tight text-ink sm:text-5xl">
          What you see is what you pay.
        </h1>
        <p className="mt-4 max-w-prose text-ink-muted">
          Real prices, real stock, and the full total before checkout — no surprises, ever.
        </p>
        <Link
          className="mt-6 inline-block rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:opacity-90 focus:outline-2 focus:outline-accent"
          href="#shop-by-category"
        >
          Browse categories
        </Link>
      </header>

      {/* Trust strip */}
      <section aria-label="Why shop here" className="mb-10">
        <ul className="grid gap-4 sm:grid-cols-3">
          {TRUST_ITEMS.map((item) => (
            <li className="rounded-2xl border border-line bg-surface p-4" key={item.title}>
              <p className="font-display text-base font-semibold text-ink">{item.title}</p>
              <p className="mt-1 text-sm text-ink-muted">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Shop by category" className="mb-10" id="shop-by-category">
        <h2 className="mb-4 font-display text-xl font-semibold text-ink">Shop by category</h2>
        {groupTiles.length === 0 ? (
          <p className="rounded-2xl border border-line bg-paper p-6 text-ink-muted">
            No categories yet — the catalogue is empty.
          </p>
        ) : (
          <NavGroupGrid tiles={groupTiles} />
        )}
      </section>

      {hasProducts ? (
        <>
          <Rail title="Top rated" href="/search?sort=rating" items={topRated} signedIn={signedIn} />
          <Rail title="Deals" href="/search?deals=1" items={deals} signedIn={signedIn} />
          {groupRails.map((rail) => (
            <Rail
              href={`/c/${rail.slug}`}
              items={rail.items}
              key={rail.slug}
              signedIn={signedIn}
              title={`Top rated in ${rail.name}`}
            />
          ))}
        </>
      ) : (
        <section aria-label="Products">
          <h2 className="mb-4 font-display text-xl font-semibold text-ink">Popular right now</h2>
          <p className="rounded-2xl border border-line bg-paper p-6 text-ink-muted">
            No products yet — check back soon.
          </p>
        </section>
      )}
    </div>
  );
}
