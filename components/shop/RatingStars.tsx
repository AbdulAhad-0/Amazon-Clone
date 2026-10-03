interface RatingStarsProps {
  avg: number;
  count: number;
}

// ADR-022: average stars always; count only when rating_count > 0 (real user
// reviews — Slice 8). Never render the seed's fabricated "3 ratings".
export function RatingStars({ avg, count }: RatingStarsProps) {
  const rounded = Math.round(avg * 2) / 2;
  const stars = Array.from({ length: 5 }, (_, i) => (rounded >= i + 1 ? "★" : "☆")).join("");
  return (
    <p
      aria-label={`Average rating ${avg.toFixed(1)} out of 5${count > 0 ? ` from ${count} reviews` : ""}`}
      className="mt-1 flex items-center gap-1 text-xs text-ink-muted"
    >
      <span aria-hidden="true" className="text-accent">
        {stars}
      </span>
      <span>{avg.toFixed(1)}</span>
      {count > 0 && <span>· {count} reviews</span>}
    </p>
  );
}
