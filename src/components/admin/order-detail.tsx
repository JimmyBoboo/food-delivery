"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Alert, Badge, Button, Card, Spinner } from "@/components/ui";
import { apiGet, apiPost } from "@/lib/api";
import { formatAmount } from "@/lib/money";
import { STATUS_LABELS } from "@/server/orders/state-machine";
import type { getOrderForStaff } from "@/server/services/order-views";
import { DECLINE_REASONS } from "@/server/validation";

import { OrderStatus } from "@/generated/prisma/enums";

type StaffOrder = Awaited<ReturnType<typeof getOrderForStaff>>;

const ETA_CHOICES = [10, 15, 20, 30];

const NEXT_STATUS: Partial<Record<OrderStatus, { status: OrderStatus; label: string }[]>> = {
  ACCEPTED: [{ status: OrderStatus.PREPARING, label: "Start tilberedning" }],
  PREPARING: [{ status: OrderStatus.READY_FOR_DELIVERY, label: "Marker som klar" }],
  READY_FOR_DELIVERY: [
    { status: OrderStatus.OUT_FOR_DELIVERY, label: "Hentet, pa vei ut" },
    { status: OrderStatus.DELIVERED, label: "Levert" },
  ],
  OUT_FOR_DELIVERY: [{ status: OrderStatus.DELIVERED, label: "Marker som levert" }],
};

