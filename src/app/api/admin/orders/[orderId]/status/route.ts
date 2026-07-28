import { requireStaff } from "@/server/auth/session";
import { handle } from "@/server/http";
import { updateOrderStatus } from "@/server/services/orders";
import { updateStatusSchema } from "@/server/validation";

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;

  return handle(async () => {
    const staff = await requireStaff();
    const input = updateStatusSchema.parse(await request.json());

    const order = await updateOrderStatus({
      orderId,
      clubId: staff.clubId,
      userId: staff.userId,
      status: input.status,
    });

    return { status: order.status };
  });
}
