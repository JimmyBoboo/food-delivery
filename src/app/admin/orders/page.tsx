import { redirect } from "next/navigation";

import { OrdersBoard } from "@/components/admin/orders-board";
import { prisma } from "@/lib/db";
import { getStaffSession } from "@/server/auth/session";
import { listDrivers } from "@/server/services/admin";
import { listOrdersForClub } from "@/server/services/order-views";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const session = await getStaffSession();
  if (!session) redirect("/admin/login");

  const [orders, drivers, club] = await Promise.all([
    listOrdersForClub(session.clubId),
    listDrivers(session.clubId),
    prisma.club.findUniqueOrThrow({
      where: { id: session.clubId },
      select: {
        name: true,
        isOrderingEnabled: true,
        isCourseDeliveryPaused: true,
        defaultPrepMinutes: true,
      },
    }),
  ]);

  return (
    <OrdersBoard
      clubId={session.clubId}
      clubName={club.name}
      initialOrders={orders}
      drivers={drivers}
      isOrderingEnabled={club.isOrderingEnabled}
      isCourseDeliveryPaused={club.isCourseDeliveryPaused}
      defaultPrepMinutes={club.defaultPrepMinutes}
    />
  );
}
