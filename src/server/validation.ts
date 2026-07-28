import { z } from "zod";

import { DeliveryTargetType, HolePosition, OrderStatus } from "@/generated/prisma/enums";

export const coordinateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().min(0).max(100_000).default(0),
  recordedAt: z.coerce.date().optional(),
});

export const suggestHoleSchema = coordinateSchema.extend({
  clubSlug: z.string().min(1),
});

export const cartItemSchema = z.object({
  productId: z.uuid(),
  quantity: z.number().int().min(1).max(20),
  optionValueIds: z.array(z.uuid()).max(20).default([]),
  comment: z.string().max(280).optional(),
});

export const createOrderSchema = z.object({
  clubSlug: z.string().min(1),
  items: z.array(cartItemSchema).min(1).max(40),
  customerName: z.string().min(2).max(80),
  customerPhone: z
    .string()
    .min(8)
    .max(20)
    .regex(/^[+0-9 ]+$/, "Telefonnummeret kan bare inneholde tall, mellomrom og +"),
  customerEmail: z.email().max(120).optional().or(z.literal("")),
  selectedHoleNumber: z.number().int().min(1).max(36).nullable().default(null),
  selectedHolePosition: z.enum(HolePosition).nullable().default(null),
  suggestedHoleNumber: z.number().int().min(1).max(36).nullable().default(null),
  deliveryTargetType: z.enum(DeliveryTargetType),
  deliveryPointId: z.uuid().nullable().default(null),
  customerComment: z.string().max(500).optional(),
  location: coordinateSchema.nullable().default(null),
  /** Hindrer at gjentatte klikk oppretter to bestillinger. */
  idempotencyKey: z.string().min(8).max(100),
});

export const updateLocationSchema = coordinateSchema;

export const acceptOrderSchema = z.object({
  etaMinutes: z.number().int().min(1).max(180).optional(),
  etaAt: z.coerce.date().optional(),
});

export const DECLINE_REASONS = [
  "Varen er utsolgt.",
  "Restauranten har for stor pagang.",
  "Levering er ikke tilgjengelig na.",
  "Restauranten stenger snart.",
  "Kunden er utenfor leveringsomradet.",
  "Betalingen kunne ikke gjennomfores.",
] as const;

export const declineOrderSchema = z.object({
  reason: z.string().min(3).max(300),
});

export const updateStatusSchema = z.object({
  status: z.enum(OrderStatus),
});

export const updateEtaSchema = z.object({
  etaMinutes: z.number().int().min(1).max(180).optional(),
  etaAt: z.coerce.date().optional(),
});

export const assignDriverSchema = z.object({
  driverId: z.uuid().nullable(),
});

export const productInputSchema = z.object({
  categoryId: z.uuid(),
  name: z.string().min(2).max(120),
  description: z.string().max(400).optional(),
  /** Pris i kroner slik den skrives inn i skjemaet. */
  priceKroner: z.number().min(0).max(10_000),
  imageUrl: z.string().max(500).nullable().optional(),
  allergens: z.array(z.string().max(40)).max(20).default([]),
  preparationMinutes: z.number().int().min(0).max(180).default(10),
  isAvailable: z.boolean().default(true),
  requiresAgeVerification: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

export const productPatchSchema = productInputSchema.partial();

export const availabilitySchema = z.object({
  isAvailable: z.boolean(),
});

export const pauseOrderingSchema = z.object({
  /** ALL stanser alle bestillinger, COURSE_DELIVERY kun levering pa banen. */
  scope: z.enum(["ALL", "COURSE_DELIVERY"]),
  message: z.string().max(200).optional(),
});

export const clubSettingsSchema = z.object({
  defaultPrepMinutes: z.number().int().min(1).max(180).optional(),
  deliveryFeeKroner: z.number().min(0).max(1000).optional(),
  minimumOrderKroner: z.number().min(0).max(10_000).optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CartItemInput = z.infer<typeof cartItemSchema>;
