import { handle } from "@/server/http";
import { getClubBySlug } from "@/server/services/menu";

export async function GET(_request: Request, context: { params: Promise<{ clubSlug: string }> }) {
  const { clubSlug } = await context.params;
  return handle(async () => getClubBySlug(clubSlug));
}
