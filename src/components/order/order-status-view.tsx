"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Alert, Badge, Button, Card, Spinner } from "@/components/ui";
import { apiGet, apiPost } from "@/lib/api";
import { formatAmount } from "@/lib/money";
import { useLocationTracking } from "@/lib/use-location-tracking";
import { useRealtimeChannel } from "@/lib/use-realtime";
import { CUSTOMER_STATUS_MESSAGES, STATUS_LABELS } from "@/server/orders/state-machine";
import type { CustomerOrderView } from "@/server/services/order-views";

import { OrderStatus } from "@/generated/prisma/enums";

/** Stegene kunden ser, jf. paragraf 13.6. */
const STEPS: { status: OrderStatus; label: string }[] = [
  { status: OrderStatus.PENDING_RESTAURANT, label: "Bestillingen er mottatt" },
  { status: OrderStatus.ACCEPTED, label: "Bestillingen er godkjent" },
  { status: OrderStatus.PREPARING, label: "Maten tilberedes" },
  { status: OrderStatus.OUT_FOR_DELIVERY, label: "Maten er pa vei" },
  { status: OrderStatus.DELIVERED, label: "Maten er levert" },
];

const STEP_ORDER: OrderStatus[] = [
  OrderStatus.AWAITING_PAYMENT,
  OrderStatus.PAYMENT_AUTHORIZED,
  OrderStatus.PENDING_RESTAURANT,
  OrderStatus.ACCEPTING,
  OrderStatus.ACCEPTED,
  OrderStatus.PREPARING,
  OrderStatus.READY_FOR_DELIVERY,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
];

