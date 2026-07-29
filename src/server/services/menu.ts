import { prisma } from "@/lib/db";
import { NotFoundError } from "@/server/errors";
import { clubDate, clubDayOfWeek, clubTime, isoDateToUtc } from "@/server/time";

export type MenuOptionValue = {
  id: string;
  name: string;
  additionalPrice: number;
  isAvailable: boolean;
};

export type MenuOption = {
  id: string;
  name: string;
  required: boolean;
  minimumChoices: number;
  maximumChoices: number;
  values: MenuOptionValue[];
};

export type MenuProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  allergens: string[];
  preparationMinutes: number;
  isAvailable: boolean;
  requiresAgeVerification: boolean;
  options: MenuOption[];
};

export type MenuCategory = {
  id: string;
  name: string;
  description: string | null;
  products: MenuProduct[];
};

export type ClubSummary = {
  id: string;
  name: string;
  slug: string;
  currency: string;
  phone: string | null;
  isOrderingEnabled: boolean;
  isCourseDeliveryPaused: boolean;
  pauseMessage: string | null;
  defaultPrepMinutes: number;
  deliveryFee: number;
  freeDeliveryThreshold: number | null;
  minimumOrderAmount: number;
};

export async function getClubBySlug(slug: string): Promise<ClubSummary> {
  const club = await prisma.club.findUnique({ where: { slug } });
  if (!club) throw new NotFoundError("Fant ikke golfklubben.");

  return {
    id: club.id,
    name: club.name,
    slug: club.slug,
    currency: club.currency,
    phone: club.phone,
    isOrderingEnabled: club.isOrderingEnabled,
    isCourseDeliveryPaused: club.isCourseDeliveryPaused,
    pauseMessage: club.pauseMessage,
    defaultPrepMinutes: club.defaultPrepMinutes,
    deliveryFee: club.deliveryFee,
    freeDeliveryThreshold: club.freeDeliveryThreshold,
    minimumOrderAmount: club.minimumOrderAmount,
  };
}

export async function getMenu(clubId: string): Promise<MenuCategory[]> {
  const categories = await prisma.category.findMany({
    where: { clubId, isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      products: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          options: {
            orderBy: { sortOrder: "asc" },
            include: { values: { orderBy: { sortOrder: "asc" } } },
          },
        },
      },
    },
  });

  return categories
    .map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      products: category.products.map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        imageUrl: product.imageUrl,
        allergens: product.allergens,
        preparationMinutes: product.preparationMinutes,
        isAvailable: product.isAvailable,
        requiresAgeVerification: product.requiresAgeVerification,
        options: product.options.map((option) => ({
          id: option.id,
          name: option.name,
          required: option.required,
          minimumChoices: option.minimumChoices,
          maximumChoices: option.maximumChoices,
          values: option.values.map((value) => ({
            id: value.id,
            name: value.name,
            additionalPrice: value.additionalPrice,
            isAvailable: value.isAvailable,
          })),
        })),
      })),
    }))
    .filter((category) => category.products.length > 0);
}

export type DeliveryOption = {
  id: string;
  name: string;
  instructions: string | null;
  holeNumber: number | null;
  isPickup: boolean;
};

export async function getDeliveryPoints(clubId: string): Promise<DeliveryOption[]> {
  const points = await prisma.deliveryPoint.findMany({
    where: { clubId, isActive: true },
    orderBy: { sortOrder: "asc" },
    include: { hole: { select: { holeNumber: true } } },
  });

  return points.map((point) => ({
    id: point.id,
    name: point.name,
    instructions: point.instructions,
    holeNumber: point.hole?.holeNumber ?? null,
    isPickup: point.isPickup,
  }));
}

export async function getHoles(clubId: string) {
  const holes = await prisma.hole.findMany({
    where: { clubId },
    orderBy: { holeNumber: "asc" },
    select: { id: true, holeNumber: true, name: true, par: true, isDeliveryEnabled: true },
  });
  return holes;
}

/** Klokkeslettene ligger som «08:00», og da kan de sammenlignes som tekst. */
function isWithin(now: string, opens: string, closes: string): boolean {
  return now >= opens && now <= closes;
}

/**
 * Avgjor om klubben tar imot bestillinger na, basert pa pauseknapper og
 * apningstider. Alle klokkeslett tolkes i klubbens egen tidssone.
 */
export async function getAvailability(clubId: string) {
  const club = await prisma.club.findUniqueOrThrow({ where: { id: clubId } });

  const today = clubDate(club.timezone);
  const currentTime = clubTime(club.timezone);

  const [special, regular] = await Promise.all([
    prisma.specialOpeningHours.findFirst({
      where: { clubId, date: isoDateToUtc(today) },
    }),
    prisma.openingHours.findUnique({
      where: { clubId_dayOfWeek: { clubId, dayOfWeek: clubDayOfWeek(club.timezone) } },
    }),
  ]);

  // Spesialdagen overstyrer uketabellen, men bare for feltene den faktisk
  // fyller ut. Den har ingen egne leveringstider.
  const opens = special?.orderingOpensAt ?? regular?.orderingOpensAt ?? null;
  const closes = special?.orderingClosesAt ?? regular?.orderingClosesAt ?? null;
  const deliveryOpens = regular?.deliveryOpensAt ?? opens;
  const deliveryCloses = regular?.deliveryClosesAt ?? closes;

  // Dager uten registrerte apningstider regnes som stengt. Da blir en dag
  // stengt ved a fjerne raden, og en glemt oppsett stopper bestillinger i
  // stedet for a slippe dem gjennom dognet rundt.
  const withinHours =
    special?.isClosed === true || opens === null || closes === null
      ? false
      : isWithin(currentTime, opens, closes);

  const withinDeliveryHours =
    withinHours && deliveryOpens !== null && deliveryCloses !== null
      ? isWithin(currentTime, deliveryOpens, deliveryCloses)
      : false;

  const reasons: string[] = [];
  if (!club.isOrderingEnabled) {
    reasons.push(club.pauseMessage ?? "Restauranten tar ikke imot bestillinger akkurat na.");
  }
  if (special?.isClosed) {
    reasons.push(special.reason ?? "Restauranten er stengt i dag.");
  } else if (opens === null || closes === null) {
    reasons.push("Vi har ingen apningstider registrert i dag.");
  } else if (!withinHours) {
    reasons.push(`Vi tar imot bestillinger mellom ${opens} og ${closes}.`);
  }

  const isCourseDeliveryPaused = club.isCourseDeliveryPaused || !withinDeliveryHours;

  return {
    isOrderingEnabled: club.isOrderingEnabled && withinHours,
    isCourseDeliveryPaused,
    pauseMessage: club.pauseMessage,
    courseDeliveryMessage: !isCourseDeliveryPaused
      ? null
      : club.isCourseDeliveryPaused
        ? "Levering pa banen er satt pa pause. Du kan hente bestillingen i restauranten."
        : deliveryOpens && deliveryCloses
          ? `Vi kjorer ut pa banen mellom ${deliveryOpens} og ${deliveryCloses}. Utenfor det kan du hente bestillingen selv.`
          : "Levering pa banen er ikke tilgjengelig na. Du kan hente bestillingen i restauranten.",
    reasons,
    opensAt: opens,
    closesAt: closes,
    deliveryOpensAt: deliveryOpens,
    deliveryClosesAt: deliveryCloses,
    defaultPrepMinutes: club.defaultPrepMinutes,
    deliveryFee: club.deliveryFee,
    freeDeliveryThreshold: club.freeDeliveryThreshold,
    minimumOrderAmount: club.minimumOrderAmount,
  };
}
