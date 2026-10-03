import { MAX_CART_QTY, parseGuestCart, type GuestLine } from "@/lib/cart";

const KEY = "vendra.cart";
const CART_EVENT = "vendra:cart";

// One merge id per guest cart session, held in memory only (localStorage
// stays {productId, qty}). The server claims it before adding quantities, so
// a double run applies the merge once; cleared together with the cart.
let pendingMergeId: string | null = null;

export function getPendingMergeId(): string {
  if (pendingMergeId === null) pendingMergeId = crypto.randomUUID();
  return pendingMergeId;
}

export function readGuestCart(): GuestLine[] {
  if (typeof window === "undefined") return [];
  try {
    return parseGuestCart(window.localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

export function guestCartCount(): number {
  return readGuestCart().length;
}

function emitCartChanged(): void {
  window.dispatchEvent(new Event(CART_EVENT));
}

export function writeGuestCart(lines: GuestLine[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    return;
  }
  emitCartChanged();
}

export function addGuestLine(productId: string, qty = 1): void {
  const lines = readGuestCart();
  const n = Math.min(Math.max(Math.floor(qty) || 1, 1), MAX_CART_QTY);
  const existing = lines.find((l) => l.productId === productId);
  if (existing) {
    existing.qty = Math.min(existing.qty + n, MAX_CART_QTY);
  } else {
    lines.push({ productId, qty: n });
  }
  writeGuestCart(lines);
}

export function setGuestQty(productId: string, qty: number): void {
  let lines = readGuestCart();
  if (!Number.isFinite(qty) || qty <= 0) {
    lines = lines.filter((l) => l.productId !== productId);
  } else {
    const n = Math.min(Math.max(Math.floor(qty), 1), MAX_CART_QTY);
    lines = lines.map((l) => (l.productId === productId ? { ...l, qty: n } : l));
  }
  writeGuestCart(lines);
}

export function removeGuestLine(productId: string): void {
  writeGuestCart(readGuestCart().filter((l) => l.productId !== productId));
}

export function clearGuestCart(): void {
  pendingMergeId = null;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
  emitCartChanged();
}

export const GUEST_CART_EVENT = CART_EVENT;
