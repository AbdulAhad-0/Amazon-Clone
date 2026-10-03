"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelOrder } from "@/app/(account)/orders/[id]/actions";

interface CancelButtonProps {
  orderId: string;
}

// Visible only while the derived status is placed (page enforces that).
// Inline confirm — no browser dialog; server re-checks everything anyway.
export function CancelButton({ orderId }: CancelButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm(): void {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelOrder(orderId);
      if (res.ok) {
        setConfirming(false);
        router.refresh();
      } else if (res.error === "SHIPPED") {
        setError("This order has already shipped.");
      } else if (res.error === "FORBIDDEN") {
        setError("This order can no longer be cancelled.");
      } else if (res.error === "AUTH") {
        setError("Please sign in again.");
      } else {
        setError("Something went wrong. Nothing changed — try again.");
      }
    });
  }

  if (!confirming) {
    return (
      <div>
        <button
          type="button"
          className="min-h-11 rounded-full border border-line bg-white px-5 py-2 text-sm font-semibold text-ink hover:border-danger hover:text-danger focus:outline-2 focus:outline-accent"
          onClick={() => setConfirming(true)}
        >
          Cancel order
        </button>
        {error && (
          <p role="alert" className="mt-2 text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      aria-label="Confirm cancellation"
      className="rounded-2xl border border-danger/40 bg-white p-4"
    >
      <p className="text-sm font-semibold text-ink">Cancel this order?</p>
      <p className="mt-1 text-xs text-ink-muted">
        Stock is restored right away and the payment is refunded (demo).
      </p>
      <div aria-live="polite" className="mt-3 flex gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={confirm}
          className="min-h-11 rounded-full bg-danger px-5 py-2 text-sm font-semibold text-white hover:opacity-90 focus:outline-2 focus:outline-accent disabled:opacity-60"
        >
          {pending ? "Cancelling…" : "Yes, cancel it"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirming(false)}
          className="min-h-11 rounded-full border border-line px-5 py-2 text-sm font-semibold text-ink hover:border-accent hover:text-accent focus:outline-2 focus:outline-accent disabled:opacity-60"
        >
          Keep order
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
