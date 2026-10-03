import type { ReviewRow } from "@/lib/reviews";

interface ReviewListProps {
  reviews: ReviewRow[];
  currentUserId?: string | null;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} out of 5`} className="text-sm text-accent">
      {"★".repeat(rating)}
      {"☆".repeat(5 - rating)}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function ReviewList({ reviews, currentUserId }: ReviewListProps) {
  if (reviews.length === 0) {
    return (
      <p className="rounded-2xl border border-line bg-paper p-6 text-sm text-ink-muted">
        No reviews yet — be the first to review this product.
      </p>
    );
  }
  return (
    <ul className="space-y-4">
      {reviews.map((r) => (
        <li key={r.id} className="rounded-2xl border border-line bg-paper p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Stars rating={r.rating} />
              <span className="text-xs font-semibold text-ink-muted">{formatDate(r.created_at)}</span>
            </span>
            <span className="rounded-full border border-green-700/40 bg-green-100 px-2.5 py-0.5 text-[11px] font-semibold text-green-800">
              Verified purchase
            </span>
          </div>
          {currentUserId && r.user_id === currentUserId && (
            <p className="mt-1 text-[11px] font-semibold text-accent">Your review</p>
          )}
          <p className="mt-2 text-sm leading-relaxed text-ink">{r.body}</p>
        </li>
      ))}
    </ul>
  );
}
