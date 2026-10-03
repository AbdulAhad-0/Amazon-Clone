import Link from "next/link";
import { Suspense } from "react";
import type { ReactElement } from "react";
import { getCartCount } from "@/lib/cart";
import { getUser } from "@/lib/supabase/getUser";
import { createClient } from "@/lib/supabase/server";
import { AccountMenu } from "./AccountMenu";
import { CartBadge } from "./CartBadge";
import { QuickLinksRow } from "./QuickLinksRow";
import { SearchSuggest } from "./SearchSuggest";

// Per-request session read (cookies) — never prerendered into the static
// shell, never cached server-side. Streams in behind Suspense on every
// navigation (Next.js docs: authentication with cacheComponents).
async function UserSlot(): Promise<ReactElement> {
  const user = await getUser();
  if (!user) {
    return (
      <>
        <Link
          className="shrink-0 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-accent hover:text-accent focus:outline-2 focus:outline-accent"
          href="/signin"
        >
          Sign in
        </Link>
        <CartBadge count={0} signedIn={false} />
      </>
    );
  }
  const supabase = await createClient();
  const count = await getCartCount(supabase, user.id);
  return (
    <>
      <AccountMenu displayName={user.displayName} />
      <CartBadge count={count} signedIn />
    </>
  );
}

export async function Header(): Promise<ReactElement> {
  const supabase = await createClient();
  const groupsRes = await supabase.from("nav_groups").select("slug, name").order("sort_order");
  const groups = groupsRes.data ?? [];

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
            <>
              <span
                aria-hidden="true"
                className="ms-auto h-9 w-24 shrink-0 rounded-full border border-line bg-white"
              />
              <span
                aria-hidden="true"
                className="h-10 w-10 shrink-0 rounded-full border border-line bg-white"
              />
            </>
          }
        >
          <UserSlot />
        </Suspense>
      </div>
      <QuickLinksRow groups={groups} />
    </header>
  );
}
