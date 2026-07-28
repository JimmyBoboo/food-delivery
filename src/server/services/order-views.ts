import { prisma } from "@/lib/db";
import { NotFoundError } from "@/server/errors";
import { customerCanCancel, shouldTrackLocation } from "@/server/orders/state-machine";

import { OrderStatus } from "@/generated/prisma/enums";

/** Posisjonen regnes som gammel etter fem minutter, jf. paragraf 11. */
export const STALE_LOCATION_MINUTES = 5;

export type CustomerOrderView = Awaited<ReturnType<typeof getOrderForCustomer>>;

/**
 * Statusvisningen kunden ser. Inneholder bevisst ingen interne felter som
 * ordre-id eller ansattnavn.
 */
export async function getOrderForCustomer(publicToken: string) {
  const order = await prisma.order.findUnique({
    where: { publicToken },
    include: {
      club: { select: { name: true, slug: true, phone: true } },
      selectedHole: { select: { holeNumber: true, name: true } },
      deliveryPoint: { select: { name: true, instructions: true } },
      items: { include: { options: true } },
    },
  });

  if (!order) throw new NotFoundError("Fant ikke bestillingen.");

  return {
    publicToken: order.publicToken,
    orderNumber: order.orderNumber,
    status: order.status,
    club: order.club,
    customerName: order.customerName,
    holeNumber: order.selectedHole?.holeNumber ?? null,
    holePosition: order.selectedHolePosition,
    deliveryTargetType: order.deliveryTargetType,
    deliveryPoint: order.deliveryPoint,
    customerComment: order.customerComment,
    subtotalAmount: order.subtotalAmount,
    deliveryFee: order.deliveryFee,
    totalAmount: order.totalAmount,
    estimatedDeliveryAt: order.estimatedDeliveryAt,
    declineReason: order.declineReason,
    paymentStatus: order.paymentStatus,
    createdAt: order.createdAt,
    canCancel: customerCanCancel(order.status),
    shouldShareLocation: shouldTrackLocation(order.status),
    items: order.items.map((item) => ({
      id: item.id,
      name: item.productNameSnapshot,
      quantity: item.quantity,
      unitPrice: item.unitPriceSnapshot,
      totalPrice: item.totalPrice,
      comment: item.customerComment,
      options: item.options.map((option) => ({
        id: option.id,
        option: option.optionNameSnapshot,
        value: option.valueNameSnapshot,
        additionalPrice: option.additionalPriceSnapshot,
      })),
    })),
  };
}

export type AdminOrderListItem = Awaited<ReturnType<typeof listOrdersForClub>>[number];

/** Bestillingene som vises i kolonnene i ansattpanelet. */
export async function listOrdersForClub(
  clubId: string,
  options: { statuses?: OrderStatus[]; since?: Date } = {},
) {
  const orders = await prisma.order.findMany({
    where: {
      clubId,
      status: {
        in: options.statuses ?? [
          OrderStatus.PENDING_RESTAURANT,
          OrderStatus.ACCEPTING,
          OrderStatus.ACCEPTED,
          OrderStatus.PREPARING,
          OrderStatus.READY_FOR_DELIVERY,
          OrderStatus.OUT_FOR_DELIVERY,
          OrderStatus.DELIVERED,
          OrderStatus.DECLINED,
          OrderStatus.CANCELLED,
        ],
      },
      createdAt: { gte: options.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "asc" },
    include: {
      selectedHole: { select: { holeNumber: true } },
      deliveryPoint: { select: { name: true } },
      location: true,
      items: { select: { quantity: true } },
      acceptedBy: { select: { name: true } },
      assignedDriver: { select: { id: true, name: true } },
    },
  });

  return orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    publicToken: order.publicToken,
    status: order.status,
    paymentStatus: order.paymentStatus,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    totalAmount: order.totalAmount,
    holeNumber: order.selectedHole?.holeNumber ?? null,
    holePosition: order.selectedHolePosition,
    deliveryTargetType: order.deliveryTargetType,
    deliveryPointName: order.deliveryPoint?.name ?? null,
    customerComment: order.customerComment,
    estimatedDeliveryAt: order.estimatedDeliveryAt,
    declineReason: order.declineReason,
    createdAt: order.createdAt,
    acceptedByName: order.acceptedBy?.name ?? null,
    assignedDriver: order.assignedDriver,
    location: toLocationView(order.location),
  }));
}

export async function getOrderForStaff(orderId: string, clubId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, clubId },
    include: {
      selectedHole: { select: { holeNumber: true, name: true } },
      suggestedHole: { select: { holeNumber: true } },
      deliveryPoint: { select: { name: true, instructions: true } },
      location: true,
      items: { include: { options: true } },
      acceptedBy: { select: { name: true } },
      assignedDriver: { select: { id: true, name: true } },
      events: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } },
    },
  });

  if (!order) throw new NotFoundError("Fant ikke bestillingen.");

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    publicToken: order.publicToken,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentReference: order.paymentReference,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerEmail: order.customerEmail,
    customerComment: order.customerComment,
    holeNumber: order.selectedHole?.holeNumber ?? null,
    holeName: order.selectedHole?.name ?? null,
    holePosition: order.selectedHolePosition,
    suggestedHoleNumber: order.suggestedHole?.holeNumber ?? null,
    deliveryTargetType: order.deliveryTargetType,
    deliveryPoint: order.deliveryPoint,
    subtotalAmount: order.subtotalAmount,
    deliveryFee: order.deliveryFee,
    totalAmount: order.totalAmount,
    estimatedDeliveryAt: order.estimatedDeliveryAt,
    declineReason: order.declineReason,
    acceptedByName: order.acceptedBy?.name ?? null,
    acceptedAt: order.acceptedAt,
    assignedDriver: order.assignedDriver,
    deliveredAt: order.deliveredAt,
    createdAt: order.createdAt,
    location: toLocationView(order.location),
    items: order.items.map((item) => ({
      id: item.id,
      name: item.productNameSnapshot,
      quantity: item.quantity,
      unitPrice: item.unitPriceSnapshot,
      totalPrice: item.totalPrice,
      comment: item.customerComment,
      options: item.options.map((option) => ({
        id: option.id,
        option: option.optionNameSnapshot,
        value: option.valueNameSnapshot,
        additionalPrice: option.additionalPriceSnapshot,
      })),
    })),
    events: order.events.map((event) => ({
      id: event.id,
      type: event.eventType,
      oldStatus: event.oldStatus,
      newStatus: event.newStatus,
      actorType: event.actorType,
      performedByName: event.user?.name ?? null,
      message: event.message,
      createdAt: event.createdAt,
    })),
  };
}

function toLocationView(
  location: {
    latitude: number | null;
    longitude: number | null;
    accuracyMeters: number | null;
    recordedAt: Date;
    purgedAt: Date | null;
  } | null,
) {
  if (!location || location.latitude === null || location.longitude === null) {
    return null;
  }

  const ageMinutes = (Date.now() - location.recordedAt.getTime()) / 60_000;

  return {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracyMeters: location.accuracyMeters,
    recordedAt: location.recordedAt,
    ageMinutes: Math.round(ageMinutes),
    isStale: ageMinutes > STALE_LOCATION_MINUTES,
  };
}
