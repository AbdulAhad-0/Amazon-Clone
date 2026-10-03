"use client";

export default function ShopError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 text-center">
      <h1 className="font-display text-2xl font-semibold text-ink">Something went wrong</h1>
      <p className="mt-2 text-ink-muted">We couldn&apos;t load this page. Please try again.</p>
      <button
        className="mt-5 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 focus:outline-2 focus:outline-accent"
        onClick={() => reset()}
        type="button"
      >
        Try again
      </button>
    </div>
  );
}
