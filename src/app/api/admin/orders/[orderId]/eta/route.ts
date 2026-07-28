import { requireStaff } from "@/server/auth/session";
import { handle } from "@/server/http";
import { updateEta } from "@/server/services/orders";
import { updateEtaSchema } from "@/server/validation";

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;

  return handle(async () => {
    const staff = await requireStaff();
    const input = updateEtaSchema.parse(await request.json());

    const order = await updateEta({
      orderId,
      clubId: staff.clubId,
      userId: staff.userId,
      etaMinutes: input.etaMinutes,
      etaAt: input.etaAt,
    });

    return { estimatedDeliveryAt: order.estimatedDeliveryAt };
  });
}
