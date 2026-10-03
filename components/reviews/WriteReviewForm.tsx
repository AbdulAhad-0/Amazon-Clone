"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface WriteReviewFormProps {
  productId: string;
  slug: string;
  eligibility: "eligible" | "signed_out" | "ineligible" | "already";
}

const MESSAGES: Record<string, string> = {
  NOT_BUYER: "Only verified buyers can review this product.",
  DUPLICATE: "You've already reviewed this product.",
  VALIDATION: "Pick a star rating and write a short review (max 2000 characters).",
  SERVER: "Something went wrong posting your review — please try again.",
};

export function WriteReviewForm({ productId, slug, eligibility }: WriteReviewFormProps) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (eligibility === "signed_out") {
    return (
      <div className="rounded-2xl border border-line bg-paper p-5 text-sm text-ink-muted">
        <Link className="font-semibold text-accent hover:underline" href={`/signin?next=/p/${slug}`}>
          Sign in
        </Link>{" "}
        to review this product.
      </div>
    );
  }
  if (eligibility === "ineligible") {
    return (
      <p className="rounded-2xl border border-line bg-paper p-5 text-sm text-ink-muted">
        Only verified buyers can review this product.
      </p>
    );
  }
  if (eligibility === "already") {
    return (
      <p className="rounded-2xl border border-line bg-paper p-5 text-sm text-ink-muted">
        You've already reviewed this product — thanks!
      </p>
    );
  }

  function submit(): void {
    if (pending) return;
    setError(null);
    if (rating < 1 || text.trim().length === 0) {
      setError(MESSAGES.VALIDATION);
      return;
    }
    setPending(true);
    void (async () => {
      try {
        const res = await fetch("/api/reviews", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ productId, rating, body: text.trim() }),
        });
        if (res.status === 201) {
          setText("");
          setRating(0);
          router.refresh();
          return;
        }
        const body = (await res.json().catch(() => ({}))) as { code?: string };
        setError(MESSAGES[body.code ?? "SERVER"] ?? MESSAGES.SERVER);
      } catch {
        setError(MESSAGES.SERVER);
      } finally {
        setPending(false);
      }
    })();
  }

  return (
    <div className="rounded-2xl border border-line bg-paper p-5">
      <h3 className="mb-3 font-display text-base font-semibold text-ink">Write a review</h3>
      <div className="mb-3 flex items-center gap-1" role="radiogroup" aria-label="Star rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className="p-1 text-2xl leading-none focus:outline-2 focus:outline-accent"
            style={{ color: (hovered || rating) >= n ? "var(--accent)" : "var(--line)" }}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => setRating(n)}
          >
            ★
          </button>
        ))}
      </div>
      <label className="block">
        <span className="sr-only">Your review</span>
        <textarea
          className="min-h-24 w-full rounded-xl border border-line bg-white p-3 text-sm text-ink placeholder:text-ink-muted focus:outline-2 focus:outline-accent"
          maxLength={2000}
          placeholder="What did you like or dislike?"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div aria-live="polite" className="min-h-6">
        {error && (
          <p role="alert" className="mt-2 text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={submit}
        className="mt-2 min-h-11 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 focus:outline-2 focus:outline-accent disabled:opacity-60"
      >
        {pending ? "Posting…" : "Post review"}
      </button>
    </div>
  );
}
