import { requireStaff } from "@/server/auth/session";
import { handle } from "@/server/http";
import { assignDriver } from "@/server/services/orders";
import { assignDriverSchema } from "@/server/validation";

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;

  return handle(async () => {
    const staff = await requireStaff(["ADMIN", "MANAGER", "KITCHEN"]);
    const input = assignDriverSchema.parse(await request.json());

    const order = await assignDriver({
      orderId,
      clubId: staff.clubId,
      userId: staff.userId,
      driverId: input.driverId,
    });

    return { assignedDriverId: order.assignedDriverId };
  });
}
