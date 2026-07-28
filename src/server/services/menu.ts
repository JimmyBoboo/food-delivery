import { prisma } from "@/lib/db";
import { NotFoundError } from "@/server/errors";

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

/**
 * Avgjor om klubben tar imot bestillinger na, basert pa pauseknapper og
 * apningstider.
 */
export async function getAvailability(clubId: string) {
  const club = await prisma.club.findUniqueOrThrow({ where: { id: clubId } });
  const now = new Date();

  const special = await prisma.specialOpeningHours.findFirst({
    where: {
      clubId,
      date: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())),
    },
  });

  const regular = await prisma.openingHours.findUnique({
    where: { clubId_dayOfWeek: { clubId, dayOfWeek: now.getDay() } },
  });

  const currentTime = now.toTimeString().slice(0, 5);
  const opens = special?.orderingOpensAt ?? regular?.orderingOpensAt ?? null;
  const closes = special?.orderingClosesAt ?? regular?.orderingClosesAt ?? null;

  const withinHours =
    special?.isClosed === true
      ? false
      : opens === null || closes === null
        ? true
        : currentTime >= opens && currentTime <= closes;

  const reasons: string[] = [];
  if (!club.isOrderingEnabled) {
    reasons.push(club.pauseMessage ?? "Restauranten tar ikke imot bestillinger akkurat na.");
  }
  if (special?.isClosed) {
    reasons.push(special.reason ?? "Restauranten er stengt i dag.");
  } else if (!withinHours && opens && closes) {
    reasons.push(`Vi tar imot bestillinger mellom ${opens} og ${closes}.`);
  }

  return {
    isOrderingEnabled: club.isOrderingEnabled && withinHours,
    isCourseDeliveryPaused: club.isCourseDeliveryPaused,
    pauseMessage: club.pauseMessage,
    courseDeliveryMessage: club.isCourseDeliveryPaused
      ? "Levering pa banen er satt pa pause. Du kan hente bestillingen i restauranten."
      : null,
    reasons,
    opensAt: opens,
    closesAt: closes,
    defaultPrepMinutes: club.defaultPrepMinutes,
    deliveryFee: club.deliveryFee,
    freeDeliveryThreshold: club.freeDeliveryThreshold,
    minimumOrderAmount: club.minimumOrderAmount,
  };
}
