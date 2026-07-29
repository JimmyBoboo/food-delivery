import { requireStaff } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { handle } from "@/server/http";
import { setHoleDelivery } from "@/server/services/admin";
import { holeDeliverySchema } from "@/server/validation";

export async function POST(
  request: Request,
  context: { params: Promise<{ holeNumber: string }> },
) {
  const holeNumber = Number((await context.params).holeNumber);

  return handle(async () => {
    const staff = await requireStaff(["ADMIN", "MANAGER"]);
    const input = holeDeliverySchema.parse(await request.json());

    if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 36) {
      throw new AppError("Ugyldig hullnummer.", 400, "INVALID_HOLE");
    }

    const hole = await setHoleDelivery(staff.clubId, holeNumber, input.isDeliveryEnabled);
    return {
      holeNumber: hole.holeNumber,
      isDeliveryEnabled: hole.isDeliveryEnabled,
    };
  });
}
