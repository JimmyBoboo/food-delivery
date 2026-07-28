import { requireStaff } from "@/server/auth/session";
import { handle } from "@/server/http";
import { listOrdersForClub } from "@/server/services/order-views";

import { OrderStatus } from "@/generated/prisma/enums";

export async function GET(request: Request) {
  return handle(async () => {
    const staff = await requireStaff();
    const url = new URL(request.url);

    const statusParam = url.searchParams.getAll("status");
    const statuses = statusParam
      .filter((value): value is OrderStatus => value in OrderStatus)
      .map((value) => value as OrderStatus);

    const orders = await listOrdersForClub(staff.clubId, {
      statuses: statuses.length > 0 ? statuses : undefined,
    });

    return { orders };
  });
}
