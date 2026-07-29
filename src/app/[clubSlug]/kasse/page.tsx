import { notFound } from "next/navigation";

import { CheckoutView } from "@/components/checkout/checkout-view";
import { NotFoundError } from "@/server/errors";
import {
  getAvailability,
  getClubBySlug,
  getDeliveryPoints,
  getHoles,
} from "@/server/services/menu";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ clubSlug: string }>;
}) {
  const { clubSlug } = await params;

  try {
    const club = await getClubBySlug(clubSlug);
    const [deliveryPoints, holes, availability] = await Promise.all([
      getDeliveryPoints(club.id),
      getHoles(club.id),
      getAvailability(club.id),
    ]);

    return (
      <CheckoutView
        club={club}
        holes={holes}
        deliveryPoints={deliveryPoints}
        // Tar hensyn til bade pauseknappen og leveringsvinduet i apningstidene.
        isCourseDeliveryPaused={availability.isCourseDeliveryPaused}
      />
    );
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
