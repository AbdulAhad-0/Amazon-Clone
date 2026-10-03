"use client";

import { useState } from "react";
import { ProductImage } from "./ProductImage";

interface GalleryProps {
  images: string[];
  title: string;
}

export function Gallery({ images, title }: GalleryProps) {
  const [active, setActive] = useState(0);
  const list = images.length > 0 ? images : [""];
  const current = list[Math.min(active, list.length - 1)];

  return (
    <div>
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-line bg-white">
        <ProductImage alt={title} src={current} title={title} />
      </div>
      {list.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {list.map((img, i) => (
            <button
              aria-label={`View image ${i + 1}`}
              aria-pressed={i === active}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-white focus:outline-2 focus:outline-accent ${
                i === active ? "border-accent" : "border-line"
              }`}
              key={`${img}-${i}`}
              onClick={() => setActive(i)}
              type="button"
            >
              <ProductImage alt="" src={img} title={title} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
