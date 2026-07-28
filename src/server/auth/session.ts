import { prisma } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ForbiddenError, UnauthorizedError } from "@/server/errors";

import type { UserRole } from "@/generated/prisma/enums";

export type StaffSession = {
  userId: string;
  clubId: string;
  clubSlug: string;
  name: string;
  email: string;
  role: UserRole;
};

/**
 * Leser Supabase-sesjonen og slar opp den ansatte i users-tabellen.
 * Returnerer null hvis brukeren ikke er innlogget eller er deaktivert.
 */
export async function getStaffSession(): Promise<StaffSession | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const staff = await prisma.user.findUnique({
    where: { id: user.id },
    include: { club: { select: { slug: true } } },
  });

  if (!staff || !staff.isActive) return null;

  return {
    userId: staff.id,
    clubId: staff.clubId,
    clubSlug: staff.club.slug,
    name: staff.name,
    email: staff.email,
    role: staff.role,
  };
}

/** Krever innlogging, og eventuelt en av de oppgitte rollene. */
export async function requireStaff(allowedRoles?: UserRole[]): Promise<StaffSession> {
  const session = await getStaffSession();

  if (!session) {
    throw new UnauthorizedError();
  }

  if (allowedRoles && !allowedRoles.includes(session.role)) {
    throw new ForbiddenError(
      `Handlingen krever en av rollene ${allowedRoles.join(", ")}. Du har ${session.role}.`,
    );
  }

  return session;
}
