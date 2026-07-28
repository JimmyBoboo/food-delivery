import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError, ConflictError, NotFoundError } from "@/server/errors";
import { getPaymentProvider, toPaymentStatus } from "@/server/payments";
import { PaymentError, type ProviderPayment } from "@/server/payments/provider";
import { notifyOrderChanged } from "@/server/realtime/broadcast";
import {
  assertTransition,
  customerCanCancel,
  shouldTrackLocation,
  STAFF_SETTABLE_STATUSES,
} from "@/server/orders/state-machine";
import type { CreateOrderInput } from "@/server/validation";

import {
  DeliveryTargetType,
  OrderEventType,
  OrderStatus,
  PaymentStatus,
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

type TransactionClient = Prisma.TransactionClient;

/** Nøyaktige koordinater slettes 24 timer etter registrering, jf. paragraf 12. */
export const LOCATION_RETENTION_HOURS = 24;

// ---------------------------------------------------------------------------
// Hendelseslogg
// ---------------------------------------------------------------------------

async function recordEvent(
  client: TransactionClient | typeof prisma,
  input: {
    orderId: string;
    eventType: OrderEventType;
    oldStatus?: OrderStatus | null;
    newStatus?: OrderStatus | null;
    performedBy?: string | null;
    actorType?: "CUSTOMER" | "STAFF" | "SYSTEM" | "PAYMENT_PROVIDER";
    message?: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  await client.orderEvent.create({
    data: {
      orderId: input.orderId,
      eventType: input.eventType,
      oldStatus: input.oldStatus ?? null,
      newStatus: input.newStatus ?? null,
      performedBy: input.performedBy ?? null,
      actorType: input.actorType ?? "SYSTEM",
      message: input.message,
      metadata: input.metadata,
    },
  });
}

// ---------------------------------------------------------------------------
// Opprettelse
// ---------------------------------------------------------------------------

function generatePublicToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Oppretter en bestilling. Priser hentes alltid fra databasen, aldri fra
 * klienten, og navn og pris kopieres inn i ordrelinjene slik at senere
 * prisendringer ikke pavirker gamle bestillinger.
 */
export async function createOrder(input: CreateOrderInput) {
  const existing = await prisma.order.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { publicToken: true, id: true, status: true },
  });

  if (existing) {
    return existing;
  }

  const club = await prisma.club.findUnique({ where: { slug: input.clubSlug } });
  if (!club) {
    throw new NotFoundError("Fant ikke golfklubben.");
  }

  const isPickup =
    input.deliveryTargetType === DeliveryTargetType.RESTAURANT_PICKUP ||
    input.deliveryTargetType === DeliveryTargetType.KIOSK_PICKUP;

  if (!club.isOrderingEnabled) {
    throw new AppError(
      club.pauseMessage ?? "Restauranten tar dessverre ikke imot bestillinger akkurat na.",
      409,
      "ORDERING_PAUSED",
    );
  }

  if (club.isCourseDeliveryPaused && !isPickup) {
    throw new AppError(
      club.pauseMessage ??
        "Levering pa banen er satt pa pause. Du kan fortsatt hente bestillingen i restauranten.",
      409,
      "DELIVERY_PAUSED",
    );
  }

  const productIds = [...new Set(input.items.map((item) => item.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, clubId: club.id },
    include: { options: { include: { values: true } } },
  });

  const productById = new Map(products.map((product) => [product.id, product]));

  const lines = input.items.map((item) => {
    const product = productById.get(item.productId);
    if (!product) {
      throw new AppError("En av varene finnes ikke lenger i menyen.", 409, "PRODUCT_MISSING");
    }
    if (!product.isAvailable) {
      throw new AppError(`${product.name} er dessverre utsolgt.`, 409, "PRODUCT_UNAVAILABLE");
    }

    const chosenValues = product.options
      .flatMap((option) => option.values.map((value) => ({ option, value })))
      .filter(({ value }) => item.optionValueIds.includes(value.id));

    if (chosenValues.length !== item.optionValueIds.length) {
      throw new AppError(`Ugyldig tilvalg for ${product.name}.`, 400, "INVALID_OPTION");
    }

    for (const { value } of chosenValues) {
      if (!value.isAvailable) {
        throw new AppError(`Tilvalget ${value.name} er utsolgt.`, 409, "OPTION_UNAVAILABLE");
      }
    }

    for (const option of product.options) {
      const count = chosenValues.filter(({ option: chosen }) => chosen.id === option.id).length;
      if (option.required && count < Math.max(option.minimumChoices, 1)) {
        throw new AppError(`Du ma velge ${option.name} for ${product.name}.`, 400, "OPTION_REQUIRED");
      }
      if (count > option.maximumChoices) {
        throw new AppError(
          `Du kan velge maks ${option.maximumChoices} under ${option.name}.`,
          400,
          "TOO_MANY_OPTIONS",
        );
      }
    }

    const optionsTotal = chosenValues.reduce((sum, { value }) => sum + value.additionalPrice, 0);
    const unitPrice = product.price + optionsTotal;

    return {
      product,
      quantity: item.quantity,
      unitPrice,
      totalPrice: unitPrice * item.quantity,
      comment: item.comment,
      chosenValues,
    };
  });

  const subtotal = lines.reduce((sum, line) => sum + line.totalPrice, 0);

  if (subtotal < club.minimumOrderAmount) {
    throw new AppError(
      `Minste bestillingsbelop er ${club.minimumOrderAmount / 100} kroner.`,
      400,
      "BELOW_MINIMUM",
    );
  }

  const deliveryFee =
    isPickup ||
    (club.freeDeliveryThreshold !== null && subtotal >= club.freeDeliveryThreshold)
      ? 0
      : club.deliveryFee;

  const [selectedHole, suggestedHole] = await Promise.all([
    input.selectedHoleNumber
      ? prisma.hole.findUnique({
          where: { clubId_holeNumber: { clubId: club.id, holeNumber: input.selectedHoleNumber } },
        })
      : null,
    input.suggestedHoleNumber
      ? prisma.hole.findUnique({
          where: { clubId_holeNumber: { clubId: club.id, holeNumber: input.suggestedHoleNumber } },
        })
      : null,
  ]);

  if (!isPickup && !selectedHole) {
    throw new AppError("Du ma velge hvilket hull du er pa.", 400, "HOLE_REQUIRED");
  }

  if (selectedHole && !selectedHole.isDeliveryEnabled && !isPickup) {
    throw new AppError(
      `Vi leverer dessverre ikke til hull ${selectedHole.holeNumber} akkurat na.`,
      409,
      "HOLE_DELIVERY_DISABLED",
    );
  }

  if (input.deliveryPointId) {
    const point = await prisma.deliveryPoint.findFirst({
      where: { id: input.deliveryPointId, clubId: club.id, isActive: true },
    });
    if (!point) {
      throw new AppError("Leveringspunktet er ikke tilgjengelig.", 409, "DELIVERY_POINT_INVALID");
    }
  }

  const publicToken = generatePublicToken();

  const order = await prisma.$transaction(async (tx) => {
    const [{ next_order_number: orderNumber }] = await tx.$queryRaw<
      { next_order_number: number }[]
    >`SELECT next_order_number(${club.id}::uuid) AS next_order_number`;

    const created = await tx.order.create({
      data: {
        clubId: club.id,
        orderNumber,
        publicToken,
        idempotencyKey: input.idempotencyKey,
        status: OrderStatus.DRAFT,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail ? input.customerEmail : null,
        selectedHoleId: selectedHole?.id ?? null,
        selectedHolePosition: input.selectedHolePosition,
        suggestedHoleId: suggestedHole?.id ?? null,
        deliveryPointId: input.deliveryPointId,
        deliveryTargetType: input.deliveryTargetType,
        customerComment: input.customerComment,
        subtotalAmount: subtotal,
        deliveryFee,
        totalAmount: subtotal + deliveryFee,
        paymentProvider: getPaymentProvider().name,
        items: {
          create: lines.map((line) => ({
            productId: line.product.id,
            productNameSnapshot: line.product.name,
            unitPriceSnapshot: line.unitPrice,
            quantity: line.quantity,
            totalPrice: line.totalPrice,
            customerComment: line.comment,
            options: {
              create: line.chosenValues.map(({ option, value }) => ({
                optionNameSnapshot: option.name,
                valueNameSnapshot: value.name,
                additionalPriceSnapshot: value.additionalPrice,
              })),
            },
          })),
        },
      },
      select: { id: true, publicToken: true, status: true },
    });

    if (input.location) {
      await tx.orderLocation.create({
        data: {
          orderId: created.id,
          latitude: input.location.latitude,
          longitude: input.location.longitude,
          accuracyMeters: input.location.accuracyMeters,
          recordedAt: input.location.recordedAt ?? new Date(),
        },
      });
    }

    await recordEvent(tx, {
      orderId: created.id,
      eventType: OrderEventType.ORDER_CREATED,
      newStatus: OrderStatus.DRAFT,
      actorType: "CUSTOMER",
      message: `Bestilling ${orderNumber} opprettet.`,
      metadata: {
        subtotal,
        deliveryFee,
        holeNumber: selectedHole?.holeNumber ?? null,
        deliveryTargetType: input.deliveryTargetType,
      },
    });

    return created;
  });

  return order;
}

