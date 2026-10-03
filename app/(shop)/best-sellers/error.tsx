"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 text-center">
      <h1 className="font-display text-2xl font-semibold text-ink">
        We couldn&rsquo;t load best sellers
      </h1>
      <p className="mt-2 text-sm text-ink-muted">
        Something went wrong on our side — nothing is broken with your cart.
      </p>
      <button
        className="mt-6 inline-flex min-h-11 items-center rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 focus:outline-2 focus:outline-accent"
        onClick={() => reset()}
        type="button"
      >
        Try again
      </button>
    </div>
  );
}
