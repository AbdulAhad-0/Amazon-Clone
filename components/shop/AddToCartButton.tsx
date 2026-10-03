"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addToCartAction } from "@/app/(shop)/cart/actions";
import { addGuestLine } from "@/lib/guestCart";
import { showToast } from "@/lib/toast";

interface AddToCartButtonProps {
  productId: string;
  slug: string;
  qty: number;
  stock?: number;
  signedIn: boolean;
  compact?: boolean;
}

export function AddToCartButton({
  productId,
  slug,
  qty,
  stock,
  signedIn,
  compact = false,
}: AddToCartButtonProps) {
  const outOfStock = stock !== undefined && stock <= 0;
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);
  const router = useRouter();

  function confirmAdded() {
    showToast("Added", { href: "/cart", label: "View cart" });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2000);
  }

  function handleAdd() {
    startTransition(async () => {
      if (!signedIn) {
        addGuestLine(productId, qty);
        confirmAdded();
        return;
      }
      const res = await addToCartAction(productId, qty);
      if (res.ok) {
        confirmAdded();
        router.refresh();
      } else if (res.error === "STOCK") {
        showToast(
          res.available !== undefined && res.available > 0
            ? `Only ${res.available} left`
            : "Out of stock",
        );
      } else if (res.error === "AUTH") {
        router.push(`/signin?next=/p/${slug}`);
      } else {
        showToast("Something went wrong. Please try again.");
      }
    });
  }

  const className = compact
    ? "w-full rounded-full border border-line bg-white px-3 py-2 text-xs font-semibold text-ink hover:border-accent hover:text-accent focus:outline-2 focus:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
    : "w-full rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:opacity-90 focus:outline-2 focus:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

  const label = outOfStock
    ? "Out of stock"
    : pending
      ? "Adding…"
      : added
        ? "Added ✓"
        : "Add to cart";

  return (
    <button
      className={className}
      disabled={outOfStock || pending}
      onClick={handleAdd}
      type="button"
    >
      {label}
    </button>
  );
}