// ---------------------------------------------------------------------------
// Betaling
// ---------------------------------------------------------------------------

/** Oppretter betalingsokt og reserverer belopet hos leverandoren. */
export async function createPaymentSession(publicToken: string) {
  const order = await prisma.order.findUnique({
    where: { publicToken },
    include: { club: { select: { currency: true } } },
  });

  if (!order) throw new NotFoundError("Fant ikke bestillingen.");

  if (
    order.status !== OrderStatus.DRAFT &&
    order.status !== OrderStatus.AWAITING_PAYMENT &&
    order.status !== OrderStatus.PAYMENT_FAILED
  ) {
    throw new ConflictError("Bestillingen er allerede betalt eller behandlet.");
  }

  const provider = getPaymentProvider(order.paymentProvider);
  const returnUrl = new URL(`/ordre/${publicToken}`, env.appUrl).toString();

  const session = await provider.createSession({
    orderId: order.id,
    amount: order.totalAmount,
    currency: order.club.currency,
    orderNumber: order.orderNumber,
    customerPhone: order.customerPhone,
    returnUrl,
    idempotencyKey: `payment:${order.id}`,
  });

  if (order.status !== OrderStatus.AWAITING_PAYMENT) {
    assertTransition(order.status, OrderStatus.AWAITING_PAYMENT);
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: OrderStatus.AWAITING_PAYMENT,
      paymentReference: session.payment.reference,
      paymentStatus: PaymentStatus.PENDING,
    },
  });

  await recordEvent(prisma, {
    orderId: order.id,
    eventType: OrderEventType.STATUS_CHANGED,
    oldStatus: order.status,
    newStatus: OrderStatus.AWAITING_PAYMENT,
    actorType: "CUSTOMER",
    message: "Betalingsokt opprettet.",
    metadata: { reference: session.payment.reference },
  });

  return { redirectUrl: session.redirectUrl, reference: session.payment.reference };
}

