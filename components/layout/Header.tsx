import Link from "next/link";
import { Suspense } from "react";
import type { ReactElement } from "react";
import { getUser } from "@/lib/supabase/getUser";
import { AccountMenu } from "./AccountMenu";
import { SearchSuggest } from "./SearchSuggest";

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

// Per-request session read (cookies) — never prerendered into the static
// shell, never cached server-side. Streams in behind Suspense on every
// navigation (Next.js docs: authentication with cacheComponents).
async function UserSlot(): Promise<ReactElement> {
  const user = await getUser();
  if (!user) {
    return (
      <Link
        className="shrink-0 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-accent hover:text-accent focus:outline-2 focus:outline-accent"
        href="/signin"
      >
        Sign in
      </Link>
    );
  }
  return <AccountMenu displayName={user.displayName} />;
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
        <SearchSuggest />
        <Suspense
          fallback={
            <span
              aria-hidden="true"
              className="h-9 w-24 shrink-0 rounded-full border border-line bg-white"
            />
          }
        >
          <UserSlot />
        </Suspense>
        {/* Not a link until Slice 5 ships /cart — links only to existing pages */}
        <span
          aria-disabled="true"
          className="shrink-0 rounded-full p-2 text-ink-muted"
          title="Cart arrives in a later slice"
        >
          <CartIcon />
        </span>
      </div>
    </header>
  );
}
