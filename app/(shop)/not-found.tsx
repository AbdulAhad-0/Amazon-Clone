import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 text-center">
      <p className="font-display text-6xl font-semibold text-accent">404</p>
      <h1 className="mt-3 font-display text-3xl font-semibold text-ink">Page not found</h1>
      <p className="mt-2 text-ink-muted">We couldn&apos;t find that page — it may have moved or never existed.</p>
      <Link
        className="mt-6 inline-block rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 focus:outline-2 focus:outline-accent"
        href="/"
      >
        Back to home
      </Link>
    </div>
  );
}
