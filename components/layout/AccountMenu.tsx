"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/(account)/actions";

interface AccountMenuProps {
  displayName: string;
}

export function AccountMenu({ displayName }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
          <span
            aria-disabled="true"
            className="block px-4 py-2 text-sm text-ink-muted"
            title="Arrives in a later slice"
          >
            Orders
          </span>
          <span
            aria-disabled="true"
            className="block px-4 py-2 text-sm text-ink-muted"
            title="Arrives in a later slice"
          >
            Account
          </span>
          <form action={signOut}>
            <button
              className="w-full px-4 py-2 text-left text-sm font-semibold text-accent hover:bg-paper focus:outline-2 focus:outline-accent"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
