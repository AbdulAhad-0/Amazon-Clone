"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatCents } from "@/lib/money";
import {
  buildSearchUrl,
  dollarsToCents,
  SORT_VALUES,
  type ParsedSearchParams,
} from "@/lib/search";

export interface FilterContext {
  parsed: ParsedSearchParams;
  groups: { slug: string; name: string }[];
  brands: string[];
}

export const SORT_LABELS: Record<string, string> = {
  relevance: "Relevance",
  price_asc: "Price: Low to High",
  price_desc: "Price: High to Low",
  rating: "Avg. customer rating",
  newest: "Newest arrivals",
};

const RATING_OPTIONS = [
  { value: undefined, label: "Any rating" },
  { value: 4, label: "4 stars & up" },
  { value: 3, label: "3 stars & up" },
] as const;

export function FilterControls({ parsed, groups, brands }: FilterContext) {
  const router = useRouter();

  function update(patch: Partial<ParsedSearchParams>) {
    router.push(buildSearchUrl({ ...parsed, ...patch, page: 1 }), { scroll: false });
  }

  function clearAll() {
    router.push("/search", { scroll: false });
  }

  const knownGroup = groups.some((g) => g.slug === parsed.group);
  const brandOptions = [...new Set([...brands, ...(parsed.brand ? [parsed.brand] : [])])].sort();

  return (
    <div className="space-y-6">
      <div>
        <label className="mb-1 block text-sm font-semibold text-ink" htmlFor="filter-group">
          Category
        </label>
        <select
          className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-2 focus:outline-accent"
          id="filter-group"
          onChange={(e) => update({ group: e.target.value || undefined })}
          value={knownGroup ? (parsed.group ?? "") : ""}
        >
          <option value="">All categories</option>
          {groups.map((g) => (
            <option key={g.slug} value={g.slug}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">Brand</legend>
        <div className="space-y-1.5">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              checked={parsed.brand === undefined}
              className="accent-[var(--accent)]"
              name="filter-brand"
              onChange={() => update({ brand: undefined })}
              type="radio"
            />
            All brands
          </label>
          {brandOptions.map((b) => (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink" key={b}>
              <input
                checked={parsed.brand === b}
                className="accent-[var(--accent)]"
                name="filter-brand"
                onChange={() => update({ brand: b })}
                type="radio"
              />
              {b}
            </label>
          ))}
        </div>
      </fieldset>

      <PriceInputs parsed={parsed} onUpdate={update} />

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">Rating</legend>
        <div className="space-y-1.5">
          {RATING_OPTIONS.map((opt) => (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink" key={String(opt.value)}>
              <input
                checked={parsed.rating === opt.value}
                className="accent-[var(--accent)]"
                name="filter-rating"
                onChange={() => update({ rating: opt.value })}
                type="radio"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label className="mb-1 block text-sm font-semibold text-ink" htmlFor="filter-sort">
          Sort by
        </label>
        <select
          className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-2 focus:outline-accent"
          id="filter-sort"
          onChange={(e) => update({ sort: e.target.value as ParsedSearchParams["sort"] })}
          value={parsed.sort}
        >
          {SORT_VALUES.map((s) => (
            <option key={s} value={s}>
              {SORT_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <button
        className="text-sm font-semibold text-accent hover:underline focus:outline-2 focus:outline-accent"
        onClick={clearAll}
        type="button"
      >
        Clear all filters
      </button>
    </div>
  );
}

interface PriceInputsProps {
  parsed: ParsedSearchParams;
  onUpdate: (patch: Partial<ParsedSearchParams>) => void;
}

function PriceInputs({ parsed, onUpdate }: PriceInputsProps) {
  const toDollars = (cents: number | undefined) =>
    cents === undefined ? "" : (cents / 100).toString();
  const [min, setMin] = useState(toDollars(parsed.minCents));
  const [max, setMax] = useState(toDollars(parsed.maxCents));

  useEffect(() => {
    setMin(toDollars(parsed.minCents));
    setMax(toDollars(parsed.maxCents));
    // sync local inputs whenever URL state changes (chips ×, Back, rail vs sheet)
  }, [parsed.minCents, parsed.maxCents]);

  function commit() {
    onUpdate({ minCents: dollarsToCents(min), maxCents: dollarsToCents(max) });
  }

  const hasRange = parsed.minCents !== undefined || parsed.maxCents !== undefined;

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <span className="block text-sm font-semibold text-ink">Price ($)</span>
      <div className="flex items-center gap-2">
        <input
          aria-label="Minimum price in dollars"
          className="w-full min-w-0 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-2 focus:outline-accent"
          inputMode="decimal"
          min="0"
          onBlur={commit}
          onChange={(e) => setMin(e.target.value)}
          placeholder="Min"
          step="0.01"
          type="number"
          value={min}
        />
        <span aria-hidden="true" className="text-ink-muted">
          –
        </span>
        <input
          aria-label="Maximum price in dollars"
          className="w-full min-w-0 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-2 focus:outline-accent"
          inputMode="decimal"
          min="0"
          onBlur={commit}
          onChange={(e) => setMax(e.target.value)}
          placeholder="Max"
          step="0.01"
          type="number"
          value={max}
        />
      </div>
      {hasRange && (
        <p className="text-xs text-ink-muted">
          {parsed.minCents !== undefined && `Min ${formatCents(parsed.minCents)}`}
          {parsed.minCents !== undefined && parsed.maxCents !== undefined && " · "}
          {parsed.maxCents !== undefined && `Max ${formatCents(parsed.maxCents)}`}
        </p>
      )}
    </form>
  );
}

export function FilterRail(props: FilterContext) {
  return (
    <nav aria-label="Filters" className="rounded-2xl border border-line bg-paper p-4">
      <h2 className="mb-4 font-display text-lg font-semibold text-ink">Filters</h2>
      <FilterControls {...props} />
    </nav>
  );
}
