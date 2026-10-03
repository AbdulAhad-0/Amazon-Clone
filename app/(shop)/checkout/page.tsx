import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cartTotals, getCartLines } from "@/lib/cart";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/getUser";
import { CheckoutClient } from "@/components/checkout/CheckoutClient";
import { OrderSummary } from "@/components/checkout/OrderSummary";
import type { ShipAddress } from "@/app/(shop)/checkout/actions";

export const metadata: Metadata = { title: "Checkout · Vendra" };

export default async function CheckoutPage() {
  const user = await getUser();
  if (!user) redirect("/signin?next=/checkout");

  const supabase = await createClient();
  const lines = await getCartLines(supabase);
  const totals = cartTotals(lines);
  const itemCount = lines.reduce((sum, l) => sum + l.qty, 0);

  const saved = await supabase
    .from("addresses")
    .select("full_name, phone, line1, line2, city, state, zip, country")
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  const initial: ShipAddress | null = saved.data
    ? {
        fullName: saved.data.full_name,
        phone: saved.data.phone,
        line1: saved.data.line1,
        line2: saved.data.line2 ?? "",
        city: saved.data.city,
        state: saved.data.state,
        zip: saved.data.zip,
        country: saved.data.country,
      }
    : null;

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
          <CheckoutClient totalCents={totals.totalCents} initial={initial} />
          <OrderSummary totals={totals} itemCount={itemCount} />
        </div>
      )}
    </div>
  );
}
