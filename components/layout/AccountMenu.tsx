"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { signOut } from "@/app/(account)/actions";

interface AccountMenuProps {
  displayName: string;
}

export function AccountMenu({ displayName }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="max-w-[10rem] truncate rounded-full px-3 py-2 text-sm font-semibold text-ink hover:bg-paper focus:outline-2 focus:outline-accent"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        Hello, {displayName}
      </button>

      {open && (
        <div
          aria-label="Account menu"
          className="absolute right-0 top-full z-30 mt-1 w-48 rounded-2xl border border-line bg-white py-1 shadow-lg"
          role="menu"
        >
          <Link
            className="block px-4 py-2 text-sm text-ink hover:bg-paper hover:text-accent focus:outline-2 focus:outline-accent"
            href="/orders"
            onClick={() => setOpen(false)}
            role="menuitem"
          >
            Orders
          </Link>
          <span
            aria-disabled="true"
            className="block px-4 py-2 text-sm text-ink-muted"
            title="Arrives in a later slice"
          >
            Account
          </span>
          <button
            className="w-full px-4 py-2 text-left text-sm font-semibold text-accent hover:bg-paper focus:outline-2 focus:outline-accent disabled:opacity-60"
            disabled={pending}
            onClick={() => {
              setOpen(false);
              startTransition(async () => {
                await signOut();
                router.refresh();
                router.replace("/");
              });
            }}
            type="button"
          >
            {pending ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
