"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { signIn, signUp, type AuthState } from "@/app/(account)/actions";

const initialState: AuthState = {};

function SubmitButton({ pendingLabel }: { pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="w-full rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white hover:opacity-90 focus:outline-2 focus:outline-accent disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : pendingLabel.replace("…", "")}
    </button>
  );
}

interface AuthFormProps {
  mode: "signin" | "signup";
  next: string;
}

export function AuthForm({ mode, next }: AuthFormProps) {
  const action = mode === "signin" ? signIn : signUp;
  const [state, formAction] = useActionState(action, initialState);
  const [showPassword, setShowPassword] = useState(false);

  const errorFor = (field: "email" | "password" | "name") =>
    state.field === field ? state.error : undefined;
  const formError = state.error && !state.field ? state.error : undefined;

  return (
    <form action={formAction} className="space-y-4">
      <input name="next" type="hidden" value={next} />

      {mode === "signup" && (
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink" htmlFor="auth-name">
            Name <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input
            autoComplete="name"
            className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-2 focus:outline-accent"
            id="auth-name"
            name="name"
            placeholder="Alex"
            type="text"
          />
          {errorFor("name") && <p className="mt-1 text-xs text-red-700">{errorFor("name")}</p>}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-semibold text-ink" htmlFor="auth-email">
          Email
        </label>
        <input
          autoComplete="email"
          className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-2 focus:outline-accent"
          id="auth-email"
          name="email"
          placeholder="you@example.com"
          type="email"
        />
        {errorFor("email") && <p className="mt-1 text-xs text-red-700">{errorFor("email")}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-ink" htmlFor="auth-password">
          Password
        </label>
        <div className="relative">
          <input
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            className="w-full rounded-xl border border-line bg-white px-3 py-2 pr-16 text-sm text-ink focus:outline-2 focus:outline-accent"
            id="auth-password"
            minLength={6}
            name="password"
            type={showPassword ? "text" : "password"}
          />
          <button
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 px-3 text-xs font-semibold text-accent hover:underline focus:outline-2 focus:outline-accent"
            onClick={() => setShowPassword((v) => !v)}
            type="button"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        {errorFor("password") && <p className="mt-1 text-xs text-red-700">{errorFor("password")}</p>}
      </div>

      {formError && (
        <p aria-live="polite" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}

      <SubmitButton pendingLabel={mode === "signin" ? "Signing in…" : "Creating account…"} />

      <p className="text-center text-sm text-ink-muted">
        {mode === "signin" ? (
          <>
            New to Vendra?{" "}
            <Link className="font-semibold text-accent hover:underline" href="/signup">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link className="font-semibold text-accent hover:underline" href="/signin">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
