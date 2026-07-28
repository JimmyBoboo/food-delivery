import { clientKey, handle, rateLimit } from "@/server/http";
import { createOrder } from "@/server/services/orders";
import { createOrderSchema } from "@/server/validation";

export async function POST(request: Request) {
  return handle(async () => {
    rateLimit(clientKey(request, "create-order"), 20, 60_000);

    const input = createOrderSchema.parse(await request.json());
    const order = await createOrder(input);

    return { publicToken: order.publicToken, status: order.status };
  });
}
