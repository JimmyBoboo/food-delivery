import { OrderStatus } from "@/generated/prisma/enums";

/**
 * Tillatte statusoverganger, jf. paragraf 5.
 *
 * ACCEPTING er en las: bestillingen star i denne statusen mens betalingen
 * forsokes trukket, slik at to ansatte ikke kan behandle den samtidig.
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: [OrderStatus.AWAITING_PAYMENT, OrderStatus.CANCELLED],
  AWAITING_PAYMENT: [
    OrderStatus.PAYMENT_AUTHORIZED,
    OrderStatus.PAYMENT_FAILED,
    OrderStatus.CANCELLED,
  ],
  PAYMENT_AUTHORIZED: [OrderStatus.PENDING_RESTAURANT, OrderStatus.CANCELLED],
  PENDING_RESTAURANT: [
    OrderStatus.ACCEPTING,
    OrderStatus.DECLINED,
    OrderStatus.CANCELLED,
  ],
  ACCEPTING: [
    OrderStatus.ACCEPTED,
    OrderStatus.PENDING_RESTAURANT,
    OrderStatus.PAYMENT_FAILED,
    OrderStatus.DECLINED,
  ],
  ACCEPTED: [OrderStatus.PREPARING, OrderStatus.READY_FOR_DELIVERY, OrderStatus.REFUND_PENDING],
  PREPARING: [OrderStatus.READY_FOR_DELIVERY, OrderStatus.REFUND_PENDING],
  READY_FOR_DELIVERY: [
    OrderStatus.OUT_FOR_DELIVERY,
    OrderStatus.DELIVERED,
    OrderStatus.REFUND_PENDING,
  ],
  OUT_FOR_DELIVERY: [OrderStatus.DELIVERED, OrderStatus.REFUND_PENDING],
  DELIVERED: [OrderStatus.REFUND_PENDING],
  DECLINED: [OrderStatus.REFUND_PENDING, OrderStatus.REFUNDED],
  CANCELLED: [OrderStatus.REFUND_PENDING, OrderStatus.REFUNDED],
  PAYMENT_FAILED: [OrderStatus.AWAITING_PAYMENT, OrderStatus.CANCELLED],
  REFUND_PENDING: [OrderStatus.REFUNDED, OrderStatus.REFUND_PENDING],
  REFUNDED: [],
};

/** Statuser ansatte kan sette manuelt fra kontrollpanelet. */
export const STAFF_SETTABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PREPARING,
  OrderStatus.READY_FOR_DELIVERY,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
];

/** Statuser der bestillingen fortsatt er i arbeid. */
export const ACTIVE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING_RESTAURANT,
  OrderStatus.ACCEPTING,
  OrderStatus.ACCEPTED,
  OrderStatus.PREPARING,
  OrderStatus.READY_FOR_DELIVERY,
  OrderStatus.OUT_FOR_DELIVERY,
];

/** Statuser der bestillingen er ferdigbehandlet. */
export const TERMINAL_STATUSES: OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.DECLINED,
  OrderStatus.CANCELLED,
  OrderStatus.REFUNDED,
];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new OrderTransitionError(from, to);
  }
}

export class OrderTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
  ) {
    super(`Ugyldig statusovergang: ${from} kan ikke ga til ${to}.`);
    this.name = "OrderTransitionError";
  }
}

/** Kunden kan avbryte sa lenge restauranten ikke har begynt a behandle bestillingen. */
export function customerCanCancel(status: OrderStatus): boolean {
  return (
    status === OrderStatus.DRAFT ||
    status === OrderStatus.AWAITING_PAYMENT ||
    status === OrderStatus.PAYMENT_AUTHORIZED ||
    status === OrderStatus.PENDING_RESTAURANT
  );
}

/** Posisjonssporing skal bare paga mens bestillingen er aktiv, jf. paragraf 12. */
export function shouldTrackLocation(status: OrderStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: "Utkast",
  AWAITING_PAYMENT: "Venter pa betaling",
  PAYMENT_AUTHORIZED: "Betaling reservert",
  PENDING_RESTAURANT: "Venter pa restauranten",
  ACCEPTING: "Behandles",
  ACCEPTED: "Godkjent",
  PREPARING: "Tilberedes",
  READY_FOR_DELIVERY: "Klar",
  OUT_FOR_DELIVERY: "Pa vei",
  DELIVERED: "Levert",
  DECLINED: "Avslatt",
  CANCELLED: "Kansellert",
  PAYMENT_FAILED: "Betaling feilet",
  REFUND_PENDING: "Refusjon pagar",
  REFUNDED: "Refundert",
};

/** Kundevennlig beskrivelse pa statussiden, jf. paragraf 13.6. */
export const CUSTOMER_STATUS_MESSAGES: Record<OrderStatus, string> = {
  DRAFT: "Bestillingen er ikke sendt enna.",
  AWAITING_PAYMENT: "Vi venter pa at betalingen skal fullfores.",
  PAYMENT_AUTHORIZED: "Betalingen er reservert. Bestillingen sendes til restauranten.",
  PENDING_RESTAURANT: "Bestillingen er mottatt og venter pa restauranten.",
  ACCEPTING: "Restauranten behandler bestillingen din.",
  ACCEPTED: "Bestillingen din er godkjent.",
  PREPARING: "Maten tilberedes.",
  READY_FOR_DELIVERY: "Maten er klar.",
  OUT_FOR_DELIVERY: "Maten er pa vei til deg.",
  DELIVERED: "Maten er levert. God appetitt!",
  DECLINED: "Bestillingen ble dessverre avslatt.",
  CANCELLED: "Bestillingen er kansellert.",
  PAYMENT_FAILED: "Betalingen gikk ikke gjennom.",
  REFUND_PENDING: "Pengene er pa vei tilbake til deg.",
  REFUNDED: "Belopet er refundert.",
};
