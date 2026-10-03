"use client";

import { useState } from "react";
import { FilterControls, type FilterContext } from "./FilterRail";

type SheetProps = FilterContext & { resultCount: number; activeCount: number };

// Mobile bottom sheet — renders the SAME FilterControls as the desktop rail,
// so both write byte-identical URLs through buildSearchUrl.
export function FilterSheet({ resultCount, activeCount, ...controls }: SheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface p-3 md:hidden">
        <button
          className="w-full rounded-full bg-accent px-4 py-3 text-sm font-semibold text-white hover:opacity-90 focus:outline-2 focus:outline-accent"
          onClick={() => setOpen(true)}
          type="button"
        >
          Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </button>
      </div>

      {open && (
        <div
          aria-label="Filters"
          aria-modal="true"
          className="fixed inset-0 z-30 md:hidden"
          role="dialog"
        >
          <button
            aria-label="Close filters"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            type="button"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-4 pb-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">Filters</h2>
              <button
                aria-label="Close filters"
                className="rounded-full p-2 text-ink-muted hover:bg-paper focus:outline-2 focus:outline-accent"
                onClick={() => setOpen(false)}
                type="button"
              >
                ✕
              </button>
            </div>

            <FilterControls {...controls} idPrefix="sheet" />

            <button
              className="mt-6 w-full rounded-full bg-accent px-4 py-3 text-sm font-semibold text-white hover:opacity-90 focus:outline-2 focus:outline-accent"
              onClick={() => setOpen(false)}
              type="button"
            >
              Show {resultCount} {resultCount === 1 ? "result" : "results"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
