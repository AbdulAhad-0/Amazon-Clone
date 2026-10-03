import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { setQtyAction } from "@/app/(shop)/cart/actions";
import type { CartLine, CartTotals } from "@/lib/cart";
import { showToast } from "@/lib/toast";

interface OptimisticState {
  [productId: string]: number;
}

// Optimistic qty only — every money figure shown comes from the server
// (ADR-004). A failed action clears the optimistic map (visible rollback)
// and raises a toast.
export function useOptimisticCart(initialLines: CartLine[], initialTotals: CartTotals) {
  const [lines, setLines] = useState<CartLine[]>(initialLines);
  const [totals, setTotals] = useState<CartTotals>(initialTotals);
  const [optimisticQty, setOptimisticQty] = useState<OptimisticState>({});
  const [pending, setPending] = useState(0);
  const router = useRouter();

  const changeQty = useCallback(
    (productId: string, qty: number) => {
      setPending((p) => p + 1);
      setOptimisticQty((m) => ({ ...m, [productId]: qty }));
      void (async () => {
        const res = await setQtyAction(productId, qty);
        setPending((p) => p - 1);
        setOptimisticQty((m) => {
          const next = { ...m };
          delete next[productId];
          return next;
        });
        if (res.ok) {
          setLines(res.lines);
          setTotals(res.totals);
        } else if (res.error === "STOCK") {
          showToast(
            res.available !== undefined && res.available > 0
              ? `Only ${res.available} left`
              : "Out of stock",
          );
        } else if (res.error === "AUTH") {
          router.push("/signin?next=/cart");
        } else {
          showToast("Could not update cart — change reverted.");
        }
      })();
    },
    [router],
  );

  const displayLines = lines
    .map((line) => {
      const o = optimisticQty[line.productId];
      return o === undefined ? line : { ...line, qty: o };
    })
    .filter((line) => line.qty > 0);

  return { displayLines, totals, optimisticQty, pending, changeQty };
}
