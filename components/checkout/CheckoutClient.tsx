"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";
import { placeOrder, type ShipAddress } from "@/app/(shop)/checkout/actions";

interface CheckoutClientProps {
  totalCents: number;
  initial: ShipAddress | null;
}

const EMPTY: ShipAddress = {
  fullName: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  zip: "",
  country: "",
};

const FIELDS: { key: keyof ShipAddress; label: string; auto: string; full?: boolean }[] = [
  { key: "fullName", label: "Full name", auto: "name" },
  { key: "phone", label: "Phone", auto: "tel" },
  { key: "line1", label: "Address line 1", auto: "address-line1", full: true },
  { key: "line2", label: "Address line 2 (optional)", auto: "address-line2", full: true },
  { key: "city", label: "City", auto: "address-level2" },
  { key: "state", label: "State", auto: "address-level1" },
  { key: "zip", label: "ZIP", auto: "postal-code" },
  { key: "country", label: "Country", auto: "country-name" },
];

const ERRORS: Record<string, string> = {
  ADDRESS: "Please fill in every required address field.",
  STOCK: "Some items in your cart just sold out. Go back to your cart and try again.",
  CART: "Your cart changed — go back to your cart and try checkout again.",
  PAYMENT: "That payment could not be verified. Please try paying again.",
  PAYMENT_EXPIRED: "That payment expired after 15 minutes. Please pay again.",
  SERVER: "Something went wrong on our side. Nothing was charged — please try again.",
  PAYMENT_FAILED: "Your card was declined (demo rule). Your cart is untouched — try the demo card.",
  CARD: "Enter a valid demo card: 4242 4242 4242 4242 (MM/YY, any CVC).",
  AUTH: "Please sign in again to finish checkout.",
};

export function CheckoutClient({ totalCents, initial }: CheckoutClientProps) {
  const router = useRouter();
  const [address, setAddress] = useState<ShipAddress>(initial ?? EMPTY);
  const [card, setCard] = useState({ number: "", exp: "", cvc: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function setAddressField(key: keyof ShipAddress, value: string): void {
    setAddress((a) => ({ ...a, [key]: value }));
  }

  function pay(): void {
    if (pending) return; // double-click protection (server is idempotent anyway)
    setError(null);

    const required: (keyof ShipAddress)[] = ["fullName", "phone", "line1", "city", "state", "zip", "country"];
    if (required.some((k) => !address[k].trim())) {
      setError(ERRORS.ADDRESS);
      return;
    }

    startTransition(async () => {
      try {
        const payRes = await fetch("/api/checkout/pay", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ card }),
        });
        if (!payRes.ok) {
          const body = (await payRes.json().catch(() => ({}))) as { code?: string };
          setError(ERRORS[body.code ?? "SERVER"] ?? ERRORS.SERVER);
          return;
        }
        const body = (await payRes.json()) as { paymentId?: string };
        if (!body.paymentId) {
          setError(ERRORS.SERVER);
          return;
        }
        const placed = await placeOrder(body.paymentId, address);
        if (!placed.ok) {
          setError(ERRORS[placed.error] ?? ERRORS.SERVER);
          return;
        }
        router.replace(`/orders/${placed.orderId}`);
      } catch {
        setError(ERRORS.SERVER);
      }
    });
  }

  return (
    <div className="space-y-6">
      <section aria-label="Shipping address" className="rounded-2xl border border-line bg-paper p-6">
        <h2 className="mb-4 font-display text-lg font-semibold text-ink">Shipping address</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <label key={f.key} className={f.full ? "sm:col-span-2" : ""}>
              <span className="mb-1 block text-sm font-medium text-ink">{f.label}</span>
              <input
                autoComplete={f.auto}
                className="min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink placeholder:text-ink-muted focus:outline-2 focus:outline-accent"
                value={address[f.key]}
                onChange={(e) => setAddressField(f.key, e.target.value)}
              />
            </label>
          ))}
        </div>
      </section>

      <section aria-label="Payment" className="rounded-2xl border border-line bg-paper p-6">
        <h2 className="mb-1 font-display text-lg font-semibold text-ink">Payment</h2>
        <p className="mb-4 rounded-xl bg-white p-3 text-xs text-ink-muted">
          Mock payment for this demo — card details are never stored or logged. Try{" "}
          <span className="font-mono font-semibold text-ink">4242 4242 4242 4242</span> (works) or{" "}
          <span className="font-mono font-semibold text-ink">4000 0000 0000 0002</span> (declined).
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="sm:col-span-3">
            <span className="mb-1 block text-sm font-medium text-ink">Card number</span>
            <input
              autoComplete="cc-number"
              inputMode="numeric"
              placeholder="4242 4242 4242 4242"
              className="min-h-11 w-full rounded-xl border border-line bg-white px-3 font-mono text-sm text-ink placeholder:text-ink-muted focus:outline-2 focus:outline-accent"
              value={card.number}
              onChange={(e) => setCard((c) => ({ ...c, number: e.target.value }))}
            />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium text-ink">Expiry (MM/YY)</span>
            <input
              autoComplete="cc-exp"
              placeholder="12/28"
              className="min-h-11 w-full rounded-xl border border-line bg-white px-3 font-mono text-sm text-ink placeholder:text-ink-muted focus:outline-2 focus:outline-accent"
              value={card.exp}
              onChange={(e) => setCard((c) => ({ ...c, exp: e.target.value }))}
            />
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium text-ink">CVC</span>
            <input
              autoComplete="cc-csc"
              inputMode="numeric"
              placeholder="123"
              className="min-h-11 w-full rounded-xl border border-line bg-white px-3 font-mono text-sm text-ink placeholder:text-ink-muted focus:outline-2 focus:outline-accent"
              value={card.cvc}
              onChange={(e) => setCard((c) => ({ ...c, cvc: e.target.value }))}
            />
          </label>
        </div>

        <div aria-live="polite" className="min-h-6">
          {error && (
            <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-white p-3 text-sm font-medium text-danger">
              {error}
            </p>
          )}
        </div>

        <button
          type="button"
          disabled={pending}
          onClick={pay}
          className="mt-4 min-h-12 w-full rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:opacity-90 focus:outline-2 focus:outline-accent disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {pending ? "Processing…" : `Pay ${formatCents(totalCents)}`}
        </button>
        <p className="mt-3 text-xs text-ink-muted">
          Demo only — this button does not contact a real payment provider.
        </p>
      </section>
    </div>
  );
}
