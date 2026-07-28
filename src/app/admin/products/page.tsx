import { redirect } from "next/navigation";

import { ProductsAdmin } from "@/components/admin/products-admin";
import { getStaffSession } from "@/server/auth/session";
import { listCategories, listProductsForAdmin } from "@/server/services/admin";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const session = await getStaffSession();
  if (!session) redirect("/admin/login");

  const [products, categories] = await Promise.all([
    listProductsForAdmin(session.clubId),
    listCategories(session.clubId),
  ]);

  return <ProductsAdmin initialProducts={products} categories={categories} role={session.role} />;
}
