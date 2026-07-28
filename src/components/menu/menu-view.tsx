"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ProductSheet } from "@/components/menu/product-sheet";
import { Alert, Badge, Card } from "@/components/ui";
import { cartItemCount, cartSubtotal, useCart } from "@/lib/cart-store";
import { formatAmount } from "@/lib/money";
import type { getAvailability } from "@/server/services/menu";
import type { ClubSummary, MenuCategory, MenuProduct } from "@/server/services/menu";

type Availability = Awaited<ReturnType<typeof getAvailability>>;

export function MenuView({
  club,
  categories,
  availability,
}: {
  club: ClubSummary;
  categories: MenuCategory[];
  availability: Availability;
}) {
  const setClub = useCart((state) => state.setClub);
  const lines = useCart((state) => state.lines);
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id ?? null);
  const [selectedProduct, setSelectedProduct] = useState<MenuProduct | null>(null);

  useEffect(() => {
    setClub(club.slug);
  }, [club.slug, setClub]);

  const itemCount = cartItemCount(lines);
  const subtotal = cartSubtotal(lines);

  const visibleCategory = useMemo(
    () => categories.find((category) => category.id === activeCategory) ?? categories[0],
    [activeCategory, categories],
  );

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col">
      <header className="sticky top-0 z-20 border-b border-fairway-100 bg-sand-50/95 backdrop-blur">
        <div className="px-4 pt-5 pb-3">
          <p className="text-xs font-semibold tracking-wide text-fairway-600 uppercase">
            Bestilling pa banen
          </p>
          <h1 className="mt-1 text-2xl font-bold text-fairway-900">{club.name}</h1>
          <p className="mt-1 text-sm text-fairway-700">
            Vi kjorer ut til deg. Velg varer, si hvor du er, og betal med Vipps eller kort.
          </p>
        </div>

        <nav className="flex gap-2 overflow-x-auto px-4 pb-3">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setActiveCategory(category.id)}
              className={
                category.id === visibleCategory?.id
                  ? "shrink-0 rounded-full bg-fairway-600 px-4 py-2 text-sm font-semibold text-white"
                  : "shrink-0 rounded-full border border-fairway-200 bg-white px-4 py-2 text-sm font-medium text-fairway-700"
              }
            >
              {category.name}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 space-y-4 px-4 py-4 pb-32">
        {!availability.isOrderingEnabled ? (
          <Alert tone="warning" title="Bestilling er satt pa pause">
            {availability.reasons[0] ??
              "Restauranten tar ikke imot bestillinger akkurat na. Prov igjen senere."}
          </Alert>
        ) : availability.isCourseDeliveryPaused ? (
          <Alert tone="warning" title="Levering pa banen er pauset">
            {availability.courseDeliveryMessage}
          </Alert>
        ) : null}

        {visibleCategory?.description ? (
          <p className="text-sm text-fairway-700">{visibleCategory.description}</p>
        ) : null}

        <ul className="space-y-3">
          {visibleCategory?.products.map((product) => (
            <li key={product.id}>
              <ProductCard
                product={product}
                disabled={!availability.isOrderingEnabled}
                onSelect={() => setSelectedProduct(product)}
              />
            </li>
          ))}
        </ul>

        <p className="pt-2 text-center text-xs text-fairway-600">
          Allergener og tilberedningstid star pa hvert produkt. Spor gjerne restauranten hvis du
          lurer pa noe.
        </p>
      </main>

      {itemCount > 0 ? (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-fairway-100 bg-white px-4 pt-3">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-fairway-900">
                {itemCount} {itemCount === 1 ? "vare" : "varer"}
              </p>
              <p className="text-xs text-fairway-600">{formatAmount(subtotal)}</p>
            </div>
            <Link
              href={`/${club.slug}/kasse`}
              aria-disabled={!availability.isOrderingEnabled}
              className={
                availability.isOrderingEnabled
                  ? "flex-1 rounded-xl bg-fairway-600 px-5 py-3.5 text-center text-base font-semibold text-white"
                  : "pointer-events-none flex-1 rounded-xl bg-fairway-300 px-5 py-3.5 text-center text-base font-semibold text-white"
              }
            >
              Til bestilling
            </Link>
          </div>
        </div>
      ) : null}

      {selectedProduct ? (
        <ProductSheet product={selectedProduct} onClose={() => setSelectedProduct(null)} />
      ) : null}
    </div>
  );
}

function ProductCard({
  product,
  disabled,
  onSelect,
}: {
  product: MenuProduct;
  disabled: boolean;
  onSelect: () => void;
}) {
  const unavailable = !product.isAvailable;

  return (
    <Card className={unavailable ? "opacity-60" : undefined}>
      <button
        type="button"
        onClick={onSelect}
        disabled={unavailable || disabled}
        className="flex w-full gap-3 p-3 text-left disabled:cursor-not-allowed"
      >
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt=""
            className="size-20 shrink-0 rounded-xl object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex size-20 shrink-0 items-center justify-center rounded-xl bg-fairway-50 text-2xl">
            {emojiFor(product.name)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-fairway-900">{product.name}</h3>
            <span className="shrink-0 font-semibold text-fairway-800">
              {formatAmount(product.price)}
            </span>
          </div>

          {product.description ? (
            <p className="mt-0.5 line-clamp-2 text-sm text-fairway-700">{product.description}</p>
          ) : null}

          <div className="mt-2 flex flex-wrap gap-1.5">
            {unavailable ? <Badge tone="danger">Utsolgt</Badge> : null}
            <Badge tone="neutral">{product.preparationMinutes} min</Badge>
            {product.requiresAgeVerification ? (
              <Badge tone="warning">Legitimasjon kreves</Badge>
            ) : null}
            {product.allergens.slice(0, 3).map((allergen) => (
              <Badge key={allergen} tone="info">
                {allergen}
              </Badge>
            ))}
          </div>
        </div>
      </button>
    </Card>
  );
}

function emojiFor(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("kaffe")) return "☕";
  if (lower.includes("burger")) return "🍔";
  if (lower.includes("polse")) return "🌭";
  if (lower.includes("is")) return "🍦";
  if (lower.includes("ol") || lower.includes("cider")) return "🍺";
  if (lower.includes("vann") || lower.includes("cola") || lower.includes("brus")) return "🥤";
  if (lower.includes("baguette") || lower.includes("panini")) return "🥖";
  return "🍽️";
}
