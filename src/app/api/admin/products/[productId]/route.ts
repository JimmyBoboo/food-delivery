import { requireStaff } from "@/server/auth/session";
import { handle } from "@/server/http";
import { deleteProduct, updateProduct } from "@/server/services/admin";
import { productPatchSchema } from "@/server/validation";

export async function PATCH(request: Request, context: { params: Promise<{ productId: string }> }) {
  const { productId } = await context.params;

  return handle(async () => {
    const staff = await requireStaff(["ADMIN", "MANAGER"]);
    const input = productPatchSchema.parse(await request.json());
    const product = await updateProduct(staff.clubId, productId, input);
    return { id: product.id };
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ productId: string }> },
) {
  const { productId } = await context.params;

  return handle(async () => {
    const staff = await requireStaff(["ADMIN", "MANAGER"]);
    await deleteProduct(staff.clubId, productId);
    return { ok: true };
  });
}
