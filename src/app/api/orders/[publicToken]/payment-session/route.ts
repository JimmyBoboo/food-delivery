import { clientKey, handle, rateLimit } from "@/server/http";
import { createPaymentSession } from "@/server/services/orders";

export async function POST(request: Request, context: { params: Promise<{ publicToken: string }> }) {
  const { publicToken } = await context.params;

  return handle(async () => {
    rateLimit(clientKey(request, "payment-session"), 20, 60_000);
    return createPaymentSession(publicToken);
  });
}
