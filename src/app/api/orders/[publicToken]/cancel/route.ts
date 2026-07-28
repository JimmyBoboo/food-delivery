import { handle } from "@/server/http";
import { cancelByCustomer } from "@/server/services/orders";

export async function POST(_request: Request, context: { params: Promise<{ publicToken: string }> }) {
  const { publicToken } = await context.params;

  return handle(async () => {
    const order = await cancelByCustomer(publicToken);
    return { status: order.status };
  });
}
