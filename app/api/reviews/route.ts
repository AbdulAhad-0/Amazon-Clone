import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/getUser";

// POST /api/reviews — client sends ONLY { productId, rating, body }.
// orderId/userId are never read: the server derives the eligible order inside
// add_review. 201 | 400 | 401 | 403 (non-buyer / cancelled-only) | 409 (dup).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ReviewBody {
  productId?: unknown;
  rating?: unknown;
  body?: unknown;
}

export async function POST(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ code: "AUTH" }, { status: 401 });

    const raw: unknown = await request.json().catch(() => null);
    if (typeof raw !== "object" || raw === null) {
      return NextResponse.json({ code: "VALIDATION" }, { status: 400 });
    }
    const body = raw as ReviewBody;
    const productId = typeof body.productId === "string" ? body.productId : "";
    const rating = typeof body.rating === "number" ? Math.trunc(body.rating) : NaN;
    const text = typeof body.body === "string" ? body.body.trim() : "";

    if (!UUID_RE.test(productId) || !Number.isFinite(rating) || rating < 1 || rating > 5 || text.length === 0 || text.length > 2000) {
      return NextResponse.json({ code: "VALIDATION" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin.rpc("add_review", {
      p_product_id: productId,
      p_rating: rating,
      p_body: text,
      p_user_id: user.id,
    });

    if (error) {
      const code = error.code ?? "";
      const m = error.message.toLowerCase();
      if (code === "23505" || m.includes("duplicate") || m.includes("uniq")) {
        return NextResponse.json({ code: "DUPLICATE" }, { status: 409 });
      }
      if (m.includes("not a verified buyer")) {
        return NextResponse.json({ code: "NOT_BUYER" }, { status: 403 });
      }
      if (m.includes("rating must") || m.includes("body")) {
        return NextResponse.json({ code: "VALIDATION" }, { status: 400 });
      }
      // never leak SQL details
      return NextResponse.json({ code: "SERVER" }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ code: "SERVER" }, { status: 500 });
  }
}
