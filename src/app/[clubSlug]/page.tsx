import { notFound } from "next/navigation";

import { MenuView } from "@/components/menu/menu-view";
import { NotFoundError } from "@/server/errors";
import { getAvailability, getClubBySlug, getMenu } from "@/server/services/menu";

export const dynamic = "force-dynamic";

export default async function ClubMenuPage({
  params,
}: {
  params: Promise<{ clubSlug: string }>;
}) {
  const { clubSlug } = await params;

  try {
    const club = await getClubBySlug(clubSlug);
    const [categories, availability] = await Promise.all([
      getMenu(club.id),
      getAvailability(club.id),
    ]);

    return <MenuView club={club} categories={categories} availability={availability} />;
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
