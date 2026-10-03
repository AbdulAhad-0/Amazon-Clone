export interface ToastDetail {
  id: string;
  message: string;
  href?: string;
  label?: string;
}

export function showToast(message: string, opts?: { href?: string; label?: string }): void {
  if (typeof window === "undefined") return;
  const detail: ToastDetail = {
    id: crypto.randomUUID(),
    message,
    href: opts?.href,
    label: opts?.label,
  };
  window.dispatchEvent(new CustomEvent<ToastDetail>("vendra:toast", { detail }));
}
