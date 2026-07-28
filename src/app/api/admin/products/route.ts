import { requireStaff } from "@/server/auth/session";
import { handle } from "@/server/http";
import { createProduct, listCategories, listProductsForAdmin } from "@/server/services/admin";
import { productInputSchema } from "@/server/validation";

export async function GET() {
  return handle(async () => {
    const staff = await requireStaff();
    const [products, categories] = await Promise.all([
      listProductsForAdmin(staff.clubId),
      listCategories(staff.clubId),
    ]);
    return { products, categories };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const staff = await requireStaff(["ADMIN", "MANAGER"]);
    const input = productInputSchema.parse(await request.json());
    const product = await createProduct(staff.clubId, input);
    return { id: product.id };
  });
}
