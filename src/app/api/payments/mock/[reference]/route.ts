import { randomUUID } from "node:crypto";

import { env } from "@/lib/env";
import { AppError } from "@/server/errors";
import { handle } from "@/server/http";
import { MockPaymentProvider } from "@/server/payments/mock";
import { SIGNATURE_HEADER, signPayload } from "@/server/payments/webhook-signature";

const provider = new MockPaymentProvider();

/**
 * Handlingene den simulerte betalingssiden utfarer. Hos en ekte leverandor
 * skjer dette i Vipps-appen eller i kortvinduet.
 *
 * Etter hver handling sendes en webhook til var egen webhook-rute, slik at
 * hele kjeden fungerer akkurat som i produksjon.
 */
export async function POST(request: Request, context: { params: Promise<{ reference: string }> }) {
  const { reference } = await context.params;

  return handle(async () => {
    const { action } = (await request.json()) as { action?: string };

    let eventType: string;

    switch (action) {
      case "authorize":
        await provider.authorizeFromCheckout(reference);
        eventType = "payment.authorized";
        break;
      case "cancel":
        await provider.failFromCheckout(reference, "CANCELLED");
        eventType = "payment.cancelled";
        break;
      case "fail":
        await provider.failFromCheckout(reference, "FAILED");
        eventType = "payment.failed";
        break;
      default:
        throw new AppError(`Ukjent handling: ${action}`, 400, "UNKNOWN_ACTION");
    }

    await sendWebhook(reference, eventType);

    return { ok: true };
  });
}

async function sendWebhook(reference: string, type: string) {
  const body = JSON.stringify({
    id: randomUUID(),
    provider: "mock",
    type,
    reference,
    occurredAt: new Date().toISOString(),
  });

  try {
    await fetch(new URL("/api/webhooks/payment", env.appUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [SIGNATURE_HEADER]: signPayload(body),
      },
      body,
    });
  } catch (error) {
    // Kunden faller tilbake pa at statussiden sporr leverandoren direkte.
    console.warn("Kunne ikke levere simulert webhook", error);
  }
}
