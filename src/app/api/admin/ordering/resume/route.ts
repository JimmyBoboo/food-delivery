import { requireStaff } from "@/server/auth/session";
import { handle } from "@/server/http";
import { resumeOrdering } from "@/server/services/admin";

export async function POST() {
  return handle(async () => {
    const staff = await requireStaff(["ADMIN", "MANAGER", "KITCHEN"]);
    const club = await resumeOrdering(staff.clubId);

    return {
      isOrderingEnabled: club.isOrderingEnabled,
      isCourseDeliveryPaused: club.isCourseDeliveryPaused,
    };
  });
}
