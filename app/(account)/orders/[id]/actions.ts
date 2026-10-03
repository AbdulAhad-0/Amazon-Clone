"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/getUser";

export type CancelResult =
  | { ok: true }
  | { ok: false; error: "AUTH" | "FORBIDDEN" | "SHIPPED" | "SERVER" };

// Owner-only cancel (session-verified id), placed-only, idempotent server-side
// (architecture §6). Revalidate both views so badge + button flip together.
export async function cancelOrder(orderId: string): Promise<CancelResult> {
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "AUTH" };
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
      return { ok: false, error: "FORBIDDEN" };
    }

    const admin = createAdminClient();
    const { error } = await admin.rpc("cancel_order", { p_order_id: orderId, p_user_id: user.id });
    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes("already shipped")) return { ok: false, error: "SHIPPED" };
      if (m.includes("not your order") || m.includes("not found")) return { ok: false, error: "FORBIDDEN" };
      return { ok: false, error: "SERVER" };
    }

    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "SERVER" };
  }
}