/**
 * Speiler leverandorens betalingsstatus over pa bestillingen.
 *
 * Kalles bade fra webhooken og nar kunden apner statussiden, slik at flyten
 * ikke er avhengig av at webhooken kommer frem, jf. paragraf 9.
 */
export async function syncPaymentState(orderId: string, payment: ProviderPayment) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError("Fant ikke bestillingen.");

  const paymentStatus = toPaymentStatus(payment.status);

  if (paymentStatus === order.paymentStatus && order.status !== OrderStatus.AWAITING_PAYMENT) {
    return order;
  }

  // Reservert belop: bestillingen sendes videre til restauranten.
  if (payment.status === "AUTHORIZED" && order.status === OrderStatus.AWAITING_PAYMENT) {
    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.PENDING_RESTAURANT,
          paymentStatus: PaymentStatus.AUTHORIZED,
        },
      });

      await recordEvent(tx, {
        orderId: order.id,
        eventType: OrderEventType.PAYMENT_AUTHORIZED,
        oldStatus: order.status,
        newStatus: OrderStatus.PENDING_RESTAURANT,
        actorType: "PAYMENT_PROVIDER",
        message: "Belopet er reservert. Bestillingen er sendt til restauranten.",
      });

      return next;
    });

    await notifyOrderChanged({
      clubId: order.clubId,
      orderId: order.id,
      publicToken: order.publicToken,
      status: updated.status,
      event: "order.created",
    });

    return updated;
  }

  // Avbrutt, utlopt eller feilet for restauranten rakk a behandle den.
  if (
    (payment.status === "CANCELLED" || payment.status === "EXPIRED" || payment.status === "FAILED") &&
    (order.status === OrderStatus.AWAITING_PAYMENT || order.status === OrderStatus.DRAFT)
  ) {
    const nextStatus =
      payment.status === "FAILED" ? OrderStatus.PAYMENT_FAILED : OrderStatus.CANCELLED;

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.order.update({
        where: { id: order.id },
        data: { status: nextStatus, paymentStatus },
      });

      await recordEvent(tx, {
        orderId: order.id,
        eventType:
          payment.status === "FAILED"
            ? OrderEventType.PAYMENT_FAILED
            : OrderEventType.PAYMENT_CANCELLED,
        oldStatus: order.status,
        newStatus: nextStatus,
        actorType: "PAYMENT_PROVIDER",
        message:
          payment.status === "EXPIRED"
            ? "Betalingsreservasjonen utlop."
            : "Betalingen ble ikke fullfort.",
      });

      return next;
    });

    await notifyOrderChanged({
      clubId: order.clubId,
      orderId: order.id,
      publicToken: order.publicToken,
      status: updated.status,
      event: "order.updated",
    });

    return updated;
  }

  if (paymentStatus !== order.paymentStatus) {
    return prisma.order.update({ where: { id: order.id }, data: { paymentStatus } });
  }

  return order;
}

