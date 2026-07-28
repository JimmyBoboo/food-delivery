import { clientKey, handle, rateLimit } from "@/server/http";
import { suggestHoles } from "@/server/geo/holes";
import { getClubBySlug } from "@/server/services/menu";
import { suggestHoleSchema } from "@/server/validation";

/**
 * Foreslar hvilket hull kunden er pa. Kunden ma alltid bekrefte forslaget,
 * og kan alltid velge hull manuelt i stedet, jf. paragraf 6.2.
 */
export async function POST(request: Request) {
  return handle(async () => {
    rateLimit(clientKey(request, "suggest-hole"), 30, 60_000);

    const input = suggestHoleSchema.parse(await request.json());
    const club = await getClubBySlug(input.clubSlug);

    const suggestions = await suggestHoles(
      club.id,
      input.latitude,
      input.longitude,
      input.accuracyMeters,
    );

    return {
      suggestions: suggestions.map((suggestion) => ({
        holeNumber: suggestion.holeNumber,
        holeName: suggestion.holeName,
        confidence: suggestion.confidence,
        distanceMeters: suggestion.distanceMeters,
        isInside: suggestion.isInside,
        nearestFeature: suggestion.nearestFeature,
      })),
      accuracyMeters: input.accuracyMeters,
    };
  });
}
