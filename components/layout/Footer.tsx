import Link from "next/link";

// Only pages that exist right now (Slice 10 Part 1): /deals and
// /best-sellers get footer links once those routes are built.
const columns = [
  {
    heading: "Shop",
    links: [
      { href: "/search", label: "Search" },
      { href: "/search?deals=1", label: "Today's Deals" },
      { href: "/search?sort=rating", label: "Best Sellers" },
    ],
  },
  {
    heading: "Account",
    links: [
      { href: "/signin", label: "Sign in" },
      { href: "/cart", label: "Cart" },
      { href: "/orders", label: "Orders" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:grid-cols-3">
        {columns.map((col) => (
          <nav aria-label={col.heading} key={col.heading}>
            <h2 className="mb-2 font-display text-sm font-semibold uppercase tracking-widest text-ink">
              {col.heading}
            </h2>
            <ul className="space-y-1 text-sm">
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link
                    className="inline-flex min-h-11 items-center text-ink underline-offset-4 hover:text-accent hover:underline focus:outline-2 focus:outline-accent"
                    href={link.href}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <p className="text-sm text-ink-muted sm:col-span-1">
          Demo project — not a real store. Not affiliated with any retailer. Prices in USD with
          tax estimated up front.
        </p>
      </div>
    </footer>
  );
}