/** Henter status hos leverandoren og oppdaterer bestillingen deretter. */
export async function refreshPaymentFromProvider(publicToken: string) {
  const order = await prisma.order.findUnique({ where: { publicToken } });
  if (!order || !order.paymentReference) return;

  const provider = getPaymentProvider(order.paymentProvider);
  const payment = await provider.getPayment(order.paymentReference);
  if (!payment) return;

  await syncPaymentState(order.id, payment);
}

// ---------------------------------------------------------------------------
// Restaurantens behandling
// ---------------------------------------------------------------------------

function resolveEta(input: { etaMinutes?: number; etaAt?: Date }, fallbackMinutes: number): Date {
  if (input.etaAt) return input.etaAt;
  const minutes = input.etaMinutes ?? fallbackMinutes;
  return new Date(Date.now() + minutes * 60_000);
}

/**
 * Godkjenner en bestilling.
 *
 * Bestillingen settes til ACCEPTING inne i en transaksjon med radlas, slik at
 * bare den forste ansatte far behandle den. Deretter forsokes belopet trukket.
 * Forst nar betalingen er bekreftet blir bestillingen ACCEPTED.
 */
export async function acceptOrder(input: {
  orderId: string;
  clubId: string;
  userId: string;
  etaMinutes?: number;
  etaAt?: Date;
}) {
  const club = await prisma.club.findUnique({
    where: { id: input.clubId },
    select: { defaultPrepMinutes: true },
  });

  const locked = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; status: OrderStatus }[]>`
      SELECT "id", "status"
        FROM "orders"
       WHERE "id" = ${input.orderId}::uuid
         AND "club_id" = ${input.clubId}::uuid
         FOR UPDATE
    `;

    const row = rows[0];
    if (!row) throw new NotFoundError("Fant ikke bestillingen.");

    if (row.status === OrderStatus.ACCEPTING) {
      throw new ConflictError("En annen ansatt behandler denne bestillingen akkurat na.");
    }
    if (row.status !== OrderStatus.PENDING_RESTAURANT) {
      throw new ConflictError(`Bestillingen er allerede behandlet (${row.status}).`);
    }

    const updated = await tx.order.update({
      where: { id: input.orderId },
      data: { status: OrderStatus.ACCEPTING },
    });

    await recordEvent(tx, {
      orderId: input.orderId,
      eventType: OrderEventType.STATUS_CHANGED,
      oldStatus: row.status,
      newStatus: OrderStatus.ACCEPTING,
      performedBy: input.userId,
      actorType: "STAFF",
      message: "Bestillingen behandles. Betalingen forsokes trukket.",
    });

    return updated;
  });

  const provider = getPaymentProvider(locked.paymentProvider);

  try {
    if (!locked.paymentReference) {
      throw new PaymentError("Bestillingen mangler betalingsreferanse.", "NOT_FOUND");
    }

    await provider.capture(locked.paymentReference, locked.totalAmount, `capture:${locked.id}`);
  } catch (error) {
    const expired = error instanceof PaymentError && error.code === "EXPIRED";
    const nextStatus = expired ? OrderStatus.DECLINED : OrderStatus.PENDING_RESTAURANT;
    const message =
      error instanceof Error ? error.message : "Ukjent feil ved trekking av betaling.";

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: locked.id },
        data: {
          status: nextStatus,
          paymentStatus: expired ? PaymentStatus.EXPIRED : PaymentStatus.AUTHORIZED,
          declineReason: expired ? "Betalingen kunne ikke gjennomfores." : null,
        },
      });

      await recordEvent(tx, {
        orderId: locked.id,
        eventType: OrderEventType.PAYMENT_FAILED,
        oldStatus: OrderStatus.ACCEPTING,
        newStatus: nextStatus,
        performedBy: input.userId,
        actorType: "STAFF",
        message: `Trekking av betaling feilet: ${message}`,
      });
    });

    await notifyOrderChanged({
      clubId: locked.clubId,
      orderId: locked.id,
      publicToken: locked.publicToken,
      status: nextStatus,
      event: "order.updated",
    });

    throw new AppError(
      expired
        ? "Betalingsreservasjonen var utlopt. Bestillingen er avslatt og kunden er varslet."
        : `Betalingen kunne ikke trekkes: ${message}. Bestillingen er lagt tilbake i koen.`,
      409,
      "CAPTURE_FAILED",
    );
  }

  const estimatedDeliveryAt = resolveEta(input, club?.defaultPrepMinutes ?? 20);

  const accepted = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: locked.id },
      data: {
        status: OrderStatus.ACCEPTED,
        paymentStatus: PaymentStatus.CAPTURED,
        acceptedById: input.userId,
        acceptedAt: new Date(),
        estimatedDeliveryAt,
      },
    });

    await recordEvent(tx, {
      orderId: locked.id,
      eventType: OrderEventType.PAYMENT_CAPTURED,
      actorType: "STAFF",
      performedBy: input.userId,
      message: "Belopet er trukket.",
    });

    await recordEvent(tx, {
      orderId: locked.id,
      eventType: OrderEventType.STATUS_CHANGED,
      oldStatus: OrderStatus.ACCEPTING,
      newStatus: OrderStatus.ACCEPTED,
      performedBy: input.userId,
      actorType: "STAFF",
      message: `Bestillingen er godkjent. Forventet levering ${estimatedDeliveryAt.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}.`,
      metadata: { estimatedDeliveryAt: estimatedDeliveryAt.toISOString() },
    });

    return updated;
  });

  await notifyOrderChanged({
    clubId: accepted.clubId,
    orderId: accepted.id,
    publicToken: accepted.publicToken,
    status: accepted.status,
    event: "order.updated",
  });

  return accepted;
}

