import Link from "next/link";
import type { ProductCardData } from "@/lib/shop";
import { getHeroData, getHomeData } from "@/lib/shop";
import { FREE_SHIPPING_CENTS } from "@/lib/pricing";
import { formatCents } from "@/lib/money";
import { NavGroupGrid } from "@/components/shop/NavGroupGrid";
import { ProductCard } from "@/components/shop/ProductCard";
import { HeroCarousel, type HeroSlide } from "@/components/home/HeroCarousel";
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
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((product) => (
          <div className="h-full w-44 shrink-0 snap-start" key={product.slug}>
            <ProductCard product={product} signedIn={signedIn} />
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function HomePage() {
  const [{ groupTiles, topRated, deals, groupRails }, hero] = await Promise.all([
    getHomeData(),
    getHeroData(),
  ]);
  const user = await getUser();
  const signedIn = user !== null;
  const hasProducts = topRated.length > 0;

  const slides: HeroSlide[] = [
    {
      eyebrow: "Vendra",
      headline: "What you see is what you pay.",
      sentence: "Real prices, real stock, and the full total before checkout — no surprises, ever.",
      cta: { href: "/#shop-by-category", label: "Browse categories" },
    },
    ...(hero.maxDiscountPct > 0
      ? [
          {
            eyebrow: "Today's deals",
            headline: `Today's deals: up to ${hero.maxDiscountPct}% off`,
            sentence: "Hand-picked markdowns on in-stock products — the discount you see is the discount you get.",
            cta: { href: "/deals", label: "Shop deals" },
          },
        ]
      : []),
    {
      eyebrow: "Free shipping",
      headline: `Free shipping on orders over ${formatCents(FREE_SHIPPING_CENTS)}`,
      sentence: "Reach the threshold and standard shipping is on us — shown up front in your cart.",
      cta: { href: "/search", label: "Start searching" },
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <HeroCarousel images={hero.images} slides={slides} />

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

      <section aria-label="Shop by budget" className="mb-10">
        <h2 className="mb-3 font-display text-xl font-semibold text-ink">Shop by budget</h2>
        <div className="flex flex-wrap gap-3">
          {(
            [
              { label: "Under $25", href: "/search?max=25" },
              { label: "$25–$50", href: "/search?min=25&max=50" },
              { label: "$50–$100", href: "/search?min=50&max=100" },
              { label: "$100+", href: "/search?min=100" },
            ] as const
          ).map((chip) => (
            <Link
              className="inline-flex min-h-11 items-center rounded-full border border-line bg-paper px-5 text-sm font-medium text-ink hover:bg-surface focus:outline-2 focus:outline-accent"
              href={chip.href}
              key={chip.href}
            >
              {chip.label}
            </Link>
          ))}
        </div>
      </section>

      {hasProducts ? (
        <>
          <Rail title="Top rated" href="/search?sort=rating" items={topRated} signedIn={signedIn} />
          <Rail title="Deals" href="/deals" items={deals} signedIn={signedIn} />
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
