"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ProductSheet } from "@/components/menu/product-sheet";
import { Alert, Badge, Card, cn } from "@/components/ui";
import {
  MAX_LINE_QUANTITY,
  cartItemCount,
  cartSubtotal,
  findPlainLine,
  productQuantity,
  useCart,
} from "@/lib/cart-store";
import { formatAmount } from "@/lib/money";
import type { getAvailability } from "@/server/services/menu";
import type { ClubSummary, MenuCategory, MenuProduct } from "@/server/services/menu";

type Availability = Awaited<ReturnType<typeof getAvailability>>;

function sectionId(categoryId: string): string {
  return `kategori-${categoryId}`;
}

/** Varer uten pakrevde tilvalg kan legges rett i kurven fra menyen. */
function isQuickAddable(product: MenuProduct): boolean {
  return product.options.every((option) => !option.required);
}

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
  const [selectedProduct, setSelectedProduct] = useState<MenuProduct | null>(null);
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id ?? null);
  const [navHeight, setNavHeight] = useState(0);
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setClub(club.slug);
  }, [club.slug, setClub]);

  // Kategorirada er klebrig og bryter over flere linjer, sa hoyden varierer med
  // skjermbredden. Vi maler den for a vite hvor mye plass hoppene ma spare.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const measure = () => setNavHeight(nav.offsetHeight);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);

  // Merker brikka til den overste synlige seksjonen, slik at kunden ser hvor i
  // menyen hun er uten a matte scrolle tilbake.
  useEffect(() => {
    if (categories.length === 0) return;

    const visible = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute("data-category-id");
          if (!id) continue;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }

        const topmost = categories.find((category) => visible.has(category.id));
        if (topmost) setActiveCategory(topmost.id);
      },
      { rootMargin: `-${navHeight + 8}px 0px 0px 0px` },
    );

    for (const category of categories) {
      const element = document.getElementById(sectionId(category.id));
      if (element) observer.observe(element);
    }

    return () => observer.disconnect();
  }, [categories, navHeight]);

  const itemCount = cartItemCount(lines);
  const subtotal = cartSubtotal(lines);

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col">
      <header className="px-4 pt-5 pb-3">
        <p className="text-xs font-semibold tracking-wide text-fairway-600 uppercase">
          Bestilling pa banen
        </p>
        <h1 className="mt-1 text-2xl font-bold text-fairway-900">{club.name}</h1>
        <p className="mt-1 text-sm text-fairway-700">
          Vi kjorer ut til deg. Velg varer, si hvor du er, og betal med Vipps eller kort.
        </p>
      </header>

      <nav
        ref={navRef}
        aria-label="Kategorier"
        className="sticky top-0 z-20 border-b border-fairway-100 bg-sand-50/95 px-4 py-2.5 backdrop-blur"
      >
        <ul className="flex flex-wrap gap-1.5">
          {categories.map((category) => (
            <li key={category.id}>
              <a
                href={`#${sectionId(category.id)}`}
                aria-current={category.id === activeCategory ? "location" : undefined}
                className={
                  category.id === activeCategory
                    ? "block rounded-full bg-fairway-600 px-3 py-1.5 text-sm font-semibold text-white"
                    : "block rounded-full border border-fairway-200 bg-white px-3 py-1.5 text-sm font-medium text-fairway-700"
                }
              >
                {category.name}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main className="flex-1 space-y-6 px-4 py-4 pb-32">
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

        {categories.map((category) => (
          <section
            key={category.id}
            id={sectionId(category.id)}
            data-category-id={category.id}
            style={{ scrollMarginTop: navHeight + 12 }}
          >
            <h2 className="text-lg font-bold text-fairway-900">{category.name}</h2>
            {category.description ? (
              <p className="mt-0.5 text-sm text-fairway-700">{category.description}</p>
            ) : null}

            <ul className="mt-3 space-y-2">
              {category.products.map((product) => (
                <li key={product.id}>
                  <ProductCard
                    product={product}
                    disabled={!availability.isOrderingEnabled}
                    onOpen={() => setSelectedProduct(product)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p className="pt-2 text-center text-xs text-fairway-600">
          Trykk pa en vare for allergener, tilberedningstid og tilvalg. Spor gjerne restauranten
          hvis du lurer pa noe.
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
  onOpen,
}: {
  product: MenuProduct;
  disabled: boolean;
  onOpen: () => void;
}) {
  const lines = useCart((state) => state.lines);
  const addLine = useCart((state) => state.addLine);
  const setQuantity = useCart((state) => state.setQuantity);

  const plainLine = findPlainLine(lines, product.id);
  const totalInCart = productQuantity(lines, product.id);
  const quickAdd = isQuickAddable(product);
  const unavailable = !product.isAvailable;
  const blocked = unavailable || disabled;

  function handleAdd() {
    if (!quickAdd) {
      onOpen();
      return;
    }

    addLine(
      {
        productId: product.id,
        name: product.name,
        unitPrice: product.price,
        optionValueIds: [],
        optionLabels: [],
        preparationMinutes: product.preparationMinutes,
        requiresAgeVerification: product.requiresAgeVerification,
      },
      1,
    );
  }

  return (
    <Card className={cn("relative flex items-center gap-3 p-3", unavailable && "opacity-60")}>
      {product.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.imageUrl}
          alt=""
          className="size-16 shrink-0 rounded-xl object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-fairway-50 text-2xl">
          {emojiFor(product.name)}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="min-w-0 font-semibold text-fairway-900">
            {/* Flaten strekker seg over hele kortet, slik at hvor som helst apner detaljene. */}
            <button
              type="button"
              onClick={onOpen}
              disabled={blocked}
              className="rounded text-left after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairway-600 disabled:cursor-not-allowed"
            >
              {product.name}
            </button>
          </h3>
          <span className="shrink-0 font-semibold text-fairway-800">
            {formatAmount(product.price)}
          </span>
        </div>

        {product.description ? (
          <p className="mt-0.5 line-clamp-1 text-sm text-fairway-700">{product.description}</p>
        ) : null}

        <div className="mt-1.5 flex flex-wrap gap-1.5 empty:mt-0">
          {unavailable ? <Badge tone="danger">Utsolgt</Badge> : null}
          {product.requiresAgeVerification ? (
            <Badge tone="warning">Legitimasjon kreves</Badge>
          ) : null}
          {totalInCart > (plainLine?.quantity ?? 0) ? (
            <Badge tone="success">{totalInCart} i kurven</Badge>
          ) : null}
        </div>
      </div>

      {!blocked ? (
        <div className="relative z-10 shrink-0">
          {plainLine ? (
            <div className="flex items-center rounded-full border border-fairway-200 bg-white">
              <button
                type="button"
                aria-label={`Farre ${product.name}`}
                onClick={() => setQuantity(plainLine.key, plainLine.quantity - 1)}
                className="size-10 text-lg font-bold text-fairway-700"
              >
                −
              </button>
              <span className="w-5 text-center text-sm font-semibold text-fairway-900">
                {plainLine.quantity}
              </span>
              <button
                type="button"
                aria-label={`Flere ${product.name}`}
                onClick={() =>
                  setQuantity(plainLine.key, Math.min(MAX_LINE_QUANTITY, plainLine.quantity + 1))
                }
                className="size-10 text-lg font-bold text-fairway-700"
              >
                +
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleAdd}
              aria-label={
                quickAdd
                  ? `Legg ${product.name} i kurven`
                  : `Velg tilvalg for ${product.name}`
              }
              className="flex size-11 items-center justify-center rounded-full bg-fairway-600 text-xl font-bold text-white"
            >
              +
            </button>
          )}
        </div>
      ) : null}
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
