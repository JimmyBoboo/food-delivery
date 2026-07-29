import { requireStaff } from "@/server/auth/session";
import { handle } from "@/server/http";
import { updateClubSettings } from "@/server/services/admin";
import { clubSettingsSchema } from "@/server/validation";

export async function PATCH(request: Request) {
  return handle(async () => {
    const staff = await requireStaff(["ADMIN", "MANAGER"]);
    const input = clubSettingsSchema.parse(await request.json());
    const club = await updateClubSettings(staff.clubId, input);

    return {
      defaultPrepMinutes: club.defaultPrepMinutes,
      deliveryFee: club.deliveryFee,
      minimumOrderAmount: club.minimumOrderAmount,
    };
  });
}
