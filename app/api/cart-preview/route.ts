import { NextResponse } from "next/server";
import { cartTotals, parseGuestCart, previewLines } from "@/lib/cart";
import { createClient } from "@/lib/supabase/server";

// Guest cart preview: client sends {productId, qty} only; current prices,
// stock and totals are computed here from the database.
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const items =
      typeof body === "object" && body !== null && "items" in body
        ? (body as { items: unknown }).items
        : body;
    const guest = parseGuestCart(items);

    const supabase = await createClient();
    const { lines, dropped } = await previewLines(supabase, guest);
    return NextResponse.json({ dropped, lines, totals: cartTotals(lines) });
  } catch {
    return NextResponse.json({ error: "SERVER" }, { status: 500 });
  }
}
