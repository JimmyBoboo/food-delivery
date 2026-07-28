import { redirect } from "next/navigation";

import { SettingsView } from "@/components/admin/settings-view";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getStaffSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const session = await getStaffSession();
  if (!session) redirect("/admin/login");

  const club = await prisma.club.findUniqueOrThrow({
    where: { id: session.clubId },
    select: {
      name: true,
      slug: true,
      isOrderingEnabled: true,
      isCourseDeliveryPaused: true,
      pauseMessage: true,
      defaultPrepMinutes: true,
      deliveryFee: true,
      minimumOrderAmount: true,
    },
  });

  const holes = await prisma.hole.findMany({
    where: { clubId: session.clubId },
    orderBy: { holeNumber: "asc" },
    select: { holeNumber: true, isDeliveryEnabled: true },
  });

  return (
    <SettingsView
      club={club}
      holes={holes}
      orderUrl={new URL(`/${club.slug}`, env.appUrl).toString()}
    />
  );
}
