import { requireStaff } from "@/server/auth/session";
import { handle } from "@/server/http";
import { getOrderForStaff } from "@/server/services/order-views";

export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;

  return handle(async () => {
    const staff = await requireStaff();
    return getOrderForStaff(orderId, staff.clubId);
  });
}
