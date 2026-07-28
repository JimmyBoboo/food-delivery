import { MockPaymentProvider } from "@/server/payments/mock";
import type { PaymentProvider, ProviderPaymentStatus } from "@/server/payments/provider";

import { PaymentStatus } from "@/generated/prisma/enums";

const providers: Record<string, PaymentProvider> = {
  mock: new MockPaymentProvider(),
};

/**
 * Velger betalingsleverandor. Naar Vipps ePayment eller Stripe legges til,
 * registreres de her og velges gjennom PAYMENT_PROVIDER.
 */
export function getPaymentProvider(name?: string): PaymentProvider {
  const key = name ?? process.env.PAYMENT_PROVIDER ?? "mock";
  const provider = providers[key];
  if (!provider) {
    throw new Error(`Ukjent betalingsleverandor: ${key}`);
  }
  return provider;
}

export function toPaymentStatus(status: ProviderPaymentStatus): PaymentStatus {
  switch (status) {
    case "CREATED":
      return PaymentStatus.PENDING;
    case "AUTHORIZED":
      return PaymentStatus.AUTHORIZED;
    case "CAPTURED":
      return PaymentStatus.CAPTURED;
    case "CANCELLED":
      return PaymentStatus.CANCELLED;
    case "EXPIRED":
      return PaymentStatus.EXPIRED;
    case "REFUNDED":
      return PaymentStatus.REFUNDED;
    case "FAILED":
    default:
      return PaymentStatus.FAILED;
  }
}

export { PaymentError } from "@/server/payments/provider";
export type { PaymentProvider, ProviderPayment } from "@/server/payments/provider";
