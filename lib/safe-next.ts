// Open-redirect guard for ?next= (architecture §3): single leading "/" only —
// no "//", no "/\", no external URLs. Everything else falls back to "/".
export function safeNext(input: string): string {
  if (typeof input !== "string") return "/";
  if (/^\/(?!\/)/.test(input) && !input.startsWith("/\\")) return input;
  return "/";
}