/** Avslar en bestilling og opphever betalingsreservasjonen. */
export async function declineOrder(input: {
  orderId: string;
  clubId: string;
  userId: string;
  reason: string;
}) {
  const order = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; status: OrderStatus }[]>`
      SELECT "id", "status"
        FROM "orders"
       WHERE "id" = ${input.orderId}::uuid
         AND "club_id" = ${input.clubId}::uuid
         FOR UPDATE
    `;

    const row = rows[0];
    if (!row) throw new NotFoundError("Fant ikke bestillingen.");

    if (row.status !== OrderStatus.PENDING_RESTAURANT) {
      throw new ConflictError(`Bestillingen kan ikke avslas fra status ${row.status}.`);
    }

    const updated = await tx.order.update({
      where: { id: input.orderId },
      data: { status: OrderStatus.DECLINED, declineReason: input.reason },
    });

    await recordEvent(tx, {
      orderId: input.orderId,
      eventType: OrderEventType.DECLINED,
      oldStatus: row.status,
      newStatus: OrderStatus.DECLINED,
      performedBy: input.userId,
      actorType: "STAFF",
      message: input.reason,
    });

    return updated;
  });

  if (order.paymentReference) {
    const provider = getPaymentProvider(order.paymentProvider);
    try {
      await provider.cancel(order.paymentReference, `cancel:${order.id}`);
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: PaymentStatus.CANCELLED },
      });
      await recordEvent(prisma, {
        orderId: order.id,
        eventType: OrderEventType.PAYMENT_CANCELLED,
        actorType: "SYSTEM",
        message: "Betalingsreservasjonen er opphevet.",
      });
    } catch (error) {
      await recordEvent(prisma, {
        orderId: order.id,
        eventType: OrderEventType.PAYMENT_FAILED,
        actorType: "SYSTEM",
        message: `Kunne ikke oppheve reservasjonen: ${error instanceof Error ? error.message : "ukjent feil"}`,
      });
    }
  }

  await notifyOrderChanged({
    clubId: order.clubId,
    orderId: order.id,
    publicToken: order.publicToken,
    status: order.status,
    event: "order.updated",
  });

  return order;
}

