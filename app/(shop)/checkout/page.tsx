import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cartTotals, getCartLines } from "@/lib/cart";
import { formatCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/getUser";

export const metadata: Metadata = { title: "Checkout · Vendra" };

// Placeholder until Slice 6 ships the real checkout. It exists so the
// sign-in round trip (/signin?next=/checkout) lands somewhere real with the
// cart intact — no fake payment, no dead link.
export default async function CheckoutPage() {
  const user = await getUser();
  if (!user) redirect("/signin?next=/checkout");

  const supabase = await createClient();
  const lines = await getCartLines(supabase);
  const totals = cartTotals(lines);
  const itemCount = lines.reduce((sum, l) => sum + l.qty, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-muted">
        <Link className="hover:text-accent hover:underline" href="/">
          Home
        </Link>
        <span aria-hidden="true"> / </span>
        <Link className="hover:text-accent hover:underline" href="/cart">
          Cart
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-ink">Checkout</span>
      </nav>

      <h1 className="mb-6 font-display text-3xl font-semibold text-ink">Checkout</h1>

      {lines.length === 0 ? (
        <div className="rounded-2xl border border-line bg-paper p-8 text-center">
          <p className="text-ink">Your cart is empty.</p>
          <Link
            className="mt-4 inline-block min-h-11 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:opacity-90 focus:outline-2 focus:outline-accent"
            href="/c/electronics"
          >
            Browse electronics
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="rounded-2xl border border-line bg-paper p-6">
            <p className="text-ink">
              <span className="font-semibold">
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </span>{" "}
              in your cart — total {formatCents(totals.totalCents)}.
            </p>
            <p className="mt-3 text-sm text-ink-muted">
              Payment and delivery arrive in the next slice. Nothing is charged now,
              and your cart is saved exactly as you left it.
            </p>
            <Link
              className="mt-5 inline-block min-h-11 rounded-full border border-line bg-white px-6 py-3 text-sm font-semibold text-ink hover:border-accent hover:text-accent focus:outline-2 focus:outline-accent"
              href="/cart"
            >
              Back to cart
            </Link>
          </div>

          <aside className="rounded-2xl border border-line bg-paper p-5">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Summary</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Subtotal</dt>
                <dd className="text-ink">{formatCents(totals.subtotalCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Estimated shipping</dt>
                <dd className={totals.shippingCents === 0 ? "font-semibold text-green-700" : "text-ink"}>
                  {totals.shippingCents === 0 ? "FREE" : formatCents(totals.shippingCents)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Estimated tax (8%)</dt>
                <dd className="text-ink">{formatCents(totals.taxCents)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 font-semibold">
                <dt className="text-ink">Total</dt>
                <dd className="text-ink">{formatCents(totals.totalCents)}</dd>
              </div>
            </dl>
          </aside>
        </div>
      )}
    </div>
  );
}
