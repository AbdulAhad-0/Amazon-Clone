"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ToastDetail } from "@/lib/toast";

const TOAST_MS = 5000;

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastDetail[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      setToasts((current) => [...current.filter((t) => t.id !== detail.id), detail]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((t) => t.id !== detail.id));
      }, TOAST_MS);
    }
    window.addEventListener("vendra:toast", onToast);
    return () => window.removeEventListener("vendra:toast", onToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((toast) => (
        <div
          className="pointer-events-auto flex max-w-sm items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink shadow-lg"
          key={toast.id}
        >
          <span>{toast.message}</span>
          {toast.href && toast.label && (
            <>
              <span aria-hidden="true" className="text-ink-muted">
                -
              </span>
              <Link
                className="font-semibold text-accent hover:underline focus:outline-2 focus:outline-accent"
                href={toast.href}
              >
                {toast.label}
              </Link>
            </>
          )}
          <button
            aria-label="Dismiss notification"
            className="ml-auto text-ink-muted hover:text-ink focus:outline-2 focus:outline-accent"
            onClick={() => setToasts((current) => current.filter((t) => t.id !== toast.id))}
            type="button"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