/** Statusendringer ansatte gjor etter at bestillingen er godkjent. */
export async function updateOrderStatus(input: {
  orderId: string;
  clubId: string;
  userId: string;
  status: OrderStatus;
}) {
  if (!STAFF_SETTABLE_STATUSES.includes(input.status)) {
    throw new AppError(`Statusen ${input.status} kan ikke settes manuelt.`, 400, "INVALID_STATUS");
  }

  const order = await prisma.order.findFirst({
    where: { id: input.orderId, clubId: input.clubId },
  });
  if (!order) throw new NotFoundError("Fant ikke bestillingen.");

  assertTransition(order.status, input.status);

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.order.update({
      where: { id: order.id },
      data: {
        status: input.status,
        deliveredAt: input.status === OrderStatus.DELIVERED ? new Date() : order.deliveredAt,
      },
    });

    await recordEvent(tx, {
      orderId: order.id,
      eventType: OrderEventType.STATUS_CHANGED,
      oldStatus: order.status,
      newStatus: input.status,
      performedBy: input.userId,
      actorType: "STAFF",
    });

    return next;
  });

  // Nar bestillingen er levert er det ikke lenger behov for koordinatene.
  if (input.status === OrderStatus.DELIVERED) {
    await purgeLocationForOrder(order.id, "Bestillingen er levert.");
  }

  await notifyOrderChanged({
    clubId: updated.clubId,
    orderId: updated.id,
    publicToken: updated.publicToken,
    status: updated.status,
    event: "order.updated",
  });

  return updated;
}

export async function updateEta(input: {
  orderId: string;
  clubId: string;
  userId: string;
  etaMinutes?: number;
  etaAt?: Date;
}) {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, clubId: input.clubId },
  });
  if (!order) throw new NotFoundError("Fant ikke bestillingen.");

  const estimatedDeliveryAt = resolveEta(input, 20);

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { estimatedDeliveryAt },
  });

  await recordEvent(prisma, {
    orderId: order.id,
    eventType: OrderEventType.ETA_UPDATED,
    performedBy: input.userId,
    actorType: "STAFF",
    message: `Ny forventet levering ${estimatedDeliveryAt.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}.`,
    metadata: { estimatedDeliveryAt: estimatedDeliveryAt.toISOString() },
  });

  await notifyOrderChanged({
    clubId: updated.clubId,
    orderId: updated.id,
    publicToken: updated.publicToken,
    status: updated.status,
    event: "order.updated",
  });

  return updated;
}

export async function assignDriver(input: {
  orderId: string;
  clubId: string;
  userId: string;
  driverId: string | null;
}) {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, clubId: input.clubId },
  });
  if (!order) throw new NotFoundError("Fant ikke bestillingen.");

  if (input.driverId) {
    const driver = await prisma.user.findFirst({
      where: { id: input.driverId, clubId: input.clubId, isActive: true },
    });
    if (!driver) throw new NotFoundError("Fant ikke leveringspersonen.");
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { assignedDriverId: input.driverId },
  });

  await recordEvent(prisma, {
    orderId: order.id,
    eventType: OrderEventType.NOTE,
    performedBy: input.userId,
    actorType: "STAFF",
    message: input.driverId ? "Leveringsperson tildelt." : "Leveringsperson fjernet.",
  });

  return updated;
}

