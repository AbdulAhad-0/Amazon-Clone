"use client";

import Image from "next/image";
import { useState } from "react";

interface ProductImageProps {
  src: string;
  alt: string;
  title: string;
}

export function ProductImage({ src, alt, title }: ProductImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        aria-label={`Image unavailable: ${alt}`}
        className="flex h-full w-full items-center justify-center bg-accent"
        role="img"
      >
        <span className="font-display text-4xl font-semibold text-white">
          {title.charAt(0).toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <Image
      alt={alt}
      className="object-contain"
      fill
      onError={() => setFailed(true)}
      sizes="(max-width: 768px) 50vw, 25vw"
      src={src}
    />
  );
}
