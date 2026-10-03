import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
}

// Server-verified identity (architecture §3): auth.getUser() only — never
// trusts an id from the client. Session cookies are refreshed in proxy.ts.
export async function getUser(): Promise<SessionUser | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // RSC cannot set cookies outside actions; proxy.ts refreshes them.
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          /* read-only context */
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const email = user.email ?? "";
  const displayName = profile?.display_name || email.split("@")[0] || "there";
  return { id: user.id, email, displayName };
}
