"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { OrderDetail } from "@/components/admin/order-detail";
import { Alert, Badge, Button, Card, Spinner } from "@/components/ui";
import { apiGet, apiPost } from "@/lib/api";
import { formatAmount } from "@/lib/money";
import { useRealtimeChannel } from "@/lib/use-realtime";
import type { AdminOrderListItem } from "@/server/services/order-views";

import { OrderStatus } from "@/generated/prisma/enums";

const COLUMNS: { title: string; statuses: OrderStatus[] }[] = [
  { title: "Nye", statuses: [OrderStatus.PENDING_RESTAURANT, OrderStatus.ACCEPTING] },
  { title: "Godkjent", statuses: [OrderStatus.ACCEPTED] },
  { title: "Tilberedes", statuses: [OrderStatus.PREPARING] },
  { title: "Klar", statuses: [OrderStatus.READY_FOR_DELIVERY] },
  { title: "Pa vei", statuses: [OrderStatus.OUT_FOR_DELIVERY] },
  {
    title: "Fullfort",
    statuses: [OrderStatus.DELIVERED, OrderStatus.DECLINED, OrderStatus.CANCELLED],
  },
];

/** Bestillinger som har ventet lenger enn dette markeres som forsinket, jf. paragraf 11. */
const LATE_MINUTES = 5;

