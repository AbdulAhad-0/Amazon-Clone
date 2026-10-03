import Link from "next/link";
import { buildSearchUrl, type ParsedSearchParams } from "@/lib/search";

export interface CategoryChip {
  slug: string;
  name: string;
  count: number;
}

interface CategoryChipsProps {
  baseUrl: string;
  parsed: ParsedSearchParams;
  chips: CategoryChip[];
  allCount: number;
}

function chipClass(active: boolean): string {
  const base =
    "shrink-0 rounded-full border px-4 py-2 text-sm focus:outline-2 focus:outline-accent";
  return active
    ? `${base} border-accent bg-accent font-semibold text-white`
    : `${base} border-line bg-surface text-ink hover:border-accent hover:text-accent`;
}

/** Sub-category chips: plain Links (URL state is only ever ?cat=). Server component. */
export function CategoryChips({ baseUrl, parsed, chips, allCount }: CategoryChipsProps) {
  if (chips.length === 0) return null;
  const active = parsed.cat;

  const hrefFor = (cat: string | undefined) =>
    buildSearchUrl({ ...parsed, cat, page: 1 }, baseUrl, "rating");

  return (
    <nav aria-label="Sub-categories" className="mb-6 flex gap-2 overflow-x-auto pb-1">
      <Link aria-current={active === undefined ? "page" : undefined} className={chipClass(active === undefined)} href={hrefFor(undefined)}>
        All ({allCount})
      </Link>
      {chips.map((chip) => (
        <Link
          aria-current={active === chip.slug ? "page" : undefined}
          className={chipClass(active === chip.slug)}
          href={hrefFor(chip.slug)}
          key={chip.slug}
        >
          {chip.name} ({chip.count})
        </Link>
      ))}
    </nav>
  );
}
