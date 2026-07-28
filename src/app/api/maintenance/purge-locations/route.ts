import { handle, jsonError } from "@/server/http";
import { purgeExpiredLocations } from "@/server/services/orders";

/**
 * Sletter noyaktige koordinater eldre enn 24 timer, jf. paragraf 12.
 *
 * Kjores som planlagt jobb. Pa Vercel settes den opp i vercel.json med
 * CRON_SECRET som Authorization-header.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return jsonError("Ugyldig hemmelighet.", 401, "UNAUTHORIZED");
  }

  return handle(async () => {
    const purged = await purgeExpiredLocations();
    return { purged };
  });
}

export const GET = POST;
