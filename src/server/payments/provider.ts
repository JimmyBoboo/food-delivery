/**
 * Leverandoruavhengig betalingslag, jf. paragraf 5 i spesifikasjonen.
 *
 * Flyten er alltid den samme uansett leverandor:
 *   1. Bestillingen opprettes.
 *   2. Belopet reserveres (authorize).
 *   3. Restauranten godkjenner  -> capture.
 *      Restauranten avslar      -> cancel.
 *
 * Vipps ePayment eller Stripe kan implementere det samme grensesnittet uten
 * at ordreflyten endres.
 */

export type ProviderPaymentStatus =
  | "CREATED"
  | "AUTHORIZED"
  | "CAPTURED"
  | "CANCELLED"
  | "FAILED"
  | "EXPIRED"
  | "REFUNDED";

export type ProviderPayment = {
  reference: string;
  status: ProviderPaymentStatus;
  /** Belop i ore. */
  amount: number;
  capturedAmount: number;
  refundedAmount: number;
  currency: string;
  expiresAt: Date;
};

export type CreateSessionInput = {
  orderId: string;
  /** Belop i ore. */
  amount: number;
  currency: string;
  orderNumber: number;
  customerPhone: string;
  returnUrl: string;
  /** Hindrer at gjentatte klikk oppretter flere betalinger. */
  idempotencyKey: string;
};

export type CreateSessionResult = {
  payment: ProviderPayment;
  /** Siden kunden sendes til for a fullfore betalingen. */
  redirectUrl: string;
};

export interface PaymentProvider {
  readonly name: string;
  createSession(input: CreateSessionInput): Promise<CreateSessionResult>;
  /** Leser status direkte hos leverandoren, uten a stole pa webhook alene. */
  getPayment(reference: string): Promise<ProviderPayment | null>;
  capture(reference: string, amount: number, idempotencyKey: string): Promise<ProviderPayment>;
  cancel(reference: string, idempotencyKey: string): Promise<ProviderPayment>;
  refund(reference: string, amount: number, idempotencyKey: string): Promise<ProviderPayment>;
}

export class PaymentError extends Error {
  constructor(
    message: string,
    readonly code:
      | "NOT_FOUND"
      | "INVALID_STATE"
      | "EXPIRED"
      | "PROVIDER_UNAVAILABLE"
      | "DECLINED" = "INVALID_STATE",
  ) {
    super(message);
    this.name = "PaymentError";
  }
}
