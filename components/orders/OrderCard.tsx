"use client";

import Image from "next/image";
import Link from "next/link";
import { formatCents } from "@/lib/money";
import { effectiveStatus, type DerivedStatus, type OrderRow } from "@/lib/orders";

interface OrderCardProps {
  order: OrderRow;
  items: {
    id: string;
    title_snapshot: string;
    qty: number;
    product_id: string;
    products: { product_images: { url: string; position: number }[] } | null;
  }[];
}

export const STATUS_LABEL: Record<DerivedStatus, string> = {
  placed: "Placed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const STATUS_CLASS: Record<DerivedStatus, string> = {
  placed: "border-accent/40 bg-accent/10 text-accent",
  shipped: "border-amber-600/40 bg-amber-100 text-amber-800",
  delivered: "border-green-700/40 bg-green-100 text-green-800",
  cancelled: "border-danger/40 bg-danger/10 text-danger",
};

export function OrderCard({ order, items }: OrderCardProps) {
  const status = effectiveStatus(order);
  const shortId = order.id.slice(0, 8).toUpperCase();
  const thumbs = items
    .flatMap((i) => i.products?.product_images ?? [])
    .sort((a, b) => a.position - b.position)
    .slice(0, 4);

  return (
    <Link
      href={`/orders/${order.id}`}
      className="block rounded-2xl border border-line bg-paper p-5 transition hover:border-accent focus:outline-2 focus:outline-accent"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-sm font-semibold text-ink">Order {shortId}…</p>
          <p className="text-xs text-ink-muted">
            {new Date(order.created_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_CLASS[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex gap-2">
          {thumbs.map((img) => (
            <span key={img.url} className="relative h-10 w-10 overflow-hidden rounded-lg border border-line bg-white">
              <Image alt="" fill sizes="40px" src={img.url} />
            </span>
          ))}
        </div>
        <p className="text-sm font-semibold text-ink">{formatCents(order.total_cents)}</p>
      </div>
    </Link>
  );
}
