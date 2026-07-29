import { requireStaff } from "@/server/auth/session";
import { handle } from "@/server/http";
import { deleteSpecialDay } from "@/server/services/admin";
import { isoDateSchema } from "@/server/validation";

export async function DELETE(_request: Request, context: { params: Promise<{ date: string }> }) {
  const { date } = await context.params;

  return handle(async () => {
    const staff = await requireStaff(["ADMIN", "MANAGER"]);
    return deleteSpecialDay(staff.clubId, isoDateSchema.parse(date));
  });
}
