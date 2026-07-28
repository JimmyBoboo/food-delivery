import { handle } from "@/server/http";
import { getOrderForCustomer } from "@/server/services/order-views";
import { refreshPaymentFromProvider } from "@/server/services/orders";

/**
 * Statussiden til kunden. Betalingsstatus hentes samtidig direkte fra
 * leverandoren, slik at flyten ikke er avhengig av at webhooken kom frem.
 */
export async function GET(_request: Request, context: { params: Promise<{ publicToken: string }> }) {
  const { publicToken } = await context.params;

  return handle(async () => {
    await refreshPaymentFromProvider(publicToken);
    return getOrderForCustomer(publicToken);
  });
}
