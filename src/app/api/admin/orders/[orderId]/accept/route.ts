import { requireStaff } from "@/server/auth/session";
import { handle } from "@/server/http";
import { acceptOrder } from "@/server/services/orders";
import { acceptOrderSchema } from "@/server/validation";

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;

  return handle(async () => {
    const staff = await requireStaff(["ADMIN", "MANAGER", "KITCHEN"]);
    const input = acceptOrderSchema.parse(await request.json());

    const order = await acceptOrder({
      orderId,
      clubId: staff.clubId,
      userId: staff.userId,
      etaMinutes: input.etaMinutes,
      etaAt: input.etaAt,
    });

    return { status: order.status, estimatedDeliveryAt: order.estimatedDeliveryAt };
  });
}
