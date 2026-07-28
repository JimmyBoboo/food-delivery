import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import {
  PaymentError,
  type CreateSessionInput,
  type CreateSessionResult,
  type PaymentProvider,
  type ProviderPayment,
  type ProviderPaymentStatus,
} from "@/server/payments/provider";

/** Reservasjonen star i 20 minutter, omtrent som hos Vipps. */
const AUTHORIZATION_TTL_MINUTES = 20;

type MockPaymentRow = {
  reference: string;
  status: string;
  amount: number;
  capturedAmount: number;
  refundedAmount: number;
  currency: string;
  expiresAt: Date;
};

function toProviderPayment(row: MockPaymentRow): ProviderPayment {
  const expired =
    row.status === "AUTHORIZED" && row.expiresAt.getTime() < Date.now();

  return {
    reference: row.reference,
    status: (expired ? "EXPIRED" : row.status) as ProviderPaymentStatus,
    amount: row.amount,
    capturedAmount: row.capturedAmount,
    refundedAmount: row.refundedAmount,
    currency: row.currency,
    expiresAt: row.expiresAt,
  };
}

/**
 * Simulert betalingsleverandor med egen reskontro i tabellen mock_payments.
 * Den oppforer seg som en ekte leverandor: statusene er de samme, reservasjonen
 * utloper, og capture og cancel avvises hvis betalingen star i feil tilstand.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";

  async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    const existing = await prisma.mockPayment.findFirst({
      where: { idempotencyKey: input.idempotencyKey },
    });

    if (existing) {
      return {
        payment: toProviderPayment(existing),
        redirectUrl: this.redirectUrl(existing.reference, input.returnUrl),
      };
    }

    const reference = `mock_${randomBytes(12).toString("hex")}`;
    const payment = await prisma.mockPayment.create({
      data: {
        reference,
        orderId: input.orderId,
        amount: input.amount,
        currency: input.currency,
        status: "CREATED",
        idempotencyKey: input.idempotencyKey,
        expiresAt: new Date(Date.now() + AUTHORIZATION_TTL_MINUTES * 60_000),
      },
    });

    return {
      payment: toProviderPayment(payment),
      redirectUrl: this.redirectUrl(reference, input.returnUrl),
    };
  }

  async getPayment(reference: string): Promise<ProviderPayment | null> {
    const row = await prisma.mockPayment.findUnique({ where: { reference } });
    return row ? toProviderPayment(row) : null;
  }

  async capture(reference: string, amount: number, idempotencyKey: string): Promise<ProviderPayment> {
    const current = await this.require(reference);

    if (current.status === "CAPTURED") {
      return current;
    }
    if (current.status === "EXPIRED") {
      throw new PaymentError("Reservasjonen er utlopt.", "EXPIRED");
    }
    if (current.status !== "AUTHORIZED") {
      throw new PaymentError(
        `Kan ikke trekke en betaling med status ${current.status}.`,
        "INVALID_STATE",
      );
    }
    if (amount > current.amount) {
      throw new PaymentError("Belopet overstiger reservasjonen.", "INVALID_STATE");
    }

    const updated = await prisma.mockPayment.update({
      where: { reference },
      data: { status: "CAPTURED", capturedAmount: amount, idempotencyKey },
    });

    return toProviderPayment(updated);
  }

  async cancel(reference: string, idempotencyKey: string): Promise<ProviderPayment> {
    const current = await this.require(reference);

    if (current.status === "CANCELLED" || current.status === "EXPIRED") {
      return current;
    }
    if (current.status === "CAPTURED") {
      throw new PaymentError(
        "Betalingen er allerede trukket og ma refunderes i stedet.",
        "INVALID_STATE",
      );
    }

    const updated = await prisma.mockPayment.update({
      where: { reference },
      data: { status: "CANCELLED", idempotencyKey },
    });

    return toProviderPayment(updated);
  }

  async refund(reference: string, amount: number, idempotencyKey: string): Promise<ProviderPayment> {
    const current = await this.require(reference);

    if (current.status !== "CAPTURED" && current.status !== "REFUNDED") {
      throw new PaymentError("Bare trukne betalinger kan refunderes.", "INVALID_STATE");
    }

    const refunded = Math.min(current.capturedAmount, current.refundedAmount + amount);
    const updated = await prisma.mockPayment.update({
      where: { reference },
      data: { status: "REFUNDED", refundedAmount: refunded, idempotencyKey },
    });

    return toProviderPayment(updated);
  }

  /**
   * Kalles fra den simulerte betalingssiden nar kunden bekrefter.
   * Hos en ekte leverandor skjer dette i leverandorens egen app.
   */
  async authorizeFromCheckout(reference: string): Promise<ProviderPayment> {
    const current = await this.require(reference);

    if (current.status === "AUTHORIZED") {
      return current;
    }
    if (current.status !== "CREATED") {
      throw new PaymentError(
        `Betalingen kan ikke reserveres fra status ${current.status}.`,
        "INVALID_STATE",
      );
    }

    const updated = await prisma.mockPayment.update({
      where: { reference },
      data: {
        status: "AUTHORIZED",
        authorizedAt: new Date(),
        expiresAt: new Date(Date.now() + AUTHORIZATION_TTL_MINUTES * 60_000),
      },
    });

    return toProviderPayment(updated);
  }

  /** Lar betalingssiden simulere at kunden avbryter eller at kortet avvises. */
  async failFromCheckout(reference: string, reason: "CANCELLED" | "FAILED"): Promise<ProviderPayment> {
    await this.require(reference);
    const updated = await prisma.mockPayment.update({
      where: { reference },
      data: { status: reason },
    });
    return toProviderPayment(updated);
  }

  private async require(reference: string): Promise<ProviderPayment> {
    const payment = await this.getPayment(reference);
    if (!payment) {
      throw new PaymentError(`Fant ingen betaling med referanse ${reference}.`, "NOT_FOUND");
    }
    return payment;
  }

  private redirectUrl(reference: string, returnUrl: string): string {
    const url = new URL(`/betaling/${reference}`, env.appUrl);
    url.searchParams.set("retur", returnUrl);
    return url.toString();
  }
}
