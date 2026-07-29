"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CartLine = {
  /** Produkt og tilvalg til sammen, slik at like linjer kan slas sammen. */
  key: string;
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  optionValueIds: string[];
  optionLabels: string[];
  comment?: string;
  preparationMinutes: number;
  requiresAgeVerification: boolean;
};

type CartState = {
  clubSlug: string | null;
  lines: CartLine[];
  setClub: (slug: string) => void;
  addLine: (line: Omit<CartLine, "key" | "quantity">, quantity: number) => void;
  setQuantity: (key: string, quantity: number) => void;
  removeLine: (key: string) => void;
  clear: () => void;
};

/** Ovre grense per linje, slik at feiltrykk ikke blir en bestilling pa hundre polser. */
export const MAX_LINE_QUANTITY = 20;

function lineKey(productId: string, optionValueIds: string[], comment?: string): string {
  return [productId, [...optionValueIds].sort().join("+"), comment ?? ""].join("|");
}

/**
 * Handlekurven ligger i localStorage, slik at den overlever at siden lastes
 * pa nytt eller at dekningen forsvinner, jf. paragraf 19.
 */
export const useCart = create<CartState>()(
  persist(
    (set) => ({
      clubSlug: null,
      lines: [],

      setClub: (slug) =>
        set((state) => (state.clubSlug === slug ? state : { clubSlug: slug, lines: [] })),

      addLine: (line, quantity) =>
        set((state) => {
          const key = lineKey(line.productId, line.optionValueIds, line.comment);
          const existing = state.lines.find((candidate) => candidate.key === key);

          if (existing) {
            return {
              lines: state.lines.map((candidate) =>
                candidate.key === key
                  ? {
                      ...candidate,
                      quantity: Math.min(candidate.quantity + quantity, MAX_LINE_QUANTITY),
                    }
                  : candidate,
              ),
            };
          }

          return { lines: [...state.lines, { ...line, key, quantity }] };
        }),

      setQuantity: (key, quantity) =>
        set((state) => ({
          lines:
            quantity <= 0
              ? state.lines.filter((line) => line.key !== key)
              : state.lines.map((line) => (line.key === key ? { ...line, quantity } : line)),
        })),

      removeLine: (key) =>
        set((state) => ({ lines: state.lines.filter((line) => line.key !== key) })),

      clear: () => set({ lines: [] }),
    }),
    { name: "golf-handlekurv" },
  ),
);

export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
}

export function cartItemCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

/**
 * Linja uten tilvalg og kommentar. Det er den «+»-knappen pa produktkortet i
 * menyen legger til og teller opp.
 */
export function findPlainLine(lines: CartLine[], productId: string): CartLine | undefined {
  const key = lineKey(productId, []);
  return lines.find((line) => line.key === key);
}

/** Totalt antall av et produkt, uansett hvilke tilvalg linjene har. */
export function productQuantity(lines: CartLine[], productId: string): number {
  return lines.reduce((sum, line) => (line.productId === productId ? sum + line.quantity : sum), 0);
}

/** Lengste tilberedningstid i kurven, brukt til a foresla leveringspunkt. */
export function cartPreparationMinutes(lines: CartLine[]): number {
  return lines.reduce((longest, line) => Math.max(longest, line.preparationMinutes), 0);
}
