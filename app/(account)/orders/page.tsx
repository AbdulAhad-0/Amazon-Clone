import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/getUser";
import { effectiveStatus, matchesTab, STATUS_TABS, type OrderRow, type StatusTab } from "@/lib/orders";
import { OrderCard } from "@/components/orders/OrderCard";

export const metadata: Metadata = { title: "Your Orders · Vendra" };

type OrderWithItems = OrderRow & {
  order_items: {
    id: string;
    title_snapshot: string;
    qty: number;
    product_id: string;
    products: { product_images: { url: string; position: number }[] } | null;
  }[];
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/signin?next=/orders");

  const { status } = await searchParams;
  const tab: StatusTab = STATUS_TABS.some((t) => t.key === status)
    ? (status as StatusTab)
    : "all";

  const supabase = await createClient();
  const res = await supabase
    .from("orders")
    .select(
      "id, user_id, status, created_at, ships_at, delivered_at, cancelled_at, subtotal_cents, shipping_cents, tax_cents, total_cents, ship_address, order_items(id, title_snapshot, qty, product_id, products(product_images(url, position)))",
    )
    .order("created_at", { ascending: false });
  if (res.error) throw new Error(`orders: ${res.error.message}`);

  const all = (res.data ?? []) as unknown as OrderWithItems[];
  const visible = all.filter((o) => matchesTab(tab, effectiveStatus(o)));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 font-display text-3xl font-semibold text-ink">Your Orders</h1>

      <nav aria-label="Order status filters" className="mb-6 flex flex-wrap gap-2">
        {STATUS_TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "all" ? "/orders" : `/orders?status=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold focus:outline-2 focus:outline-accent ${
              tab === t.key
                ? "border-accent bg-accent text-white"
                : "border-line bg-white text-ink hover:border-accent hover:text-accent"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {all.length === 0 ? (
        <div className="rounded-2xl border border-line bg-paper p-8 text-center">
          <p className="font-display text-lg text-ink">No orders yet</p>
          <p className="mt-1 text-sm text-ink-muted">When you place an order, it shows up here.</p>
          <Link
            className="mt-4 inline-block min-h-11 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:opacity-90 focus:outline-2 focus:outline-accent"
            href="/c/electronics"
          >
            Start browsing
          </Link>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-line bg-paper p-8 text-center">
          <p className="text-ink">No orders match this filter.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((o) => (
            <OrderCard key={o.id} order={o} items={o.order_items} />
          ))}
        </div>
      )}
    </div>
  );
}
