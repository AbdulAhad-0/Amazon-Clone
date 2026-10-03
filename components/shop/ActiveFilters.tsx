"use client";

import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";
import { buildSearchUrl, type ParsedSearchParams } from "@/lib/search";
import { SORT_LABELS } from "./FilterRail";

interface ActiveFiltersProps {
  parsed: ParsedSearchParams;
  groups: { slug: string; name: string }[];
}

interface Chip {
  key: string;
  label: string;
  remove: Partial<ParsedSearchParams>;
}

export function ActiveFilters({ parsed, groups }: ActiveFiltersProps) {
  const router = useRouter();

  const chips: Chip[] = [];
  if (parsed.q !== undefined) chips.push({ key: "q", label: `“${parsed.q}”`, remove: { q: undefined } });
  if (parsed.group !== undefined) {
    const name = groups.find((g) => g.slug === parsed.group)?.name ?? parsed.group;
    chips.push({ key: "group", label: name, remove: { group: undefined } });
  }
  if (parsed.brand !== undefined) chips.push({ key: "brand", label: parsed.brand, remove: { brand: undefined } });
  if (parsed.minCents !== undefined)
    chips.push({ key: "min", label: `Min ${formatCents(parsed.minCents)}`, remove: { minCents: undefined } });
  if (parsed.maxCents !== undefined)
    chips.push({ key: "max", label: `Max ${formatCents(parsed.maxCents)}`, remove: { maxCents: undefined } });
  if (parsed.rating !== undefined)
    chips.push({ key: "rating", label: `${parsed.rating} stars & up`, remove: { rating: undefined } });
  if (parsed.sort !== "relevance")
    chips.push({ key: "sort", label: SORT_LABELS[parsed.sort] ?? parsed.sort, remove: { sort: "relevance" } });

  if (chips.length === 0) return null;

  function removeChip(remove: Partial<ParsedSearchParams>) {
    router.push(buildSearchUrl({ ...parsed, ...remove, page: 1 }), { scroll: false });
  }

  function clearAll() {
    router.push("/search", { scroll: false });
  }

  return (
    <div aria-label="Applied filters" className="mb-5 flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-line bg-paper py-1 pl-3 pr-1.5 text-xs text-ink"
          key={chip.key}
        >
          {chip.label}
          <button
            aria-label={`Remove filter ${chip.label}`}
            className="rounded-full px-1.5 py-0.5 text-ink-muted hover:bg-line hover:text-ink focus:outline-2 focus:outline-accent"
            onClick={() => removeChip(chip.remove)}
            type="button"
          >
            ✕
          </button>
        </span>
      ))}
      <button
        className="text-xs font-semibold text-accent hover:underline focus:outline-2 focus:outline-accent"
        onClick={clearAll}
        type="button"
      >
        Clear all
      </button>
    </div>
  );
}
