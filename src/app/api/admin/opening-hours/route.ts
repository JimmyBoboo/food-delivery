import { requireStaff } from "@/server/auth/session";
import { handle } from "@/server/http";
import { listOpeningHours, saveOpeningHours } from "@/server/services/admin";
import { normalizeTimeOfDay, openingHoursSchema } from "@/server/validation";

export async function GET() {
  return handle(async () => {
    const staff = await requireStaff();
    return listOpeningHours(staff.clubId);
  });
}

export async function PATCH(request: Request) {
  return handle(async () => {
    const staff = await requireStaff(["ADMIN", "MANAGER"]);
    const body = (await request.json()) as {
      days?: Array<Record<string, unknown>>;
    };

    // Normaliser klokkeslett for Zod, slik at nettleserens «08:00:00.000»
    // ikke stopper lagringen for valideringen i det hele tatt.
    const normalized = {
      days: (body.days ?? []).map((day) => ({
        ...day,
        orderingOpensAt: normalizeTimeOfDay(day.orderingOpensAt) ?? day.orderingOpensAt,
        orderingClosesAt: normalizeTimeOfDay(day.orderingClosesAt) ?? day.orderingClosesAt,
        deliveryOpensAt: normalizeTimeOfDay(day.deliveryOpensAt) ?? day.deliveryOpensAt,
        deliveryClosesAt: normalizeTimeOfDay(day.deliveryClosesAt) ?? day.deliveryClosesAt,
      })),
    };

    const parsed = openingHoursSchema.safeParse(normalized);
    if (!parsed.success) {
      console.error("opening-hours validation failed", parsed.error.issues, normalized);
      throw parsed.error;
    }

    return saveOpeningHours(staff.clubId, parsed.data);
  });
}
