"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

interface Suggestion {
  slug: string;
  title: string;
}

const MIN_QUERY = 2;

export function SearchSuggest() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const debounced = useDebouncedValue(value, 250);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounced.trim().length < MIN_QUERY) {
      setItems([]);
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/suggest?q=${encodeURIComponent(debounced.trim())}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data: { items?: Suggestion[] }) => {
        setItems(data.items ?? []);
        setOpen(true);
      })
      .catch(() => {
        /* aborted or failed — keep previous state */
      });
    return () => controller.abort();
  }, [debounced]);

  function goToSearch() {
    const q = value.trim();
    setOpen(false);
    router.push(q === "" ? "/search" : `/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <div
      className="relative min-w-0 flex-1"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      ref={containerRef}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          goToSearch();
        }}
        role="search"
      >
        <input
          aria-label="Search products"
          aria-expanded={open && items.length > 0}
          className="w-full rounded-full border border-line bg-paper px-4 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-2 focus:outline-accent"
          onChange={(e) => {
            setValue(e.target.value);
            if (e.target.value.trim().length < MIN_QUERY) setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search products"
          type="search"
          value={value}
        />
      </form>

      {open && items.length > 0 && (
        <ul
          aria-label="Search suggestions"
          className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-2xl border border-line bg-white shadow-lg"
        >
          {items.map((item) => (
            <li key={item.slug}>
              <Link
                className="block px-4 py-2 text-left text-sm text-ink hover:bg-paper focus:bg-paper focus:outline-2 focus:outline-accent"
                href={`/p/${item.slug}`}
                onClick={() => setOpen(false)}
                onMouseDown={(e) => e.preventDefault()}
              >
                {item.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
