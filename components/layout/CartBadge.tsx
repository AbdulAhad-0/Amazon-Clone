"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { mergeGuestCartAction } from "@/app/(shop)/cart/actions";
import {
  GUEST_CART_EVENT,
  clearGuestCart,
  getPendingMergeId,
  guestCartCount,
  readGuestCart,
} from "@/lib/guestCart";

interface CartBadgeProps {
  signedIn: boolean;
  count: number;
}

function CartIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
    >
      <path d="M5.5 7.5h13l-1.1 11.2a1.5 1.5 0 0 1-1.5 1.3H8.1a1.5 1.5 0 0 1-1.5-1.3L5.5 7.5Z" />
      <path d="M9 7.5a3 3 0 0 1 6 0" />
    </svg>
  );
}

export function CartBadge({ signedIn, count }: CartBadgeProps) {
  const [guestCount, setGuestCount] = useState(0);
  const router = useRouter();

  // Signed-in with guest items in localStorage → one idempotent server merge;
  // storage is cleared only after the server confirms.
  useEffect(() => {
    if (!signedIn) return;
    const items = readGuestCart();
    if (items.length === 0) return;
    const mergeId = getPendingMergeId();
    let cancelled = false;
    void (async () => {
      const res = await mergeGuestCartAction(items, mergeId);
      if (cancelled || !res.ok) return;
      clearGuestCart();
      router.refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, router]);

  useEffect(() => {
    if (signedIn) return;
    const update = () => setGuestCount(guestCartCount());
    const onStorage = (e: StorageEvent) => {
      if (e.key === "vendra.cart" || e.key === null) update();
    };
    update();
    window.addEventListener(GUEST_CART_EVENT, update);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(GUEST_CART_EVENT, update);
      window.removeEventListener("storage", onStorage);
    };
  }, [signedIn]);

  const n = signedIn ? count : guestCount;

  return (
    <Link
      aria-label={n > 0 ? `Cart, ${n} items` : "Cart"}
      className="relative shrink-0 rounded-full p-2 text-ink hover:text-accent focus:outline-2 focus:outline-accent"
      href="/cart"
    >
      <CartIcon />
      {n > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold leading-none text-white"
        >
          {n > 99 ? "99+" : n}
        </span>
      )}
    </Link>
  );
}
