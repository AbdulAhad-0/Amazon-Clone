"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { safeNext } from "@/lib/safe-next";

export interface AuthState {
  error?: string;
  field?: "email" | "password" | "name";
}

async function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });
}

function mapAuthError(message: string): AuthState {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return { error: "Email or password is incorrect.", field: "password" };
  if (m.includes("already registered") || m.includes("already been registered"))
    return { error: "An account with this email already exists.", field: "email" };
  if (m.includes("invalid email")) return { error: "Enter a valid email address.", field: "email" };
  if (m.includes("password")) return { error: "Password must be at least 6 characters.", field: "password" };
  if (m.includes("rate") || m.includes("too many") || m.includes("security purposes"))
    return { error: "Too many attempts. Wait a moment and try again." };
  return { error: "Something went wrong. Please try again." };
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));

  if (!email || !password) {
    return {
      error: !email ? "Enter your email address." : "Enter your password.",
      field: !email ? "email" : "password",
    };
  }

  const supabase = await createBrowserClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return mapAuthError(error.message);

  redirect(next);
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));

  if (!email || !password) {
    return {
      error: !email ? "Enter your email address." : "Choose a password.",
      field: !email ? "email" : "password",
    };
  }
  if (password.length < 6) return { error: "Password must be at least 6 characters.", field: "password" };

  const supabase = await createBrowserClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  });
  if (error) return mapAuthError(error.message);
  if (!data.session) {
    // ADR-007: sign-up must yield a session immediately.
    return { error: "Email confirmation must be disabled in Supabase (ADR-007)." };
  }

  redirect(next);
}

export async function signOut(): Promise<void> {
  const supabase = await createBrowserClient();
  await supabase.auth.signOut();
  // Server cache only. The client clears its own router cache via
  // router.refresh() + router.replace("/") after this action resolves.
  revalidatePath("/", "layout");
}
