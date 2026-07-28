import { requireStaff } from "@/server/auth/session";
import { handle } from "@/server/http";
import { reportCustomerNotFound } from "@/server/services/orders";

/** Leveringspersonen rapporterer at kunden ikke ble funnet, jf. paragraf 3.3. */
export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await context.params;

  return handle(async () => {
    const staff = await requireStaff();
    const body = (await request.json().catch(() => ({}))) as { message?: string };

    await reportCustomerNotFound({
      orderId,
      clubId: staff.clubId,
      userId: staff.userId,
      message: body.message,
    });

    return { ok: true };
  });
}
