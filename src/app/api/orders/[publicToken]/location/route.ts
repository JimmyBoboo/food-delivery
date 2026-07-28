import { clientKey, handle, rateLimit } from "@/server/http";
import { updateOrderLocation } from "@/server/services/orders";
import { updateLocationSchema } from "@/server/validation";

/**
 * Tar imot siste kjente posisjon mens bestillingen er aktiv.
 * Bare en rad lagres per bestilling, jf. paragraf 6.3.
 */
export async function POST(request: Request, context: { params: Promise<{ publicToken: string }> }) {
  const { publicToken } = await context.params;

  return handle(async () => {
    rateLimit(clientKey(request, "location"), 120, 60_000);

    const input = updateLocationSchema.parse(await request.json());
    return updateOrderLocation(publicToken, input);
  });
}
