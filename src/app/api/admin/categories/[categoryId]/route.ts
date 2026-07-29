import { requireStaff } from "@/server/auth/session";
import { handle } from "@/server/http";
import { deleteCategory, updateCategory } from "@/server/services/admin";
import { categoryPatchSchema } from "@/server/validation";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ categoryId: string }> },
) {
  const { categoryId } = await context.params;

  return handle(async () => {
    const staff = await requireStaff(["ADMIN", "MANAGER"]);
    const input = categoryPatchSchema.parse(await request.json());
    const category = await updateCategory(staff.clubId, categoryId, input);
    return { id: category.id };
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ categoryId: string }> },
) {
  const { categoryId } = await context.params;

  return handle(async () => {
    const staff = await requireStaff(["ADMIN", "MANAGER"]);
    await deleteCategory(staff.clubId, categoryId);
    return { ok: true };
  });
}
