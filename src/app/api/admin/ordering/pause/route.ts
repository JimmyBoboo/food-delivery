import { requireStaff } from "@/server/auth/session";
import { handle } from "@/server/http";
import { pauseOrdering } from "@/server/services/admin";
import { pauseOrderingSchema } from "@/server/validation";

export async function POST(request: Request) {
  return handle(async () => {
    const staff = await requireStaff(["ADMIN", "MANAGER", "KITCHEN"]);
    const input = pauseOrderingSchema.parse(await request.json());

    const club = await pauseOrdering(staff.clubId, input.scope, input.message);

    return {
      isOrderingEnabled: club.isOrderingEnabled,
      isCourseDeliveryPaused: club.isCourseDeliveryPaused,
    };
  });
}
