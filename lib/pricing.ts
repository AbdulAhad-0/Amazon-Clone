// Pure server-side pricing rules (spec §4 business rules, ADR-004/016).
// No imports from Supabase/Next so client components can compute nothing
// but display these server-defined constants safely.

export const FREE_SHIPPING_CENTS = 3500;

export function effectivePriceCents(priceCents: number, discountPct: number | null): number {
  const d = discountPct ?? 0;
  return Math.floor((priceCents * (100 - d)) / 100);
}

export function shippingCents(subtotalCents: number): number {
  return subtotalCents >= FREE_SHIPPING_CENTS ? 0 : 599;
}

export function taxCents(subtotalCents: number): number {
  return Math.round((subtotalCents * 8) / 100);
}

export interface CostBreakdown {
  qty: number;
  unitEffectiveCents: number;
  itemCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
}

export function costBreakdown(priceCents: number, discountPct: number | null, qty: number): CostBreakdown {
  const unit = effectivePriceCents(priceCents, discountPct);
  const item = unit * qty;
  const shipping = shippingCents(item);
  const tax = taxCents(item);
  return {
    qty,
    unitEffectiveCents: unit,
    itemCents: item,
    shippingCents: shipping,
    taxCents: tax,
    totalCents: item + shipping + tax,
  };
}
