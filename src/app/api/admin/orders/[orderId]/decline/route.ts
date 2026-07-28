import { requireStaff } from "@/server/auth/session";
import { handle } from "@/server/http";
import { declineOrder } from "@/server/services/orders";
import { declineOrderSchema } from "@/server/validation";

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;

  return handle(async () => {
    const staff = await requireStaff(["ADMIN", "MANAGER", "KITCHEN"]);
    const input = declineOrderSchema.parse(await request.json());

    const order = await declineOrder({
      orderId,
      clubId: staff.clubId,
      userId: staff.userId,
      reason: input.reason,
    });

    return { status: order.status, declineReason: order.declineReason };
  });
}
