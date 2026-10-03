import type { ReviewRow } from "@/lib/reviews";

interface RatingSummaryProps {
  avg: number;
  realCount: number;
  reviews: ReviewRow[];
}

// ADR-022 / owner rule: average always (seed baseline included server-side);
// the COUNT and histogram only appear once REAL reviews exist — never the
// fake seed count.
export function RatingSummary({ avg, realCount, reviews }: RatingSummaryProps) {
  const hasReal = realCount > 0;
  const buckets = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    n: reviews.filter((r) => r.rating === stars).length,
  }));

  return (
    <div className="rounded-2xl border border-line bg-paper p-5">
      <div className="flex items-center gap-4">
        <p className="font-display text-4xl font-semibold text-ink">{avg.toFixed(1)}</p>
        <div>
          <span aria-hidden="true" className="text-accent">
            {"★".repeat(Math.round(avg * 2) / 2)}
            {"☆".repeat(5 - Math.round(avg * 2) / 2)}
          </span>
          {hasReal ? (
            <p className="text-xs text-ink-muted">
              {realCount} {realCount === 1 ? "review" : "reviews"} from verified buyers
            </p>
          ) : (
            <p className="text-xs text-ink-muted">Average rating — no reviews yet</p>
          )}
        </div>
      </div>

      {hasReal && (
        <ul aria-label="Rating histogram" className="mt-4 space-y-1.5">
          {buckets.map((b) => (
            <li key={b.stars} className="flex items-center gap-2 text-xs text-ink-muted">
              <span className="w-6 shrink-0">{b.stars}★</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${realCount > 0 ? Math.round((b.n / realCount) * 100) : 0}%` }}
                />
              </span>
              <span className="w-6 shrink-0 text-right">{b.n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
