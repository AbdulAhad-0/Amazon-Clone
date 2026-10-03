import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/getUser";
import { effectiveStatus, type OrderRow } from "@/lib/orders";
import { CancelButton } from "@/components/orders/CancelButton";
import { STATUS_CLASS, STATUS_LABEL } from "@/components/orders/OrderCard";
import { Timeline } from "@/components/orders/Timeline";

export const metadata: Metadata = { title: "Order detail · Vendra" };

type OrderFull = OrderRow & {
  order_items: {
    id: string;
    title_snapshot: string;
    qty: number;
    unit_price_cents: number;
    product_id: string;
    products: { slug: string; product_images: { url: string; position: number }[] } | null;
  }[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getUser();
  if (!user) redirect(`/signin?next=/orders`);

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  // RLS own-row policy: another user's id returns zero rows -> notFound.
  const res = await supabase
    .from("orders")
    .select(
      "id, user_id, status, created_at, ships_at, delivered_at, cancelled_at, subtotal_cents, shipping_cents, tax_cents, total_cents, ship_address, order_items(id, title_snapshot, qty, unit_price_cents, product_id, products(slug, product_images(url, position)))",
    )
    .eq("id", id)
    .maybeSingle();
  if (res.error) throw new Error(`order: ${res.error.message}`);
  if (!res.data) notFound();

  const order = res.data as unknown as OrderFull;
  const status = effectiveStatus(order);
  const addr = order.ship_address ?? {};

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-ink-muted">
        <Link className="hover:text-accent hover:underline" href="/orders">
          Your Orders
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-ink">Order {order.id.slice(0, 8).toUpperCase()}…</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold text-ink">Order details</h1>
        <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${STATUS_CLASS[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <section aria-label="Items" className="rounded-2xl border border-line bg-paper p-5">
            <h2 className="mb-4 font-display text-lg font-semibold text-ink">Items</h2>
            <ul className="divide-y divide-line">
              {order.order_items.map((item) => {
                const img = [...(item.products?.product_images ?? [])].sort(
                  (a, b) => a.position - b.position,
                )[0];
                return (
                  <li key={item.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-line bg-white">
                      {img && <Image alt="" fill sizes="48px" src={img.url} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      {item.products?.slug ? (
                        <Link
                          className="block truncate text-sm font-medium text-ink hover:text-accent hover:underline"
                          href={`/p/${item.products.slug}`}
                        >
                          {item.title_snapshot}
                        </Link>
                      ) : (
                        <span className="block truncate text-sm font-medium text-ink">{item.title_snapshot}</span>
                      )}
                      <span className="block text-xs text-ink-muted">
                        Qty {item.qty} · {formatCents(item.unit_price_cents)} each
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-ink">
                      {formatCents(item.unit_price_cents * item.qty)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-label="Shipping address" className="rounded-2xl border border-line bg-paper p-5">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Shipping address</h2>
            <address className="text-sm not-italic leading-6 text-ink-muted">
              <span className="block font-semibold text-ink">{String(addr.full_name ?? "")}</span>
              <span className="block">{String(addr.line1 ?? "")}</span>
              {addr.line2 ? <span className="block">{String(addr.line2)}</span> : null}
              <span className="block">
                {String(addr.city ?? "")}, {String(addr.state ?? "")} {String(addr.zip ?? "")}
              </span>
              <span className="block">{String(addr.country ?? "")}</span>
              <span className="block">{String(addr.phone ?? "")}</span>
            </address>
          </section>

          <section aria-label="Timeline" className="rounded-2xl border border-line bg-paper p-5">
            <h2 className="mb-4 font-display text-lg font-semibold text-ink">Timeline</h2>
            <Timeline order={order} />
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-line bg-paper p-5">
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">Summary</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-muted">Subtotal</dt>
                <dd className="text-ink">{formatCents(order.subtotal_cents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Shipping</dt>
                <dd className={order.shipping_cents === 0 ? "font-semibold text-green-700" : "text-ink"}>
                  {order.shipping_cents === 0 ? "FREE" : formatCents(order.shipping_cents)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-muted">Tax (8%)</dt>
                <dd className="text-ink">{formatCents(order.tax_cents)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 font-semibold">
                <dt className="text-ink">Total</dt>
                <dd className="text-ink">{formatCents(order.total_cents)}</dd>
              </div>
            </dl>
          </div>

          {status === "placed" && (
            <div className="rounded-2xl border border-line bg-paper p-5">
              <h2 className="mb-3 font-display text-lg font-semibold text-ink">Changed your mind?</h2>
              <CancelButton orderId={order.id} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