export function OrderStatusView({
  initialOrder,
  publicToken,
}: {
  initialOrder: CustomerOrderView;
  publicToken: string;
}) {
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: order = initialOrder, isFetching } = useQuery({
    queryKey: ["order", publicToken],
    queryFn: () => apiGet<CustomerOrderView>(`/api/orders/${publicToken}`),
    initialData: initialOrder,
    // Polling er reserven nar sanntid ikke kommer frem.
    refetchInterval: 15_000,
  });

  useRealtimeChannel(`order:${publicToken}`, () => {
    void queryClient.invalidateQueries({ queryKey: ["order", publicToken] });
  });

  const tracking = useLocationTracking(publicToken, order.shouldShareLocation);

  const isFailed =
    order.status === OrderStatus.DECLINED ||
    order.status === OrderStatus.CANCELLED ||
    order.status === OrderStatus.PAYMENT_FAILED;

  const currentIndex = STEP_ORDER.indexOf(order.status);

  async function handleCancel() {
    setCancelling(true);
    setActionError(null);

    try {
      await apiPost(`/api/orders/${publicToken}/cancel`);
      await queryClient.invalidateQueries({ queryKey: ["order", publicToken] });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Kunne ikke avbryte bestillingen.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-5">
      <header>
        <p className="text-xs font-semibold tracking-wide text-fairway-600 uppercase">
          {order.club.name}
        </p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-fairway-900">
            Bestilling {order.orderNumber}
          </h1>
          {isFetching ? <Spinner className="text-fairway-500" /> : null}
        </div>
      </header>

      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Badge tone={isFailed ? "danger" : order.status === OrderStatus.DELIVERED ? "success" : "info"}>
            {STATUS_LABELS[order.status]}
          </Badge>
          {order.estimatedDeliveryAt && !isFailed ? (
            <span className="text-sm font-semibold text-fairway-800">
              Forventet {formatTime(order.estimatedDeliveryAt)}
            </span>
          ) : null}
        </div>

        <p className="text-sm text-fairway-800">{CUSTOMER_STATUS_MESSAGES[order.status]}</p>

        {order.declineReason ? (
          <Alert tone="danger" title="Arsak fra restauranten">
            {order.declineReason}
            <p className="mt-2 text-xs">
              Betalingsreservasjonen er opphevet. Du er ikke belastet.
            </p>
          </Alert>
        ) : null}

        {!isFailed ? (
          <ol className="space-y-2 pt-1">
            {STEPS.map((step) => {
              const stepIndex = STEP_ORDER.indexOf(step.status);
              const reached = currentIndex >= stepIndex;
              const active = order.status === step.status;

              return (
                <li key={step.status} className="flex items-center gap-3">
                  <span
                    className={
                      reached
                        ? `flex size-6 shrink-0 items-center justify-center rounded-full bg-fairway-600 text-xs font-bold text-white ${active ? "pulse-ring" : ""}`
                        : "flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-fairway-200"
                    }
                  >
                    {reached ? "✓" : null}
                  </span>
                  <span
                    className={
                      reached ? "text-sm font-medium text-fairway-900" : "text-sm text-fairway-500"
                    }
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : null}
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="font-bold text-fairway-900">Leveringssted</h2>
        {order.holeNumber ? (
          <p className="text-sm text-fairway-800">
            Hull {order.holeNumber}
            {order.holePosition ? ` – ${positionLabel(order.holePosition)}` : ""}
          </p>
        ) : null}
        {order.deliveryPoint ? (
          <p className="text-sm text-fairway-800">{order.deliveryPoint.name}</p>
        ) : (
          <p className="text-sm text-fairway-700">{targetLabel(order.deliveryTargetType)}</p>
        )}
        {order.customerComment ? (
          <p className="text-sm text-fairway-700 italic">«{order.customerComment}»</p>
        ) : null}
      </Card>

      {order.shouldShareLocation ? (
        <Card className="space-y-3 p-4">
          <h2 className="font-bold text-fairway-900">Hjelp oss a finne deg</h2>
          <p className="text-sm text-fairway-700">
            Deler du posisjonen mens du spiller, ser leveringspersonen hvor du er. Vi lagrer bare
            siste posisjon, og den slettes automatisk innen 24 timer.
          </p>

          {tracking.error ? <Alert tone="warning">{tracking.error}</Alert> : null}

          {tracking.isSharing ? (
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-medium text-fairway-800">
                <span className="size-2.5 rounded-full bg-fairway-600 pulse-ring" />
                Deler posisjon
              </span>
              <Button variant="secondary" size="sm" onClick={tracking.stop}>
                Stopp deling
              </Button>
            </div>
          ) : (
            <Button variant="secondary" className="w-full" onClick={tracking.start}>
              Del posisjonen min
            </Button>
          )}
        </Card>
      ) : null}

      <Card className="space-y-2 p-4">
        <h2 className="font-bold text-fairway-900">Varer</h2>
        {order.items.map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
            <div>
              <p className="font-medium text-fairway-900">
                {item.quantity} × {item.name}
              </p>
              {item.options.length > 0 ? (
                <p className="text-xs text-fairway-600">
                  {item.options.map((option) => option.value).join(", ")}
                </p>
              ) : null}
              {item.comment ? (
                <p className="text-xs text-fairway-700 italic">«{item.comment}»</p>
              ) : null}
            </div>
            <span className="shrink-0 text-fairway-800">{formatAmount(item.totalPrice)}</span>
          </div>
        ))}

        <div className="space-y-1 border-t border-fairway-100 pt-2 text-sm">
          <div className="flex justify-between text-fairway-700">
            <span>Delsum</span>
            <span>{formatAmount(order.subtotalAmount)}</span>
          </div>
          <div className="flex justify-between text-fairway-700">
            <span>Levering</span>
            <span>{order.deliveryFee === 0 ? "Gratis" : formatAmount(order.deliveryFee)}</span>
          </div>
          <div className="flex justify-between font-bold text-fairway-900">
            <span>Totalt</span>
            <span>{formatAmount(order.totalAmount)}</span>
          </div>
        </div>
      </Card>

      {actionError ? <Alert tone="danger">{actionError}</Alert> : null}

      {order.canCancel ? (
        <Button variant="secondary" className="w-full" onClick={handleCancel} disabled={cancelling}>
          {cancelling ? <Spinner /> : null}
          Avbryt bestillingen
        </Button>
      ) : null}

      {order.club.phone ? (
        <a
          href={`tel:${order.club.phone}`}
          className="block rounded-xl border border-fairway-200 bg-white px-4 py-3 text-center text-sm font-semibold text-fairway-800"
        >
          Ring restauranten
        </a>
      ) : null}

      <Link
        href={`/${order.club.slug}`}
        className="block pb-8 text-center text-sm font-medium text-fairway-600"
      >
        Bestill mer
      </Link>
    </main>
  );
}

function formatTime(value: Date | string): string {
  return new Date(value).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}

function positionLabel(position: string): string {
  if (position === "TEE") return "ved utslagsstedet";
  if (position === "GREEN") return "ved green";
  return "pa fairway";
}

function targetLabel(target: string): string {
  switch (target) {
    case "CURRENT_POSITION":
      return "Levering der du er";
    case "NEXT_TEE":
      return "Levering ved neste utslagssted";
    case "RESTAURANT_PICKUP":
      return "Hentes i restauranten";
    case "KIOSK_PICKUP":
      return "Hentes i kiosken";
    default:
      return "Levering pa banen";
  }
}
