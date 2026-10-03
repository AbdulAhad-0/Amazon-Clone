import { NextResponse } from "next/server";
import { buildQOrClause } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

const MAX_Q = 50;
const MAX_RESULTS = 8;

export async function GET(request: Request): Promise<NextResponse> {
  const raw = new URL(request.url).searchParams.get("q") ?? "";
  const q = raw.trim();

  if (q === "") {
    return NextResponse.json({ error: "q is required" }, { status: 400 });
  }
  if (q.length > MAX_Q) {
    return NextResponse.json({ error: `q must be ≤ ${MAX_Q} characters` }, { status: 400 });
  }

  const supabase = await createClient();
  const res = await supabase
    .from("products")
    .select("slug, title")
    .or(buildQOrClause(q))
    .order("rating_avg", { ascending: false })
    .order("slug", { ascending: true })
    .limit(MAX_RESULTS);

  if (res.error) {
    return NextResponse.json({ error: "search failed" }, { status: 500 });
  }

  return NextResponse.json({ items: res.data ?? [] });
}