export function OrderDetail({
  orderId,
  drivers,
  defaultPrepMinutes,
  onClose,
}: {
  orderId: string;
  drivers: { id: string; name: string; role: string }[];
  defaultPrepMinutes: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [etaMinutes, setEtaMinutes] = useState(defaultPrepMinutes);
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState<string>(DECLINE_REASONS[0]);
  const [customReason, setCustomReason] = useState("");

  const { data: order, isLoading } = useQuery({
    queryKey: ["admin-order", orderId],
    queryFn: () => apiGet<StaffOrder>(`/api/admin/orders/${orderId}`),
    refetchInterval: 20_000,
  });

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-order", orderId] }),
        queryClient.invalidateQueries({ queryKey: ["admin-orders"] }),
      ]);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Handlingen feilet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" onClick={onClose}>
      <aside
        onClick={(event) => event.stopPropagation()}
        className="h-full w-full max-w-lg overflow-y-auto bg-white p-5 shadow-xl"
      >
        {isLoading || !order ? (
          <div className="flex h-full items-center justify-center">
            <Spinner className="text-fairway-600" />
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-fairway-900">#{order.orderNumber}</h2>
                <p className="text-sm text-fairway-700">
                  Mottatt{" "}
                  {new Date(order.createdAt).toLocaleTimeString("nb-NO", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Lukk"
                className="text-2xl leading-none text-fairway-500"
              >
                ×
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone="info">{STATUS_LABELS[order.status]}</Badge>
              <Badge tone={order.paymentStatus === "CAPTURED" ? "success" : "warning"}>
                Betaling: {order.paymentStatus}
              </Badge>
              {order.acceptedByName ? (
                <Badge tone="neutral">Godkjent av {order.acceptedByName}</Badge>
              ) : null}
            </div>

            {error ? (
              <div className="mt-3">
                <Alert tone="danger">{error}</Alert>
              </div>
            ) : null}

            <Card className="mt-4 space-y-1 p-4">
              <h3 className="font-bold text-fairway-900">Levering</h3>
              <p className="text-sm text-fairway-800">
                {order.holeNumber ? `Hull ${order.holeNumber}` : "Henting i restauranten"}
                {order.holeName ? ` – ${order.holeName}` : ""}
                {order.holePosition ? ` (${order.holePosition.toLowerCase()})` : ""}
              </p>
              {order.deliveryPoint ? (
                <p className="text-sm text-fairway-800">
                  Motepunkt: {order.deliveryPoint.name}
                  {order.deliveryPoint.instructions
                    ? ` – ${order.deliveryPoint.instructions}`
                    : ""}
                </p>
              ) : null}
              {order.suggestedHoleNumber && order.suggestedHoleNumber !== order.holeNumber ? (
                <p className="text-xs text-fairway-600">
                  GPS foreslo hull {order.suggestedHoleNumber}, kunden valgte hull{" "}
                  {order.holeNumber}.
                </p>
              ) : null}

              {order.location ? (
                <div className="pt-1">
                  <p
                    className={
                      order.location.isStale
                        ? "text-sm font-medium text-amber-700"
                        : "text-sm font-medium text-fairway-800"
                    }
                  >
                    Siste posisjon {order.location.ageMinutes} min gammel, noyaktighet{" "}
                    {Math.round(order.location.accuracyMeters ?? 0)} m
                  </p>
                  <a
                    href={`https://www.google.com/maps?q=${order.location.latitude},${order.location.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold text-fairway-600 underline"
                  >
                    Apne posisjonen i kart
                  </a>
                </div>
              ) : (
                <p className="pt-1 text-sm text-fairway-600">
                  Ingen GPS-posisjon. Bruk hullet og motepunktet over.
                </p>
              )}
            </Card>

            <Card className="mt-3 space-y-1 p-4">
              <h3 className="font-bold text-fairway-900">Kunde</h3>
              <p className="text-sm text-fairway-800">{order.customerName}</p>
              <a
                href={`tel:${order.customerPhone}`}
                className="text-sm font-semibold text-fairway-600 underline"
              >
                {order.customerPhone}
              </a>
              {order.customerComment ? (
                <p className="pt-1 text-sm text-fairway-800 italic">«{order.customerComment}»</p>
              ) : null}
            </Card>

            <Card className="mt-3 space-y-2 p-4">
              <h3 className="font-bold text-fairway-900">Varer</h3>
              {order.items.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium text-fairway-900">
                      {item.quantity} × {item.name}
                    </p>
                    {item.options.length > 0 ? (
                      <p className="text-xs text-fairway-600">
                        {item.options
                          .map((option) => `${option.option}: ${option.value}`)
                          .join(" · ")}
                      </p>
                    ) : null}
                    {item.comment ? (
                      <p className="text-xs font-medium text-amber-700">«{item.comment}»</p>
                    ) : null}
                  </div>
                  <span className="shrink-0">{formatAmount(item.totalPrice)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-fairway-100 pt-2 font-bold">
                <span>Totalt</span>
                <span>{formatAmount(order.totalAmount)}</span>
              </div>
            </Card>

            {order.status === OrderStatus.PENDING_RESTAURANT && !declining ? (
              <Card className="mt-3 space-y-3 p-4">
                <h3 className="font-bold text-fairway-900">Forventet leveringstid</h3>
                <div className="flex flex-wrap gap-2">
                  {ETA_CHOICES.map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      onClick={() => setEtaMinutes(minutes)}
                      className={
                        etaMinutes === minutes
                          ? "rounded-xl border-2 border-fairway-600 bg-fairway-50 px-4 py-2 text-sm font-semibold"
                          : "rounded-xl border border-fairway-200 px-4 py-2 text-sm"
                      }
                    >
                      {minutes} min
                    </button>
                  ))}
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={etaMinutes}
                    onChange={(event) => setEtaMinutes(Number(event.target.value))}
                    className="w-24 rounded-xl border border-fairway-200 px-3 py-2 text-sm"
                    aria-label="Egendefinert antall minutter"
                  />
                </div>

                <Button
                  size="lg"
                  className="w-full"
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      apiPost(`/api/admin/orders/${orderId}/accept`, { etaMinutes }),
                    )
                  }
                >
                  {busy ? <Spinner /> : null}
                  Godkjenn og trekk betaling
                </Button>

                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={busy}
                  onClick={() => setDeclining(true)}
                >
                  Avsla bestillingen
                </Button>
              </Card>
            ) : null}

            {declining ? (
              <Card className="mt-3 space-y-3 p-4">
                <h3 className="font-bold text-fairway-900">Hvorfor avslas bestillingen?</h3>
                <p className="text-sm text-fairway-700">
                  Kunden far arsaken, og betalingsreservasjonen oppheves automatisk.
                </p>

                <div className="space-y-2">
                  {DECLINE_REASONS.map((reason) => (
                    <label key={reason} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="decline"
                        checked={declineReason === reason}
                        onChange={() => setDeclineReason(reason)}
                        className="size-4 accent-fairway-600"
                      />
                      {reason}
                    </label>
                  ))}
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="decline"
                      checked={declineReason === "ANNET"}
                      onChange={() => setDeclineReason("ANNET")}
                      className="size-4 accent-fairway-600"
                    />
                    Annen arsak
                  </label>
                </div>

                {declineReason === "ANNET" ? (
                  <textarea
                    value={customReason}
                    onChange={(event) => setCustomReason(event.target.value)}
                    rows={3}
                    placeholder="Skriv arsaken kunden skal se"
                    className="w-full rounded-xl border border-fairway-200 px-3 py-2 text-sm"
                  />
                ) : null}

                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    className="flex-1"
                    disabled={
                      busy || (declineReason === "ANNET" && customReason.trim().length < 3)
                    }
                    onClick={() =>
                      run(async () => {
                        await apiPost(`/api/admin/orders/${orderId}/decline`, {
                          reason: declineReason === "ANNET" ? customReason.trim() : declineReason,
                        });
                        setDeclining(false);
                      })
                    }
                  >
                    Bekreft avslag
                  </Button>
                  <Button variant="secondary" className="flex-1" onClick={() => setDeclining(false)}>
                    Tilbake
                  </Button>
                </div>
              </Card>
            ) : null}

            {NEXT_STATUS[order.status] ? (
              <Card className="mt-3 space-y-2 p-4">
                <h3 className="font-bold text-fairway-900">Oppdater status</h3>
                {NEXT_STATUS[order.status]?.map((next) => (
                  <Button
                    key={next.status}
                    className="w-full"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        apiPost(`/api/admin/orders/${orderId}/status`, { status: next.status }),
                      )
                    }
                  >
                    {next.label}
                  </Button>
                ))}

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={etaMinutes}
                    onChange={(event) => setEtaMinutes(Number(event.target.value))}
                    className="w-24 rounded-xl border border-fairway-200 px-3 py-2 text-sm"
                    aria-label="Nytt antall minutter"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      run(() => apiPost(`/api/admin/orders/${orderId}/eta`, { etaMinutes }))
                    }
                  >
                    Oppdater leveringstid
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={order.assignedDriver?.id ?? ""}
                    onChange={(event) =>
                      run(() =>
                        apiPost(`/api/admin/orders/${orderId}/assign-driver`, {
                          driverId: event.target.value || null,
                        }),
                      )
                    }
                    className="flex-1 rounded-xl border border-fairway-200 px-3 py-2 text-sm"
                  >
                    <option value="">Ingen leveringsperson</option>
                    {drivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.name}
                      </option>
                    ))}
                  </select>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  disabled={busy}
                  onClick={() => run(() => apiPost(`/api/admin/orders/${orderId}/not-found`, {}))}
                >
                  Fant ikke kunden
                </Button>
              </Card>
            ) : null}

            <Button
              variant="secondary"
              className="mt-3 w-full"
              onClick={() => printKitchenSlip(order)}
            >
              Skriv ut kjokkenlapp
            </Button>

            <Card className="mt-3 p-4">
              <h3 className="font-bold text-fairway-900">Hendelseslogg</h3>
              <ol className="mt-2 space-y-2">
                {order.events.map((event) => (
                  <li key={event.id} className="border-l-2 border-fairway-100 pl-3 text-sm">
                    <p className="text-fairway-800">
                      {event.message ??
                        `${event.oldStatus ?? ""} → ${event.newStatus ?? event.type}`}
                    </p>
                    <p className="text-xs text-fairway-500">
                      {new Date(event.createdAt).toLocaleString("nb-NO")} ·{" "}
                      {event.performedByName ?? event.actorType.toLowerCase()}
                    </p>
                  </li>
                ))}
              </ol>
            </Card>
          </>
        )}
      </aside>
    </div>
  );
}

/** Enkel kjokkenlapp. Kan senere sendes rett til kvitteringsskriver, jf. paragraf 13.8. */
function printKitchenSlip(order: StaffOrder) {
  const lines = order.items
    .map((item) => {
      const options = item.options.map((option) => `    - ${option.value}`).join("\n");
      const comment = item.comment ? `\n    ! ${item.comment}` : "";
      return `${item.quantity} x ${item.name}${options ? `\n${options}` : ""}${comment}`;
    })
    .join("\n");

  const content = `
BESTILLING #${order.orderNumber}
${new Date(order.createdAt).toLocaleString("nb-NO")}

${lines}

Levering: ${order.holeNumber ? `Hull ${order.holeNumber}` : "Henting"}${
    order.deliveryPoint ? ` – ${order.deliveryPoint.name}` : ""
  }
Kunde: ${order.customerName}, ${order.customerPhone}
${order.customerComment ? `Kommentar: ${order.customerComment}` : ""}
Totalt: ${formatAmount(order.totalAmount)}
`.trim();

  const printWindow = window.open("", "_blank", "width=380,height=600");
  if (!printWindow) return;

  printWindow.document.write(
    `<pre style="font-family:monospace;font-size:13px;white-space:pre-wrap">${content.replace(
      /[<>&]/g,
      (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[character] ?? character,
    )}</pre>`,
  );
  printWindow.document.close();
  printWindow.print();
}
