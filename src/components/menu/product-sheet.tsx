"use client";

import { useState } from "react";

import { Badge, Button } from "@/components/ui";
import { useCart } from "@/lib/cart-store";
import { formatAmount } from "@/lib/money";
import type { MenuProduct } from "@/server/services/menu";

/** Produktdetaljer med tilvalg, jf. steg 2 i kundereisen. */
export function ProductSheet({
  product,
  onClose,
}: {
  product: MenuProduct;
  onClose: () => void;
}) {
  const addLine = useCart((state) => state.addLine);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const chosenValues = product.options.flatMap((option) =>
    option.values
      .filter((value) => (selected[option.id] ?? []).includes(value.id))
      .map((value) => ({ option, value })),
  );

  const unitPrice =
    product.price + chosenValues.reduce((sum, { value }) => sum + value.additionalPrice, 0);

  function toggle(optionId: string, valueId: string, maximumChoices: number) {
    setError(null);
    setSelected((current) => {
      const existing = current[optionId] ?? [];

      if (existing.includes(valueId)) {
        return { ...current, [optionId]: existing.filter((id) => id !== valueId) };
      }

      if (maximumChoices === 1) {
        return { ...current, [optionId]: [valueId] };
      }

      if (existing.length >= maximumChoices) {
        return current;
      }

      return { ...current, [optionId]: [...existing, valueId] };
    });
  }

  function handleAdd() {
    for (const option of product.options) {
      const count = (selected[option.id] ?? []).length;
      if (option.required && count < Math.max(option.minimumChoices, 1)) {
        setError(`Du ma velge ${option.name.toLowerCase()}.`);
        return;
      }
    }

    addLine(
      {
        productId: product.id,
        name: product.name,
        unitPrice,
        optionValueIds: chosenValues.map(({ value }) => value.id),
        optionLabels: chosenValues.map(({ value }) => value.name),
        comment: comment.trim() ? comment.trim() : undefined,
        preparationMinutes: product.preparationMinutes,
        requiresAgeVerification: product.requiresAgeVerification,
      },
      quantity,
    );

    onClose();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-label={product.name}
        onClick={(event) => event.stopPropagation()}
        className="safe-bottom max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5"
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-fairway-100" />

        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold text-fairway-900">{product.name}</h2>
          <span className="text-lg font-semibold text-fairway-800">
            {formatAmount(product.price)}
          </span>
        </div>

        {product.description ? (
          <p className="mt-2 text-sm text-fairway-700">{product.description}</p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge tone="neutral">Tilberedes pa ca. {product.preparationMinutes} min</Badge>
          {product.requiresAgeVerification ? (
            <Badge tone="warning">Legitimasjon ved levering</Badge>
          ) : null}
        </div>

        {product.allergens.length > 0 ? (
          <p className="mt-3 text-sm text-fairway-700">
            <span className="font-semibold">Allergener:</span> {product.allergens.join(", ")}
          </p>
        ) : (
          <p className="mt-3 text-sm text-fairway-600">Ingen registrerte allergener.</p>
        )}

        {product.options.map((option) => (
          <fieldset key={option.id} className="mt-5">
            <legend className="text-sm font-semibold text-fairway-900">
              {option.name}
              {option.required ? (
                <span className="ml-2 text-xs font-normal text-red-600">Pakrevd</span>
              ) : (
                <span className="ml-2 text-xs font-normal text-fairway-600">
                  Velg inntil {option.maximumChoices}
                </span>
              )}
            </legend>

            <div className="mt-2 space-y-2">
              {option.values.map((value) => {
                const checked = (selected[option.id] ?? []).includes(value.id);
                return (
                  <label
                    key={value.id}
                    className={
                      value.isAvailable
                        ? "flex cursor-pointer items-center gap-3 rounded-xl border border-fairway-200 p-3"
                        : "flex items-center gap-3 rounded-xl border border-fairway-100 p-3 opacity-50"
                    }
                  >
                    <input
                      type={option.maximumChoices === 1 ? "radio" : "checkbox"}
                      name={option.id}
                      checked={checked}
                      disabled={!value.isAvailable}
                      onChange={() => toggle(option.id, value.id, option.maximumChoices)}
                      className="size-5 accent-fairway-600"
                    />
                    <span className="flex-1 text-sm text-fairway-900">{value.name}</span>
                    {value.additionalPrice > 0 ? (
                      <span className="text-sm text-fairway-700">
                        + {formatAmount(value.additionalPrice)}
                      </span>
                    ) : null}
                    {!value.isAvailable ? <Badge tone="danger">Utsolgt</Badge> : null}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}

        <label className="mt-5 block">
          <span className="text-sm font-semibold text-fairway-900">Kommentar til kjokkenet</span>
          <input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={280}
            placeholder="For eksempel: uten lok"
            className="mt-1 w-full rounded-xl border border-fairway-200 px-3 py-2.5 text-sm"
          />
        </label>

        {error ? <p className="mt-3 text-sm font-medium text-red-600">{error}</p> : null}

        <div className="mt-5 flex items-center gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-fairway-200 px-3 py-2">
            <button
              type="button"
              aria-label="Farre"
              onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              className="text-xl font-bold text-fairway-700"
            >
              −
            </button>
            <span className="w-6 text-center font-semibold">{quantity}</span>
            <button
              type="button"
              aria-label="Flere"
              onClick={() => setQuantity((value) => Math.min(20, value + 1))}
              className="text-xl font-bold text-fairway-700"
            >
              +
            </button>
          </div>

          <Button size="lg" className="flex-1" onClick={handleAdd}>
            Legg til {formatAmount(unitPrice * quantity)}
          </Button>
        </div>

        <Button variant="ghost" className="mt-2 w-full" onClick={onClose}>
          Avbryt
        </Button>
      </div>
    </div>
  );
}
