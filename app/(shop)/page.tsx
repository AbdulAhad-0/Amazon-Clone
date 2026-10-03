import { NavGroupGrid } from "@/components/shop/NavGroupGrid";
import { ProductCard } from "@/components/shop/ProductCard";
import { getHomeData } from "@/lib/shop";
import { getUser } from "@/lib/supabase/getUser";

export default async function HomePage() {
  const { groupTiles, popular } = await getHomeData();
  const user = await getUser();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <section className="mb-8">
        <h1 className="font-display text-4xl font-semibold text-ink">Welcome to Vendra</h1>
        <p className="mt-3 max-w-prose text-ink-muted">
          A demo storefront. Real photos, sample prices — nothing here is a real store.
        </p>
      </section>

      <section aria-label="Shop by category" className="mb-10">
        <h2 className="mb-4 font-display text-xl font-semibold text-ink">Shop by category</h2>
        {groupTiles.length === 0 ? (
          <p className="rounded-2xl border border-line bg-paper p-6 text-ink-muted">
            No categories yet — the catalogue is empty.
          </p>
        ) : (
          <NavGroupGrid tiles={groupTiles} />
        )}
      </section>

      <section aria-label="Popular right now">
        <h2 className="mb-4 font-display text-xl font-semibold text-ink">Popular right now</h2>
        {popular.length === 0 ? (
          <p className="rounded-2xl border border-line bg-paper p-6 text-ink-muted">
            No products yet — check back soon.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {popular.map((product) => (
              <ProductCard key={product.slug} product={product} signedIn={user !== null} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
