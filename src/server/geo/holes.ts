import { prisma } from "@/lib/db";

export type NearestFeature = "TEE" | "FAIRWAY" | "GREEN";

export type HoleSuggestion = {
  holeId: string;
  holeNumber: number;
  holeName: string | null;
  isInside: boolean;
  confidence: number;
  distanceMeters: number;
  centerlineMeters: number | null;
  teeMeters: number | null;
  greenMeters: number | null;
  nearestFeature: NearestFeature | null;
};

type SuggestHolesRow = {
  hole_id: string;
  hole_number: number;
  hole_name: string | null;
  is_inside: boolean;
  confidence: number;
  distance_meters: number | null;
  centerline_meters: number | null;
  tee_meters: number | null;
  green_meters: number | null;
  nearest_feature: NearestFeature | null;
};

/**
 * Kaller PostGIS-funksjonen suggest_holes og returnerer de tre mest
 * sannsynlige hullene, jf. paragraf 6.2. Kunden ma alltid bekrefte forslaget.
 */
export async function suggestHoles(
  clubId: string,
  latitude: number,
  longitude: number,
  accuracyMeters: number,
): Promise<HoleSuggestion[]> {
  const rows = await prisma.$queryRaw<SuggestHolesRow[]>`
    SELECT *
      FROM suggest_holes(${clubId}::uuid, ${latitude}::double precision, ${longitude}::double precision, ${accuracyMeters}::double precision)
  `;

  return rows.map((row) => ({
    holeId: row.hole_id,
    holeNumber: row.hole_number,
    holeName: row.hole_name,
    isInside: row.is_inside,
    confidence: Number(row.confidence),
    distanceMeters: Number(row.distance_meters ?? 0),
    centerlineMeters: row.centerline_meters === null ? null : Number(row.centerline_meters),
    teeMeters: row.tee_meters === null ? null : Number(row.tee_meters),
    greenMeters: row.green_meters === null ? null : Number(row.green_meters),
    nearestFeature: row.nearest_feature,
  }));
}

export type PointWithCoordinates = {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
};

/** Leser koordinatene til leveringspunktene, som Prisma ikke kan hente selv. */
export async function getDeliveryPointCoordinates(clubId: string): Promise<PointWithCoordinates[]> {
  const rows = await prisma.$queryRaw<
    { id: string; name: string; latitude: number | null; longitude: number | null }[]
  >`
    SELECT "id",
           "name",
           ST_Y("location"::geometry) AS latitude,
           ST_X("location"::geometry) AS longitude
      FROM "delivery_points"
     WHERE "club_id" = ${clubId}::uuid
       AND "is_active" = true
  `;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
  }));
}

/** Tee-koordinater per hull, brukt av kartet i ansattpanelet. */
export async function getHoleTeeCoordinates(clubId: string) {
  const rows = await prisma.$queryRaw<
    { hole_number: number; latitude: number | null; longitude: number | null }[]
  >`
    SELECT "hole_number",
           ST_Y("tee_location"::geometry) AS latitude,
           ST_X("tee_location"::geometry) AS longitude
      FROM "holes"
     WHERE "club_id" = ${clubId}::uuid
     ORDER BY "hole_number"
  `;

  return rows.map((row) => ({
    holeNumber: row.hole_number,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
  }));
}