export function OrdersBoard({
  clubId,
  clubName,
  initialOrders,
  drivers,
  isOrderingEnabled,
  isCourseDeliveryPaused,
  defaultPrepMinutes,
}: {
  clubId: string;
  clubName: string;
  initialOrders: AdminOrderListItem[];
  drivers: { id: string; name: string; role: string }[];
  isOrderingEnabled: boolean;
  isCourseDeliveryPaused: boolean;
  defaultPrepMinutes: number;
}) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pauseBusy, setPauseBusy] = useState(false);
  const [ordering, setOrdering] = useState({ isOrderingEnabled, isCourseDeliveryPaused });

  const { data: orders = initialOrders, isFetching } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const result = await apiGet<{ orders: AdminOrderListItem[] }>("/api/admin/orders");
      return result.orders;
    },
    initialData: initialOrders,
    refetchInterval: 20_000,
  });

  useRealtimeChannel(
    `club:${clubId}:orders`,
    () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-order", selectedId] });
    },
    { isPrivate: true },
  );

  const newCount = orders.filter(
    (order) => order.status === OrderStatus.PENDING_RESTAURANT,
  ).length;

  async function togglePause(scope: "ALL" | "COURSE_DELIVERY" | "RESUME") {
    setPauseBusy(true);
    try {
      const result =
        scope === "RESUME"
          ? await apiPost<{ isOrderingEnabled: boolean; isCourseDeliveryPaused: boolean }>(
              "/api/admin/ordering/resume",
            )
          : await apiPost<{ isOrderingEnabled: boolean; isCourseDeliveryPaused: boolean }>(
              "/api/admin/ordering/pause",
              {
                scope,
                message:
                  scope === "ALL"
                    ? "Det er stor pagang. Vi tar dessverre ikke imot nye bestillinger akkurat na."
                    : "Det er stor pagang. Levering pa banen er pauset, men du kan hente i restauranten.",
              },
            );
      setOrdering(result);
    } finally {
      setPauseBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-5">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fairway-900">Bestillinger</h1>
          <p className="text-sm text-fairway-700">{clubName}</p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {isFetching ? <Spinner className="text-fairway-500" /> : null}
          {newCount > 0 ? (
            <Badge tone="warning">
              {newCount} {newCount === 1 ? "ny bestilling" : "nye bestillinger"}
            </Badge>
          ) : null}

          {ordering.isOrderingEnabled && !ordering.isCourseDeliveryPaused ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                disabled={pauseBusy}
                onClick={() => togglePause("COURSE_DELIVERY")}
              >
                Pause levering pa banen
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={pauseBusy}
                onClick={() => togglePause("ALL")}
              >
                Pause alle bestillinger
              </Button>
            </>
          ) : (
            <Button size="sm" disabled={pauseBusy} onClick={() => togglePause("RESUME")}>
              Gjenoppta bestillinger
            </Button>
          )}
        </div>
      </header>

      {!ordering.isOrderingEnabled ? (
        <div className="mt-4">
          <Alert tone="danger" title="Bestillinger er stengt">
            Kundene ser at dere ikke tar imot bestillinger akkurat na.
          </Alert>
        </div>
      ) : ordering.isCourseDeliveryPaused ? (
        <div className="mt-4">
          <Alert tone="warning" title="Levering pa banen er pauset">
            Kundene kan fortsatt bestille for henting i restauranten.
          </Alert>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {COLUMNS.map((column) => {
          const columnOrders = orders.filter((order) => column.statuses.includes(order.status));

          return (
            <section key={column.title} className="min-w-0">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-bold tracking-wide text-fairway-700 uppercase">
                {column.title}
                <span className="rounded-full bg-fairway-100 px-2 py-0.5 text-xs">
                  {columnOrders.length}
                </span>
              </h2>

              <div className="space-y-2">
                {columnOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onSelect={() => setSelectedId(order.id)}
                  />
                ))}

                {columnOrders.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-fairway-200 p-3 text-xs text-fairway-500">
                    Ingen bestillinger
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      {selectedId ? (
        <OrderDetail
          orderId={selectedId}
          drivers={drivers}
          defaultPrepMinutes={defaultPrepMinutes}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}

function OrderCard({ order, onSelect }: { order: AdminOrderListItem; onSelect: () => void }) {
  const waitedMinutes = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60_000);
  const isLate = order.status === OrderStatus.PENDING_RESTAURANT && waitedMinutes >= LATE_MINUTES;

  return (
    <Card
      className={
        isLate
          ? "cursor-pointer border-2 border-amber-400 p-3 transition hover:shadow-md"
          : "cursor-pointer p-3 transition hover:shadow-md"
      }
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-bold text-fairway-900">#{order.orderNumber}</span>
        <span className={isLate ? "text-xs font-bold text-amber-700" : "text-xs text-fairway-600"}>
          {waitedMinutes} min
        </span>
      </div>

      <p className="mt-1 text-sm text-fairway-800">
        {order.itemCount} {order.itemCount === 1 ? "vare" : "varer"} ·{" "}
        {formatAmount(order.totalAmount)}
      </p>

      <p className="mt-1 text-sm font-medium text-fairway-900">
        {order.holeNumber ? `Hull ${order.holeNumber}` : "Henting"}
        {order.deliveryPointName ? ` · ${order.deliveryPointName}` : ""}
      </p>

      <div className="mt-2 flex flex-wrap gap-1">
        <Badge tone={paymentTone(order.paymentStatus)}>{paymentLabel(order.paymentStatus)}</Badge>

        {order.estimatedDeliveryAt ? (
          <Badge tone="info">
            {new Date(order.estimatedDeliveryAt).toLocaleTimeString("nb-NO", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Badge>
        ) : null}

        {order.location?.isStale ? (
          <Badge tone="warning">Posisjon {order.location.ageMinutes} min gammel</Badge>
        ) : order.location ? (
          <Badge tone="success">Posisjon fersk</Badge>
        ) : (
          <Badge tone="neutral">Ingen GPS</Badge>
        )}
      </div>
    </Card>
  );
}

function paymentLabel(status: string): string {
  switch (status) {
    case "AUTHORIZED":
      return "Reservert";
    case "CAPTURED":
      return "Trukket";
    case "CANCELLED":
      return "Opphevet";
    case "REFUNDED":
      return "Refundert";
    case "EXPIRED":
      return "Utlopt";
    case "FAILED":
      return "Feilet";
    default:
      return "Venter";
  }
}

function paymentTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "CAPTURED") return "success";
  if (status === "AUTHORIZED") return "warning";
  if (status === "FAILED" || status === "EXPIRED") return "danger";
  return "neutral";
}
