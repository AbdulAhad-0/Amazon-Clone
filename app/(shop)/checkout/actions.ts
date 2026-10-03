"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/getUser";

export interface ShipAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export type PlaceOrderResult =
  | { ok: true; orderId: string }
  | { ok: false; error: "AUTH" | "ADDRESS" | "STOCK" | "CART" | "PAYMENT" | "PAYMENT_EXPIRED" | "SERVER" };

function validAddress(a: ShipAddress): boolean {
  return Boolean(
    a.fullName.trim() && a.phone.trim() && a.line1.trim() && a.city.trim() &&
    a.state.trim() && a.zip.trim() && a.country.trim(),
  );
}

// Server-verified session only (never a client-passed id), address re-validated
// here, then place_order does the money/stock work in one transaction. No items
// and no amounts ever cross this boundary.
export async function placeOrder(paymentId: string, address: ShipAddress): Promise<PlaceOrderResult> {
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "AUTH" };
    if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return { ok: false, error: "PAYMENT" };
    if (!validAddress(address)) return { ok: false, error: "ADDRESS" };

    const pAddress = {
      full_name: address.fullName.trim(),
      phone: address.phone.trim(),
      line1: address.line1.trim(),
      line2: address.line2.trim() || null,
      city: address.city.trim(),
      state: address.state.trim(),
      zip: address.zip.trim(),
      country: address.country.trim(),
    };

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("place_order", {
      p_payment_id: paymentId,
      p_address: pAddress,
      p_user_id: user.id,
    });

    if (error || !data) {
      const m = (error?.message ?? "").toLowerCase();
      if (m.includes("insufficient stock")) return { ok: false, error: "STOCK" };
      if (m.includes("expired")) return { ok: false, error: "PAYMENT_EXPIRED" };
      if (m.includes("not succeeded") || m.includes("belongs to another") || m.includes("not found")) {
        return { ok: false, error: "PAYMENT" };
      }
      if (m.includes("empty cart") || m.includes("amount mismatch")) return { ok: false, error: "CART" };
      return { ok: false, error: "SERVER" };
    }

    // Saved for next time (own-row RLS). Best-effort — the order exists either way.
    try {
      const supabase = await createClient();
      await supabase.from("addresses").insert({ user_id: user.id, ...pAddress, is_default: true });
    } catch {
      /* address book is a convenience, never a checkout blocker */
    }

    revalidatePath("/", "layout");
    return { ok: true, orderId: String(data) };
  } catch {
    return { ok: false, error: "SERVER" };
  }
}
