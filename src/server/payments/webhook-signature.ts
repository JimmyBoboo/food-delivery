import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

export const SIGNATURE_HEADER = "x-payment-signature";

export function signPayload(rawBody: string): string {
  return createHmac("sha256", env.paymentWebhookSecret).update(rawBody).digest("hex");
}

/** Sammenligningen er konstanttid for a unnga timing-angrep. */
export function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;

  const expected = Buffer.from(signPayload(rawBody), "utf8");
  const received = Buffer.from(signature, "utf8");

  if (expected.length !== received.length) return false;

  return timingSafeEqual(expected, received);
}
