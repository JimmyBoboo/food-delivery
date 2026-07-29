import { requireStaff } from "@/server/auth/session";
import { handle } from "@/server/http";
import { saveSpecialDay } from "@/server/services/admin";
import { specialDaySchema } from "@/server/validation";

/** Oppretter eller oppdaterer avviket for en enkelt dato. */
export async function POST(request: Request) {
  return handle(async () => {
    const staff = await requireStaff(["ADMIN", "MANAGER"]);
    const input = specialDaySchema.parse(await request.json());
    return saveSpecialDay(staff.clubId, input);
  });
}
