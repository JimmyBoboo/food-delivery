"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { HolePicker, type LocationReading } from "@/components/checkout/hole-picker";
import { Alert, Badge, Button, Card, Spinner } from "@/components/ui";
import { apiPost } from "@/lib/api";
import { cartPreparationMinutes, cartSubtotal, useCart } from "@/lib/cart-store";
import { formatAmount } from "@/lib/money";
import type { ClubSummary, DeliveryOption } from "@/server/services/menu";

import type { DeliveryTargetType, HolePosition } from "@/generated/prisma/enums";

/** Grovt anslag pa hvor lenge en flight bruker per hull. */
const MINUTES_PER_HOLE = 15;

type Props = {
  club: ClubSummary;
  holes: { holeNumber: number; name: string | null; isDeliveryEnabled: boolean }[];
  deliveryPoints: DeliveryOption[];
  isCourseDeliveryPaused: boolean;
};

export function CheckoutView({ club, holes, deliveryPoints, isCourseDeliveryPaused }: Props) {
  const router = useRouter();
  const lines = useCart((state) => state.lines);
  const setQuantity = useCart((state) => state.setQuantity);
  const clear = useCart((state) => state.clear);

  const [selectedHole, setSelectedHole] = useState<number | null>(null);
  const [suggestedHole, setSuggestedHole] = useState<number | null>(null);
  const [holePosition, setHolePosition] = useState<HolePosition | null>(null);
  const [location, setLocation] = useState<LocationReading | null>(null);
  const [deliveryTarget, setDeliveryTarget] = useState<DeliveryTargetType>(
    isCourseDeliveryPaused ? "RESTAURANT_PICKUP" : "NEXT_TEE",
  );
  const [deliveryPointId, setDeliveryPointId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerComment, setCustomerComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nokkelen lages en gang per kasse-okt, slik at gjentatte trykk pa
  // betalingsknappen ikke oppretter flere bestillinger.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const subtotal = cartSubtotal(lines);
  const prepMinutes = Math.max(cartPreparationMinutes(lines), club.defaultPrepMinutes);
  const isPickup = deliveryTarget === "RESTAURANT_PICKUP" || deliveryTarget === "KIOSK_PICKUP";

  const deliveryFee =
    isPickup || (club.freeDeliveryThreshold !== null && subtotal >= club.freeDeliveryThreshold)
      ? 0
      : club.deliveryFee;

  const total = subtotal + deliveryFee;

  const pickupPoints = deliveryPoints.filter((point) => point.isPickup);
  const coursePoints = deliveryPoints.filter((point) => !point.isPickup);

  /** Foreslar et motepunkt lenger fremme pa banen, jf. paragraf 13.1. */
  const recommendedHole = useMemo(() => {
    if (selectedHole === null) return null;
    const holesAhead = Math.max(1, Math.round(prepMinutes / MINUTES_PER_HOLE));
    const candidate = selectedHole + holesAhead;
    const maxHole = holes.at(-1)?.holeNumber ?? 18;
    return candidate > maxHole ? null : candidate;
  }, [holes, prepMinutes, selectedHole]);

  const requiresAgeCheck = lines.some((line) => line.requiresAgeVerification);

  if (lines.length === 0) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-10">
        <h1 className="text-xl font-bold text-fairway-900">Handlekurven er tom</h1>
        <p className="text-sm text-fairway-700">Legg til noe godt fra menyen forst.</p>
        <Link
          href={`/${club.slug}`}
          className="inline-block rounded-xl bg-fairway-600 px-5 py-3 font-semibold text-white"
        >
          Tilbake til menyen
        </Link>
      </main>
    );
  }

  function validate(): string | null {
    if (customerName.trim().length < 2) return "Skriv inn navnet ditt.";
    if (customerPhone.trim().length < 8) return "Skriv inn et telefonnummer vi kan na deg pa.";
    if (!isPickup && selectedHole === null) return "Velg hvilket hull du er pa.";
    if (deliveryTarget === "SPECIFIC_HOLE" && !deliveryPointId)
      return "Velg hvilket leveringspunkt du vil mote oss pa.";
    if (isPickup && !deliveryPointId) return "Velg hvor du vil hente bestillingen.";
    return null;
  }

  async function handleSubmit() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const order = await apiPost<{ publicToken: string }>("/api/orders", {
        clubSlug: club.slug,
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          optionValueIds: line.optionValueIds,
          comment: line.comment,
        })),
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim() || undefined,
        selectedHoleNumber: selectedHole,
        selectedHolePosition: holePosition,
        suggestedHoleNumber: suggestedHole,
        deliveryTargetType: deliveryTarget,
        deliveryPointId,
        customerComment: customerComment.trim() || undefined,
        location,
        idempotencyKey,
      });

      const session = await apiPost<{ redirectUrl: string }>(
        `/api/orders/${order.publicToken}/payment-session`,
      );

      clear();
      window.location.href = session.redirectUrl;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Noe gikk galt.");
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-5 pb-32">
      <header>
        <Link href={`/${club.slug}`} className="text-sm font-medium text-fairway-600">
          ← Tilbake til menyen
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-fairway-900">Fullfor bestillingen</h1>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-fairway-900">Din bestilling</h2>
        {lines.map((line) => (
          <Card key={line.key} className="flex items-start gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-fairway-900">{line.name}</p>
              {line.optionLabels.length > 0 ? (
                <p className="text-xs text-fairway-600">{line.optionLabels.join(", ")}</p>
              ) : null}
              {line.comment ? (
                <p className="mt-0.5 text-xs text-fairway-700 italic">«{line.comment}»</p>
              ) : null}
              <p className="mt-1 text-sm text-fairway-700">
                {formatAmount(line.unitPrice)} per stk
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-fairway-200 px-2 py-1">
              <button
                type="button"
                aria-label={`Farre ${line.name}`}
                onClick={() => setQuantity(line.key, line.quantity - 1)}
                className="px-1 text-lg font-bold text-fairway-700"
              >
                −
              </button>
              <span className="w-5 text-center text-sm font-semibold">{line.quantity}</span>
              <button
                type="button"
                aria-label={`Flere ${line.name}`}
                onClick={() => setQuantity(line.key, line.quantity + 1)}
                className="px-1 text-lg font-bold text-fairway-700"
              >
                +
              </button>
            </div>
          </Card>
        ))}
      </section>

      {requiresAgeCheck ? (
        <Alert tone="warning" title="Aldersgrense">
          Bestillingen inneholder varer med aldersgrense. Ha legitimasjon klar ved levering.
        </Alert>
      ) : null}

      <HolePicker
        clubSlug={club.slug}
        holes={holes}
        selectedHole={selectedHole}
        onSelectHole={setSelectedHole}
        holePosition={holePosition}
        onSelectPosition={setHolePosition}
        onLocation={setLocation}
        onSuggestion={setSuggestedHole}
      />

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-fairway-900">Hvor vil du ha maten?</h2>
          <p className="mt-1 text-sm text-fairway-700">
            Beregnet tilberedning er omtrent {prepMinutes} minutter. Da har du gjerne rukket a ga
            videre.
          </p>
        </div>

        {recommendedHole && !isCourseDeliveryPaused ? (
          <Alert tone="info">
            Vi anbefaler levering ved utslagsstedet pa hull {recommendedHole}.
          </Alert>
        ) : null}

        {isCourseDeliveryPaused ? (
          <Alert tone="warning">
            Levering pa banen er pauset akkurat na. Du kan hente bestillingen i restauranten.
          </Alert>
        ) : null}

        <div className="space-y-2">
          {!isCourseDeliveryPaused ? (
            <>
              <DeliveryChoice
                checked={deliveryTarget === "CURRENT_POSITION"}
                title="Lever der jeg er na"
                description={
                  selectedHole ? `Hull ${selectedHole}` : "Velg hull lenger opp forst"
                }
                onSelect={() => {
                  setDeliveryTarget("CURRENT_POSITION");
                  setDeliveryPointId(null);
                }}
              />
              <DeliveryChoice
                checked={deliveryTarget === "NEXT_TEE"}
                title="Lever ved neste utslagssted"
                description={
                  selectedHole
                    ? `Vi moter deg ved hull ${Math.min(selectedHole + 1, holes.at(-1)?.holeNumber ?? 18)}`
                    : "Vanligvis det mest praktiske"
                }
                onSelect={() => {
                  setDeliveryTarget("NEXT_TEE");
                  setDeliveryPointId(null);
                }}
              />
              <DeliveryChoice
                checked={deliveryTarget === "SPECIFIC_HOLE"}
                title="Lever ved et bestemt punkt"
                description="Velg fra listen over faste leveringspunkter"
                onSelect={() => setDeliveryTarget("SPECIFIC_HOLE")}
              />
            </>
          ) : null}

          <DeliveryChoice
            checked={isPickup}
            title="Jeg henter selv"
            description="I restauranten, kiosken eller halfway house"
            onSelect={() => {
              setDeliveryTarget("RESTAURANT_PICKUP");
              setDeliveryPointId(null);
            }}
          />
        </div>

        {deliveryTarget === "SPECIFIC_HOLE" ? (
          <select
            value={deliveryPointId ?? ""}
            onChange={(event) => setDeliveryPointId(event.target.value || null)}
            className="w-full rounded-xl border border-fairway-200 bg-white px-3 py-3 text-base"
          >
            <option value="">Velg leveringspunkt</option>
            {coursePoints.map((point) => (
              <option key={point.id} value={point.id}>
                {point.name}
              </option>
            ))}
          </select>
        ) : null}

        {isPickup ? (
          <select
            value={deliveryPointId ?? ""}
            onChange={(event) => {
              const point = pickupPoints.find((candidate) => candidate.id === event.target.value);
              setDeliveryPointId(event.target.value || null);
              setDeliveryTarget(
                point?.name.toLowerCase().includes("kiosk") ? "KIOSK_PICKUP" : "RESTAURANT_PICKUP",
              );
            }}
            className="w-full rounded-xl border border-fairway-200 bg-white px-3 py-3 text-base"
          >
            <option value="">Velg hentested</option>
            {pickupPoints.map((point) => (
              <option key={point.id} value={point.id}>
                {point.name}
              </option>
            ))}
          </select>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-fairway-900">Kontaktinformasjon</h2>
        <p className="text-sm text-fairway-700">
          Du trenger ingen konto. Vi bruker nummeret hvis vi ikke finner deg pa banen.
        </p>

        <label className="block">
          <span className="text-sm font-semibold text-fairway-900">Navn</span>
          <input
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            autoComplete="name"
            className="mt-1 w-full rounded-xl border border-fairway-200 px-3 py-3 text-base"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-fairway-900">Telefon</span>
          <input
            value={customerPhone}
            onChange={(event) => setCustomerPhone(event.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder="+47 900 00 000"
            className="mt-1 w-full rounded-xl border border-fairway-200 px-3 py-3 text-base"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-fairway-900">
            E-post <span className="font-normal text-fairway-600">(valgfritt)</span>
          </span>
          <input
            value={customerEmail}
            onChange={(event) => setCustomerEmail(event.target.value)}
            inputMode="email"
            autoComplete="email"
            className="mt-1 w-full rounded-xl border border-fairway-200 px-3 py-3 text-base"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-fairway-900">
            Kommentar til restauranten <span className="font-normal text-fairway-600">(valgfritt)</span>
          </span>
          <textarea
            value={customerComment}
            onChange={(event) => setCustomerComment(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder="For eksempel: vi er en flight pa fire, gul golfbil"
            className="mt-1 w-full rounded-xl border border-fairway-200 px-3 py-3 text-base"
          />
        </label>
      </section>

      <Card className="space-y-2 p-4">
        <Row label="Delsum" value={formatAmount(subtotal)} />
        <Row
          label="Levering"
          value={deliveryFee === 0 ? "Gratis" : formatAmount(deliveryFee)}
        />
        <div className="border-t border-fairway-100 pt-2">
          <Row label="Totalt" value={formatAmount(total)} strong />
        </div>
        <p className="text-xs text-fairway-600">
          Belopet reserveres na og trekkes forst nar restauranten har godkjent bestillingen. Blir
          den avslatt, oppheves reservasjonen automatisk.
        </p>
      </Card>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="safe-bottom fixed inset-x-0 bottom-0 border-t border-fairway-100 bg-white px-4 pt-3">
        <div className="mx-auto max-w-2xl">
          <Button
            size="lg"
            className="w-full"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? <Spinner /> : null}
            {submitting ? "Sender deg til betaling ..." : `Betal ${formatAmount(total)}`}
          </Button>
          <p className="mt-2 text-center text-xs text-fairway-600">
            Vipps eller kort. Vi lagrer aldri kortopplysninger.
          </p>
        </div>
      </div>
    </main>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? "font-bold text-fairway-900" : "text-sm text-fairway-700"}>
        {label}
      </span>
      <span className={strong ? "text-lg font-bold text-fairway-900" : "text-sm text-fairway-800"}>
        {value}
      </span>
    </div>
  );
}

function DeliveryChoice({
  checked,
  title,
  description,
  onSelect,
}: {
  checked: boolean;
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        checked
          ? "flex w-full items-start gap-3 rounded-xl border-2 border-fairway-600 bg-fairway-50 p-3 text-left"
          : "flex w-full items-start gap-3 rounded-xl border border-fairway-200 bg-white p-3 text-left"
      }
    >
      <span
        className={
          checked
            ? "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-fairway-600"
            : "mt-0.5 size-5 shrink-0 rounded-full border-2 border-fairway-200"
        }
      >
        {checked ? <span className="size-2.5 rounded-full bg-fairway-600" /> : null}
      </span>
      <span>
        <span className="block text-sm font-semibold text-fairway-900">{title}</span>
        <span className="block text-xs text-fairway-600">{description}</span>
      </span>
    </button>
  );
}

export function CheckoutBadge({ children }: { children: React.ReactNode }) {
  return <Badge tone="info">{children}</Badge>;
}
