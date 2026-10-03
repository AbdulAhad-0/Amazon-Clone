export default function CartLoading() {
  return (
    <div aria-busy="true" className="mx-auto max-w-6xl px-4 py-8">
      <p className="sr-only">Loading your cart…</p>
      <div className="mb-6 h-8 w-56 animate-pulse rounded bg-line" />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div className="flex gap-4 rounded-2xl border border-line bg-paper p-4" key={i}>
              <div className="h-24 w-24 animate-pulse rounded-xl bg-line" />
              <div className="flex-1 space-y-3 py-2">
                <div className="h-4 w-2/3 animate-pulse rounded bg-line" />
                <div className="h-4 w-1/3 animate-pulse rounded bg-line" />
              </div>
            </div>
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-2xl border border-line bg-paper" />
      </div>
    </div>
  );
}
