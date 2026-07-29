import { requireStaff } from "@/server/auth/session";
import { handle } from "@/server/http";
import { createCategory, listCategories } from "@/server/services/admin";
import { categoryInputSchema } from "@/server/validation";

export async function GET() {
  return handle(async () => {
    const staff = await requireStaff();
    const categories = await listCategories(staff.clubId);
    return { categories };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const staff = await requireStaff(["ADMIN", "MANAGER"]);
    const input = categoryInputSchema.parse(await request.json());
    const category = await createCategory(staff.clubId, input);
    return { id: category.id };
  });
}
