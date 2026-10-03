"use server";

import { revalidatePath } from "next/cache";
import { addLine, mergeGuest, parseGuestCart, setLineQty, type CartResult, type GuestLine } from "@/lib/cart";
import { getUser } from "@/lib/supabase/getUser";
import { createClient } from "@/lib/supabase/server";

export async function addToCartAction(productId: string, qty: number): Promise<CartResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "AUTH" };
  const db = await createClient();
  const result = await addLine(db, user.id, productId, qty);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function setQtyAction(productId: string, qty: number): Promise<CartResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "AUTH" };
  const db = await createClient();
  const result = await setLineQty(db, user.id, productId, qty);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

// Idempotent by (user, mergeId): a double run returns the same cart with
// alreadyMerged — quantities are never applied twice. The client clears
// localStorage only after ok.
export async function mergeGuestCartAction(
  guest: GuestLine[],
  mergeId: string,
): Promise<CartResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "AUTH" };
  const db = await createClient();
  const clean = parseGuestCart(guest);
  const result = await mergeGuest(db, user.id, clean, mergeId);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
