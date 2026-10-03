import Link from "next/link";

const links = [
  { href: "/", label: "Home" },
  { href: "/cart", label: "Cart" },
  { href: "/orders", label: "Orders" },
];

export function Footer() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-6 text-center text-sm text-ink-muted">
        <p>Demo project — not a real store. Not affiliated with any retailer.</p>
        <nav aria-label="Footer" className="mt-3 flex justify-center gap-6">
          {links.map((link) => (
            <Link
              className="text-ink underline-offset-4 hover:text-accent hover:underline focus:outline-2 focus:outline-accent"
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
