"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Group {
  slug: string;
  name: string;
}

const LINKS = [
  { href: "/deals", label: "Today's Deals" },
  { href: "/best-sellers", label: "Best Sellers" },
];

// Second header row: All categories disclosure + quick links. 44px targets,
// horizontally scrollable on phones (native scrollbar hidden), active state.
export function QuickLinksRow({ groups }: { groups: Group[] }) {
  const pathname = usePathname();

  return (
    <div className="border-t border-line bg-surface">
      <nav
        aria-label="Quick links"
        className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <details className="relative shrink-0">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-lg px-3 text-sm font-medium text-ink hover:bg-paper focus:outline-2 focus:outline-accent [&::-webkit-details-marker]:hidden">
            All categories <span aria-hidden="true">▾</span>
          </summary>
          <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-xl border border-line bg-surface p-2 shadow-md">
            {groups.map((g) => (
              <Link
                className="flex min-h-11 items-center rounded-lg px-3 text-sm text-ink hover:bg-paper focus:outline-2 focus:outline-accent"
                href={`/c/${g.slug}`}
                key={g.slug}
              >
                {g.name}
              </Link>
            ))}
          </div>
        </details>
        {LINKS.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-medium focus:outline-2 focus:outline-accent ${
                active ? "bg-accent/10 text-accent" : "text-ink hover:bg-paper"
              }`}
              href={l.href}
              key={l.href}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
