import Link from "next/link";
import { CartClient } from "@/components/shop/CartClient";
import { GuestCart } from "@/components/shop/GuestCart";
import { cartTotals, getCartLines } from "@/lib/cart";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/getUser";

export const metadata = { title: "Shopping cart · Vendra" };

export default async function CartPage() {
  const user = await getUser();

  let itemCount = 0;
  let initial: { lines: Awaited<ReturnType<typeof getCartLines>>; totals: ReturnType<typeof cartTotals> } | null = null;
  if (user) {
    const supabase = await createClient();
    const lines = await getCartLines(supabase);
    itemCount = lines.reduce((sum, l) => sum + l.qty, 0);
    initial = { lines, totals: cartTotals(lines) };
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-muted">
        <Link className="hover:text-accent hover:underline" href="/">
          Home
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-ink">Cart</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-3xl font-semibold text-ink">Shopping cart</h1>
        {user && itemCount > 0 && (
          <p className="text-sm text-ink-muted">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </p>
        )}
        {!user && <p className="text-sm text-ink-muted">Guest cart</p>}
      </div>

      {user && initial ? (
        <CartClient initialLines={initial.lines} initialTotals={initial.totals} />
      ) : (
        <GuestCart />
      )}
    </div>
  );
}
