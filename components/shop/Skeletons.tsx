export function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-line bg-paper p-3">
      <div className="aspect-square w-full rounded-xl bg-line" />
      <div className="mt-3 h-3 w-2/3 rounded bg-line" />
      <div className="mt-2 h-3 w-1/3 rounded bg-line" />
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <div className="h-10 w-2/3 animate-pulse rounded bg-line" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div className="animate-pulse rounded-2xl border border-line bg-paper" key={i}>
            <div className="aspect-[4/3] w-full rounded-t-2xl bg-line" />
            <div className="m-3 h-4 w-1/2 rounded bg-line" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function CategorySkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="h-8 w-1/3 animate-pulse rounded bg-line" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function PdpSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="aspect-square w-full animate-pulse rounded-2xl bg-line" />
        <div className="space-y-4">
          <div className="h-6 w-3/4 animate-pulse rounded bg-line" />
          <div className="h-8 w-1/3 animate-pulse rounded bg-line" />
          <div className="h-24 w-full animate-pulse rounded bg-line" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
