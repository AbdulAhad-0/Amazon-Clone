import type { SupabaseClient } from "@supabase/supabase-js";

// Reviews are public-read (RLS policy); writes only ever go through the
// server route -> add_review (service role). Eligibility mirrors add_review:
// the user's most recent NON-cancelled order containing the product.

export interface ReviewRow {
  id: string;
  product_id: string;
  user_id: string;
  order_id: string;
  rating: number;
  body: string;
  created_at: string;
}

export async function getReviews(db: SupabaseClient, productId: string): Promise<ReviewRow[]> {
  const res = await db
    .from("reviews")
    .select("id, product_id, user_id, order_id, rating, body, created_at")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });
  if (res.error) throw new Error(`reviews: ${res.error.message}`);
  return (res.data ?? []) as ReviewRow[];
}

// Server-side eligibility (same derivation as add_review SQL).
export async function canReview(
  db: SupabaseClient,
  userId: string,
  productId: string,
): Promise<boolean> {
  const res = await db
    .from("orders")
    .select("id, order_items!inner(product_id)")
    .eq("user_id", userId)
    .neq("status", "cancelled")
    .eq("order_items.product_id", productId)
    .limit(1);
  if (res.error) throw new Error(`canReview: ${res.error.message}`);
  return (res.data ?? []).length > 0;
}

export async function hasReviewed(
  db: SupabaseClient,
  userId: string,
  productId: string,
): Promise<boolean> {
  const res = await db
    .from("reviews")
    .select("id")
    .eq("product_id", productId)
    .eq("user_id", userId)
    .limit(1);
  if (res.error) throw new Error(`hasReviewed: ${res.error.message}`);
  return (res.data ?? []).length > 0;
}
