import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Sign in — Vendra" };

interface SigninPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function SigninPage({ searchParams }: SigninPageProps) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : "");

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-1 font-display text-3xl font-semibold text-ink">Sign in</h1>
      <p className="mb-6 text-sm text-ink-muted">Welcome back to Vendra.</p>
      <AuthForm mode="signin" next={next} />
    </div>
  );
}
