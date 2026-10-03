import "server-only";

import { createClient } from "@supabase/supabase-js";

if (typeof window !== "undefined") {
  throw new Error("createAdminClient must never run in the browser");
}

// Service-role client (ADR-008): server-only, never in app/ or components/,
// never prefixed NEXT_PUBLIC_*. Throws if the key is missing — no fallback,
// no logging of the value itself.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