/** Leveringspersonen melder fra om at kunden ikke ble funnet, jf. paragraf 3.3. */
export async function reportCustomerNotFound(input: {
  orderId: string;
  clubId: string;
  userId: string;
  message?: string;
}) {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, clubId: input.clubId },
  });
  if (!order) throw new NotFoundError("Fant ikke bestillingen.");

  await recordEvent(prisma, {
    orderId: order.id,
    eventType: OrderEventType.CUSTOMER_NOT_FOUND,
    performedBy: input.userId,
    actorType: "STAFF",
    message: input.message ?? "Kunden ble ikke funnet pa avtalt sted.",
  });

  await notifyOrderChanged({
    clubId: order.clubId,
    orderId: order.id,
    publicToken: order.publicToken,
    status: order.status,
    event: "order.updated",
  });

  return order;
}

// ---------------------------------------------------------------------------
// Kundens handlinger
// ---------------------------------------------------------------------------

export async function cancelByCustomer(publicToken: string) {
  const order = await prisma.order.findUnique({ where: { publicToken } });
  if (!order) throw new NotFoundError("Fant ikke bestillingen.");

  if (!customerCanCancel(order.status)) {
    throw new ConflictError(
      "Bestillingen er allerede godkjent av restauranten og kan ikke avbrytes her. Ta kontakt med klubbhuset.",
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.CANCELLED },
    });

    await recordEvent(tx, {
      orderId: order.id,
      eventType: OrderEventType.CANCELLED_BY_CUSTOMER,
      oldStatus: order.status,
      newStatus: OrderStatus.CANCELLED,
      actorType: "CUSTOMER",
      message: "Kunden avbrot bestillingen.",
    });

    return next;
  });

  if (order.paymentReference) {
    const provider = getPaymentProvider(order.paymentProvider);
    try {
      await provider.cancel(order.paymentReference, `cancel:${order.id}`);
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: PaymentStatus.CANCELLED },
      });
    } catch (error) {
      console.warn("Kunne ikke oppheve reservasjonen ved kundeavbrudd", error);
    }
  }

  await purgeLocationForOrder(order.id, "Bestillingen ble avbrutt.");

  await notifyOrderChanged({
    clubId: updated.clubId,
    orderId: updated.id,
    publicToken: updated.publicToken,
    status: updated.status,
    event: "order.updated",
  });

  return updated;
}

/**
 * Lagrer siste kjente posisjon. Bare en rad per bestilling, og bare mens
 * bestillingen er aktiv, jf. paragraf 6.3 og 12.
 */
export async function updateOrderLocation(
  publicToken: string,
  location: { latitude: number; longitude: number; accuracyMeters: number; recordedAt?: Date },
) {
  const order = await prisma.order.findUnique({
    where: { publicToken },
    select: { id: true, status: true, clubId: true },
  });
  if (!order) throw new NotFoundError("Fant ikke bestillingen.");

  if (!shouldTrackLocation(order.status)) {
    return { stored: false as const };
  }

  const recordedAt = location.recordedAt ?? new Date();

  await prisma.orderLocation.upsert({
    where: { orderId: order.id },
    create: {
      orderId: order.id,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracyMeters: location.accuracyMeters,
      recordedAt,
    },
    update: {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracyMeters: location.accuracyMeters,
      recordedAt,
      purgedAt: null,
    },
  });

  return { stored: true as const };
}

// ---------------------------------------------------------------------------
// Personvern
// ---------------------------------------------------------------------------

async function purgeLocationForOrder(orderId: string, reason: string) {
  const existing = await prisma.orderLocation.findUnique({ where: { orderId } });
  if (!existing || existing.latitude === null) return;

  await prisma.orderLocation.update({
    where: { orderId },
    data: { latitude: null, longitude: null, accuracyMeters: null, purgedAt: new Date() },
  });

  await recordEvent(prisma, {
    orderId,
    eventType: OrderEventType.LOCATION_PURGED,
    actorType: "SYSTEM",
    message: reason,
  });
}

/**
 * Sletter noyaktige koordinater eldre enn oppbevaringstiden.
 * Hullnummeret pa bestillingen beholdes for statistikk.
 */
export async function purgeExpiredLocations(): Promise<number> {
  const cutoff = new Date(Date.now() - LOCATION_RETENTION_HOURS * 60 * 60 * 1000);

  const expired = await prisma.orderLocation.findMany({
    where: { recordedAt: { lt: cutoff }, latitude: { not: null } },
    select: { orderId: true },
  });

  for (const { orderId } of expired) {
    await purgeLocationForOrder(orderId, "Koordinatene ble slettet automatisk etter 24 timer.");
  }

  return expired.length;
}
