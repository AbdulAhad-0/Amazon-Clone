"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

export interface HeroSlide {
  eyebrow: string;
  headline: string;
  sentence: string;
  cta: { href: string; label: string };
}

interface HeroCarouselProps {
  slides: HeroSlide[];
  images: string[];
}

const BG = ["bg-[var(--hero-indigo)]", "bg-[var(--hero-sand)]", "bg-[var(--ink)] text-white"];

// Own design: standard arrow buttons + dots + pause/play. No click zones.
export function HeroCarousel({ slides, images }: HeroCarouselProps) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const go = useCallback(
    (n: number) => setIdx((i) => (i + n + slides.length) % slides.length),
    [slides.length],
  );

  useEffect(() => {
    if (paused || reduced) return;
    const t = setInterval(() => go(1), 6000);
    return () => clearInterval(t);
  }, [paused, reduced, go]);

  function onKey(e: React.KeyboardEvent): void {
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
  }

  return (
    <section
      aria-label="Featured"
      aria-roledescription="carousel"
      className="relative mb-8 h-[36rem] overflow-hidden rounded-3xl border border-line focus:outline-2 focus:outline-accent sm:h-[26rem] lg:h-[28rem]"
      tabIndex={0}
      onKeyDown={onKey}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const d = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(d) > 40) go(d > 0 ? -1 : 1);
        touchX.current = null;
      }}
    >
      {slides.map((slide, i) => (
        <div
          aria-hidden={i !== idx}
          className={`${BG[i % BG.length]} absolute inset-0 ${i === idx ? "" : "invisible"}`}
          key={slide.headline}
        >
          <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 px-6 py-8 md:flex-row md:items-center md:gap-10 md:py-10">
            <div className="md:w-1/2">
              <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-accent [text-wrap:balance]">
                {slide.eyebrow}
              </p>
              <h1
                aria-label={`Slide ${i + 1} of ${slides.length}`}
                className={`font-display text-3xl font-semibold leading-tight [text-wrap:balance] sm:text-4xl ${i === 2 ? "text-white" : "text-ink"}`}
              >
                {slide.headline}
              </h1>
              <p className={`mt-3 max-w-prose text-sm sm:text-base ${i === 2 ? "text-white/80" : "text-ink-muted"}`}>
                {slide.sentence}
              </p>
              <Link
                className={`mt-5 inline-flex min-h-11 items-center rounded-full px-6 py-3 text-sm font-semibold focus:outline-2 focus:outline-accent ${i === 2 ? "bg-white text-ink hover:opacity-90" : "bg-accent text-white hover:opacity-90"}`}
                href={slide.cta.href}
                tabIndex={i === idx ? 0 : -1}
              >
                {slide.cta.label}
              </Link>
            </div>
            {images.length >= 3 && (
              <div aria-hidden="true" className="relative h-40 md:h-64 md:w-1/2">
                {[0, 1, 2].map((n) => (
                  <span
                    className="absolute block h-32 w-32 overflow-hidden rounded-2xl border border-line bg-white shadow-sm sm:h-40 sm:w-40"
                    key={n}
                    style={{
                      left: `${4 + n * 26}%`,
                      top: `${(n % 2) * 30}%`,
                      zIndex: 3 - n,
                      transform: `rotate(${(n - 1) * 4}deg)`,
                    }}
                  >
                    <Image
                      alt=""
                      className="object-contain p-2"
                      fill
                      loading={i === 0 ? "eager" : "lazy"}
                      priority={i === 0 && n === 0}
                      sizes="160px"
                      src={images[n]}
                    />
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      {/* controls: standard arrows + dots + pause */}
      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
        <button
          aria-label="Previous slide"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-ink hover:bg-paper focus:outline-2 focus:outline-accent"
          onClick={() => go(-1)}
          type="button"
        >
          ‹
        </button>
        <div className="flex items-center gap-1.5 px-1">
          {slides.map((s, i) => (
            <button
              aria-current={i === idx}
              aria-label={`Go to slide ${i + 1}`}
              className="h-2.5 w-2.5 rounded-full focus:outline-2 focus:outline-accent"
              key={s.headline}
              onClick={() => setIdx(i)}
              style={{ background: i === idx ? "var(--accent)" : "var(--line)" }}
              type="button"
            />
          ))}
        </div>
        <button
          aria-label={paused ? "Play slideshow" : "Pause slideshow"}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-ink hover:bg-paper focus:outline-2 focus:outline-accent"
          onClick={() => setPaused((p) => !p)}
          type="button"
        >
          {paused ? "▶" : "❚❚"}
        </button>
        <button
          aria-label="Next slide"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface text-ink hover:bg-paper focus:outline-2 focus:outline-accent"
          onClick={() => go(1)}
          type="button"
        >
          ›
        </button>
      </div>
    </section>
  );
}
