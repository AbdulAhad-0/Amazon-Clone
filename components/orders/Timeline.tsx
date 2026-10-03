"use client";

import { formatCents } from "@/lib/money";
import { effectiveStatus, type DerivedStatus, type OrderRow } from "@/lib/orders";

interface TimelineProps {
  order: OrderRow;
  now?: Date;
}

interface Step {
  key: string;
  label: string;
  at: string;
  reached: boolean;
  cancelled?: boolean;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// placed/cancelled come from timestamps of real server writes; shipped and
// delivered are derived from ships_at/delivered_at — no fabricated events.
export function Timeline({ order, now = new Date() }: TimelineProps) {
  const status: DerivedStatus = effectiveStatus(order, now);
  const cancelled = status === "cancelled";

  const steps: Step[] = [
    { key: "placed", label: "Placed", at: order.created_at, reached: true },
    {
      key: "shipped",
      label: "Shipped",
      at: order.ships_at,
      reached: !cancelled && now.getTime() >= new Date(order.ships_at).getTime(),
    },
    {
      key: "delivered",
      label: "Delivered",
      at: order.delivered_at,
      reached: !cancelled && now.getTime() >= new Date(order.delivered_at).getTime(),
    },
  ];

  const cancelledStep: Step | null = cancelled
    ? { key: "cancelled", label: "Cancelled", at: order.cancelled_at ?? order.created_at, reached: true, cancelled: true }
    : null;

  return (
    <ol aria-label="Order timeline" className="space-y-0">
      {steps.map((step, i) => (
        <li key={step.key} className="relative flex gap-3 pb-6 last:pb-0">
          <span aria-hidden="true" className="relative flex flex-col items-center">
            <span
              className={`z-10 h-3 w-3 rounded-full border-2 ${
                step.reached ? "border-accent bg-accent" : "border-line bg-white"
              }`}
            />
            {i < steps.length - 1 && (
              <span
                className={`absolute top-3 h-full w-0.5 ${
                  steps[i + 1]?.reached ? "bg-accent" : "bg-line"
                }`}
              />
            )}
          </span>
          <span className="-mt-1">
            <span className={`block text-sm font-semibold ${step.reached ? "text-ink" : "text-ink-muted"}`}>
              {step.label}
              {!step.reached && <span className="ml-2 text-xs font-normal text-ink-muted">expected</span>}
            </span>
            <span className="block text-xs text-ink-muted">
              {fmt(step.at)} {step.reached ? "" : "(estimated from demo timing)"}
            </span>
          </span>
        </li>
      ))}
      {cancelledStep && (
        <li className="relative flex gap-3">
          <span aria-hidden="true" className="flex flex-col items-center">
            <span className="z-10 h-3 w-3 rounded-full border-2 border-danger bg-danger" />
          </span>
          <span className="-mt-1">
            <span className="block text-sm font-semibold text-danger">Cancelled</span>
            <span className="block text-xs text-ink-muted">{fmt(cancelledStep.at)}</span>
          </span>
        </li>
      )}
    </ol>
  );
}

export { formatCents };
