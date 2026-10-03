export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8" aria-busy="true" aria-label="Loading deals">
      <div className="h-8 w-48 animate-pulse rounded bg-line" />
      <div className="mt-4 h-4 w-28 animate-pulse rounded bg-line" />
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div className="rounded-2xl border border-line bg-paper p-3" key={i}>
            <div className="aspect-square w-full animate-pulse rounded-xl bg-line" />
            <div className="mt-3 h-3 w-16 animate-pulse rounded bg-line" />
            <div className="mt-2 h-4 w-full animate-pulse rounded bg-line" />
            <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-line" />
            <div className="mt-4 h-9 w-full animate-pulse rounded-full bg-line" />
          </div>
        ))}
      </div>
    </div>
  );
}
