// Derived order status — TypeScript mirror of SQL order_effective_status
// (0007). PostgREST cannot call a function inside a select list, so the UI
// derives from the same server timestamps; cancel_order re-checks in SQL.

export type DerivedStatus = "placed" | "shipped" | "delivered" | "cancelled";

export interface OrderRow {
  id: string;
  user_id: string;
  status: "placed" | "shipped" | "delivered" | "cancelled";
  created_at: string;
  ships_at: string;
  delivered_at: string;
  cancelled_at: string | null;
  subtotal_cents: number;
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
  ship_address: Record<string, string | null>;
}

export function effectiveStatus(o: OrderRow, now: Date = new Date()): DerivedStatus {
  if (o.status === "cancelled") return "cancelled";
  if (now.getTime() >= new Date(o.delivered_at).getTime()) return "delivered";
  if (now.getTime() >= new Date(o.ships_at).getTime()) return "shipped";
  return "placed";
}

export const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "progress", label: "In progress" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
] as const;

export type StatusTab = (typeof STATUS_TABS)[number]["key"];

export function matchesTab(tab: StatusTab, s: DerivedStatus): boolean {
  if (tab === "all") return true;
  if (tab === "progress") return s === "placed" || s === "shipped";
  if (tab === "delivered") return s === "delivered";
  return s === "cancelled";
}
