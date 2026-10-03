import Link from "next/link";
import type { ReactElement } from "react";

function CartIcon(): ReactElement {
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

export function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link className="shrink-0" href="/">
          <span className="font-display text-2xl font-semibold tracking-tight text-ink">
            vendra
          </span>
          <span aria-hidden="true" className="mt-0.5 block h-0.5 w-full bg-accent" />
        </Link>
        <input
          aria-label="Search products"
          className="min-w-0 flex-1 rounded-full border border-line bg-paper px-4 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-2 focus:outline-accent"
          placeholder="Search products"
          type="search"
        />
        <Link
          aria-label="Cart"
          className="shrink-0 rounded-full p-2 text-ink hover:bg-paper focus:outline-2 focus:outline-accent"
          href="/cart"
        >
          <CartIcon />
        </Link>
      </div>
    </header>
  );
}
