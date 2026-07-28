import { handle } from "@/server/http";
import { getClubBySlug, getDeliveryPoints, getHoles, getMenu } from "@/server/services/menu";

export async function GET(_request: Request, context: { params: Promise<{ clubSlug: string }> }) {
  const { clubSlug } = await context.params;

  return handle(async () => {
    const club = await getClubBySlug(clubSlug);
    const [categories, deliveryPoints, holes] = await Promise.all([
      getMenu(club.id),
      getDeliveryPoints(club.id),
      getHoles(club.id),
    ]);

    return { club, categories, deliveryPoints, holes };
  });
}
