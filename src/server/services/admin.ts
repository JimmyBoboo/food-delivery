import { prisma } from "@/lib/db";
import { kroner } from "@/lib/money";
import { AppError, NotFoundError } from "@/server/errors";
import type {
  categoryInputSchema,
  categoryPatchSchema,
  productInputSchema,
  productPatchSchema,
} from "@/server/validation";

import type { z } from "zod";

export async function listProductsForAdmin(clubId: string) {
  const products = await prisma.product.findMany({
    where: { clubId },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
    include: { category: { select: { id: true, name: true } } },
  });

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
    imageUrl: product.imageUrl,
    allergens: product.allergens,
    preparationMinutes: product.preparationMinutes,
    isAvailable: product.isAvailable,
    requiresAgeVerification: product.requiresAgeVerification,
    sortOrder: product.sortOrder,
    category: product.category,
  }));
}

export async function listCategories(clubId: string) {
  const categories = await prisma.category.findMany({
    where: { clubId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      sortOrder: true,
      isActive: true,
      _count: { select: { products: true } },
    },
  });

  return categories.map(({ _count, ...category }) => ({
    ...category,
    productCount: _count.products,
  }));
}

/** Neste ledige plass bakerst, slik at nytt innhold ikke dukker opp midt i menyen. */
async function nextCategorySortOrder(clubId: string): Promise<number> {
  const last = await prisma.category.findFirst({
    where: { clubId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  return last ? last.sortOrder + 1 : 0;
}

async function assertCategoryNameIsFree(clubId: string, name: string, exceptId?: string) {
  const duplicate = await prisma.category.findFirst({
    where: {
      clubId,
      name: { equals: name, mode: "insensitive" },
      id: exceptId ? { not: exceptId } : undefined,
    },
    select: { id: true },
  });

  if (duplicate) {
    throw new AppError(`Det finnes alt en kategori som heter «${name}».`, 409, "CATEGORY_EXISTS");
  }
}

export async function createCategory(clubId: string, input: z.infer<typeof categoryInputSchema>) {
  await assertCategoryNameIsFree(clubId, input.name);

  return prisma.category.create({
    data: {
      clubId,
      name: input.name,
      description: input.description ?? null,
      sortOrder: input.sortOrder ?? (await nextCategorySortOrder(clubId)),
      isActive: input.isActive,
    },
  });
}

export async function updateCategory(
  clubId: string,
  categoryId: string,
  input: z.infer<typeof categoryPatchSchema>,
) {
  const category = await prisma.category.findFirst({ where: { id: categoryId, clubId } });
  if (!category) throw new NotFoundError("Fant ikke kategorien.");

  if (input.name && input.name !== category.name) {
    await assertCategoryNameIsFree(clubId, input.name, categoryId);
  }

  return prisma.category.update({
    where: { id: categoryId },
    data: {
      name: input.name,
      description: input.description,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
  });
}

export async function deleteCategory(clubId: string, categoryId: string) {
  const category = await prisma.category.findFirst({ where: { id: categoryId, clubId } });
  if (!category) throw new NotFoundError("Fant ikke kategorien.");

  const products = await prisma.product.count({ where: { categoryId } });

  // Product.category har onDelete: Restrict, sa databasen ville avvist slettingen
  // uansett. Meldingen peker pa de to utveiene ansatte faktisk har.
  if (products > 0) {
    throw new AppError(
      `Kategorien har ${products} ${products === 1 ? "produkt" : "produkter"}. ` +
        "Flytt dem til en annen kategori, eller skjul kategorien i stedet for a slette den.",
      409,
      "CATEGORY_NOT_EMPTY",
    );
  }

  return prisma.category.delete({ where: { id: categoryId } });
}

/** Neste ledige plass bakerst i kategorien. */
async function nextProductSortOrder(categoryId: string): Promise<number> {
  const last = await prisma.product.findFirst({
    where: { categoryId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  return last ? last.sortOrder + 1 : 0;
}

export async function createProduct(clubId: string, input: z.infer<typeof productInputSchema>) {
  const category = await prisma.category.findFirst({ where: { id: input.categoryId, clubId } });
  if (!category) throw new NotFoundError("Fant ikke kategorien.");

  return prisma.product.create({
    data: {
      clubId,
      categoryId: input.categoryId,
      name: input.name,
      description: input.description ?? null,
      price: kroner(input.priceKroner),
      imageUrl: input.imageUrl ?? null,
      allergens: input.allergens,
      preparationMinutes: input.preparationMinutes,
      isAvailable: input.isAvailable,
      requiresAgeVerification: input.requiresAgeVerification,
      sortOrder: input.sortOrder ?? (await nextProductSortOrder(input.categoryId)),
    },
  });
}

export async function updateProduct(
  clubId: string,
  productId: string,
  input: z.infer<typeof productPatchSchema>,
) {
  const product = await prisma.product.findFirst({ where: { id: productId, clubId } });
  if (!product) throw new NotFoundError("Fant ikke produktet.");

  if (input.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, clubId } });
    if (!category) throw new NotFoundError("Fant ikke kategorien.");
  }

  return prisma.product.update({
    where: { id: productId },
    data: {
      categoryId: input.categoryId,
      name: input.name,
      description: input.description,
      price: input.priceKroner === undefined ? undefined : kroner(input.priceKroner),
      imageUrl: input.imageUrl,
      allergens: input.allergens,
      preparationMinutes: input.preparationMinutes,
      isAvailable: input.isAvailable,
      requiresAgeVerification: input.requiresAgeVerification,
      sortOrder: input.sortOrder,
    },
  });
}

export async function deleteProduct(clubId: string, productId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId, clubId } });
  if (!product) throw new NotFoundError("Fant ikke produktet.");

  const usedInOrders = await prisma.orderItem.count({ where: { productId } });

  // Produkter som finnes i tidligere bestillinger skjules i stedet for a slettes,
  // slik at historikken bevares.
  if (usedInOrders > 0) {
    return prisma.product.update({
      where: { id: productId },
      data: { isAvailable: false },
    });
  }

  return prisma.product.delete({ where: { id: productId } });
}

export async function setProductAvailability(
  clubId: string,
  productId: string,
  isAvailable: boolean,
) {
  const product = await prisma.product.findFirst({ where: { id: productId, clubId } });
  if (!product) throw new NotFoundError("Fant ikke produktet.");

  return prisma.product.update({ where: { id: productId }, data: { isAvailable } });
}

/** Pauseknappene i kapasitetsstyringen, jf. paragraf 11. */
export async function pauseOrdering(
  clubId: string,
  scope: "ALL" | "COURSE_DELIVERY",
  message?: string,
) {
  return prisma.club.update({
    where: { id: clubId },
    data: {
      isOrderingEnabled: scope === "ALL" ? false : undefined,
      isCourseDeliveryPaused: true,
      pauseMessage: message ?? null,
    },
  });
}

export async function resumeOrdering(clubId: string) {
  return prisma.club.update({
    where: { id: clubId },
    data: { isOrderingEnabled: true, isCourseDeliveryPaused: false, pauseMessage: null },
  });
}

export async function updateClubSettings(
  clubId: string,
  input: { defaultPrepMinutes?: number; deliveryFeeKroner?: number; minimumOrderKroner?: number },
) {
  return prisma.club.update({
    where: { id: clubId },
    data: {
      defaultPrepMinutes: input.defaultPrepMinutes,
      deliveryFee: input.deliveryFeeKroner === undefined ? undefined : kroner(input.deliveryFeeKroner),
      minimumOrderAmount:
        input.minimumOrderKroner === undefined ? undefined : kroner(input.minimumOrderKroner),
    },
  });
}

export async function setHoleDelivery(clubId: string, holeNumber: number, enabled: boolean) {
  const hole = await prisma.hole.findUnique({
    where: { clubId_holeNumber: { clubId, holeNumber } },
  });
  if (!hole) throw new NotFoundError("Fant ikke hullet.");

  return prisma.hole.update({ where: { id: hole.id }, data: { isDeliveryEnabled: enabled } });
}

export async function listDrivers(clubId: string) {
  return prisma.user.findMany({
    where: { clubId, isActive: true, role: { in: ["DELIVERY", "MANAGER", "ADMIN"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });
}

/** Filtypene bota product-images godtar, jf. scripts/setup-storage.ts. */
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function uploadProductImage(clubId: string, file: File) {
  const { getSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const supabase = getSupabaseAdminClient();

  // Filendelsen utledes av innholdstypen, ikke av filnavnet kunden sendte, slik
  // at navnet ikke kan pavirke stien i bota.
  const extension = IMAGE_EXTENSIONS[file.type];
  if (!extension) {
    throw new AppError("Bildet ma vaere JPG, PNG, WEBP eller AVIF.", 400, "INVALID_FILE");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new AppError("Bildet kan maks vaere 5 MB.", 400, "FILE_TOO_LARGE");
  }

  const path = `${clubId}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from("product-images")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    throw new AppError(`Opplasting feilet: ${error.message}`, 502, "UPLOAD_FAILED");
  }

  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
}
