import { requireStaff } from "@/server/auth/session";
import { handle } from "@/server/http";
import { setProductAvailability } from "@/server/services/admin";
import { availabilitySchema } from "@/server/validation";

/** Kjokkenet kan markere varer som utsolgt uten a vaere administrator. */
export async function POST(request: Request, context: { params: Promise<{ productId: string }> }) {
  const { productId } = await context.params;

  return handle(async () => {
    const staff = await requireStaff();
    const input = availabilitySchema.parse(await request.json());
    const product = await setProductAvailability(staff.clubId, productId, input.isAvailable);
    return { id: product.id, isAvailable: product.isAvailable };
  });
}
