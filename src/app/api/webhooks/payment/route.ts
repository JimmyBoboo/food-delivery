import { prisma } from "@/lib/db";
import { AppError } from "@/server/errors";
import { handle, jsonError } from "@/server/http";
import { getPaymentProvider } from "@/server/payments";
import { SIGNATURE_HEADER, verifySignature } from "@/server/payments/webhook-signature";
import { syncPaymentState } from "@/server/services/orders";

type WebhookBody = {
  id: string;
  provider: string;
  type: string;
  reference: string;
};

/**
 * Tar imot betalingshendelser.
 *
 * Tre ting gjor handteringen robust, jf. paragraf 17:
 *   - Signaturen kontrolleres for noe behandles.
 *   - Hendelses-id lagres, slik at samme webhook to ganger ikke gjor skade.
 *   - Statusen hentes fra leverandorens API i stedet for a stole pa innholdet.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!verifySignature(rawBody, request.headers.get(SIGNATURE_HEADER))) {
    return jsonError("Ugyldig signatur.", 401, "INVALID_SIGNATURE");
  }

  return handle(async () => {
    const body = JSON.parse(rawBody) as WebhookBody;

    if (!body.id || !body.reference) {
      throw new AppError("Webhooken mangler id eller referanse.", 400, "INVALID_PAYLOAD");
    }

    const provider = body.provider ?? "mock";

    const alreadyHandled = await prisma.paymentWebhookEvent.findUnique({
      where: { provider_eventId: { provider, eventId: body.id } },
    });

    if (alreadyHandled) {
      return { ok: true, duplicate: true };
    }

    await prisma.paymentWebhookEvent.create({
      data: {
        provider,
        eventId: body.id,
        eventType: body.type ?? "ukjent",
        reference: body.reference,
        payload: JSON.parse(rawBody),
      },
    });

    const order = await prisma.order.findFirst({
      where: { paymentReference: body.reference },
      select: { id: true },
    });

    if (!order) {
      // Bestillingen kan vaere slettet, eller webhooken kan gjelde en annen
      // instans. Vi kvitterer likevel, slik at leverandoren ikke prover igjen.
      return { ok: true, unknownOrder: true };
    }

    const payment = await getPaymentProvider(provider).getPayment(body.reference);
    if (!payment) {
      return { ok: true, unknownPayment: true };
    }

    await syncPaymentState(order.id, payment);

    return { ok: true };
  });
}
