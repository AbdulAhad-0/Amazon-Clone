import { NextResponse } from "next/server";
import { cartTotals, getCartLines } from "@/lib/cart";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/getUser";

// Mock payment endpoint (slice 6). Card data is validated against the fixed
// demo rules IN MEMORY and then discarded — never persisted, never logged,
// never echoed. Only status + server-computed amount reach `payments`.

const CARD_OK = "4242424242424242";
const CARD_DECLINE = "4000000000000002";

interface CardInput {
  number?: unknown;
  exp?: unknown;
  cvc?: unknown;
}

export async function POST(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "AUTH", code: "AUTH" }, { status: 401 });

    const body: unknown = await request.json().catch(() => null);
    const card = (
      typeof body === "object" && body !== null && "card" in body
        ? (body as { card: CardInput }).card
        : (body as CardInput | null)
    ) as CardInput | null;
    if (!card || typeof card !== "object") {
      return NextResponse.json({ code: "CARD" }, { status: 400 });
    }

    const number = typeof card.number === "string" ? card.number.replace(/[\s-]/g, "") : "";
    const exp = typeof card.exp === "string" ? card.exp.trim() : "";
    const cvc = typeof card.cvc === "string" ? card.cvc.trim() : "";
    const validShape = /^\d{16}$/.test(number) && /^(0[1-9]|1[0-2])\/\d{2}$/.test(exp) && /^\d{3,4}$/.test(cvc);
    if (!validShape) return NextResponse.json({ code: "CARD" }, { status: 400 });

    // Demo rules — evaluate, then forget the card entirely.
    const demoResult: "succeeded" | "failed" | "unknown" =
      number === CARD_OK ? "succeeded" : number === CARD_DECLINE ? "failed" : "unknown";
    if (demoResult === "unknown") return NextResponse.json({ code: "CARD" }, { status: 400 });

    const supabase = await createClient();
    const lines = await getCartLines(supabase);
    if (lines.length === 0) return NextResponse.json({ code: "CART" }, { status: 422 });

    // Same server pricing path as place_order (ADR-016): effective prices,
    // shipping threshold, 8% tax — the client never sends an amount.
    const totals = cartTotals(lines);
    const stockShort = lines.find((l) => l.qty > l.stock);
    if (stockShort) return NextResponse.json({ code: "STOCK" }, { status: 422 });

    const admin = createAdminClient();
    const inserted = await admin
      .from("payments")
      .insert({
        user_id: user.id,
        amount_cents: totals.totalCents,
        status: demoResult,
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) {
      return NextResponse.json({ code: "SERVER" }, { status: 500 });
    }

    if (demoResult === "failed") {
      // Failed payment row is kept for audit; no order can ever reference it.
      return NextResponse.json({ code: "PAYMENT_FAILED" }, { status: 400 });
    }
    return NextResponse.json({ paymentId: inserted.data.id });
  } catch {
    return NextResponse.json({ code: "SERVER" }, { status: 500 });
  }
}
