import { requireStaff } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { clientKey, handle, rateLimit } from "@/server/http";
import { uploadProductImage } from "@/server/services/admin";

export async function POST(request: Request) {
  return handle(async () => {
    const staff = await requireStaff(["ADMIN", "MANAGER"]);
    rateLimit(clientKey(request, "bildeopplasting"), 30, 60_000);

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new AppError("Legg ved en bildefil.", 400, "MISSING_FILE");
    }

    const url = await uploadProductImage(staff.clubId, file);
    return { url };
  });
}
