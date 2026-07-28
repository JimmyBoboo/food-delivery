/**
 * Seed for pilotklubben.
 *
 * Scriptet skriver rett SQL i stedet for a bruke Prisma Client, fordi
 * geometrikolonnene er PostGIS-typer som Prisma ikke kan skrive til.
 *
 * Kjor med:  npm run db:seed
 */

import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const { Pool } = pg;

const CLUB_SLUG = "skjeberg-golfklubb";
const CLUB_NAME = "Skjeberg Golfklubb";

// Utgangspunkt for den syntetiske banen. Byttes ut med klubbens faktiske
// polygoner nar banen tegnes inn i administrasjonsgrensesnittet.
const BASE_LAT = 59.181;
const BASE_LNG = 11.201;

const HOLE_LENGTH_METERS = 250;
const HOLE_WIDTH_METERS = 70;
const COLUMN_SPACING_METERS = 260;
const ROW_SPACING_METERS = 330;

function metersToLat(meters: number): number {
  return meters / 111_320;
}

function metersToLng(meters: number, atLatitude: number): number {
  return meters / (111_320 * Math.cos((atLatitude * Math.PI) / 180));
}

type HoleGeometry = {
  holeNumber: number;
  name: string;
  par: number;
  tee: [number, number];
  green: [number, number];
  polygon: [number, number][];
};

const HOLE_NAMES = [
  "Startskuddet", "Bekkedalen", "Furukollen", "Lange Lars", "Sandtaket",
  "Utsikten", "Damen", "Skogsholet", "Halvveis", "Bakketoppen",
  "Smalgangen", "Steinrosa", "Vindsvingen", "Eikelunden", "Doglegget",
  "Myra", "Nesten hjemme", "Klubbhuset",
];

/** Bygger et korridor-polygon rundt linjen fra tee til green. */
function buildHoles(): HoleGeometry[] {
  return Array.from({ length: 18 }, (_, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);

    const teeLat = BASE_LAT + metersToLat(row * ROW_SPACING_METERS);
    const teeLng = BASE_LNG + metersToLng(column * COLUMN_SPACING_METERS, BASE_LAT);

    const greenLat = teeLat + metersToLat(HOLE_LENGTH_METERS);
    const greenLng = teeLng;

    const halfWidthLng = metersToLng(HOLE_WIDTH_METERS / 2, teeLat);
    const overhangLat = metersToLat(20);

    const polygon: [number, number][] = [
      [teeLng - halfWidthLng, teeLat - overhangLat],
      [teeLng + halfWidthLng, teeLat - overhangLat],
      [greenLng + halfWidthLng, greenLat + overhangLat],
      [greenLng - halfWidthLng, greenLat + overhangLat],
      [teeLng - halfWidthLng, teeLat - overhangLat],
    ];

    return {
      holeNumber: index + 1,
      name: HOLE_NAMES[index],
      par: [3, 4, 5][index % 3],
      tee: [teeLng, teeLat],
      green: [greenLng, greenLat],
      polygon,
    };
  });
}

function pointWkt([lng, lat]: [number, number]): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

function lineWkt(from: [number, number], to: [number, number]): string {
  return `SRID=4326;LINESTRING(${from[0]} ${from[1]}, ${to[0]} ${to[1]})`;
}

function polygonWkt(points: [number, number][]): string {
  return `SRID=4326;POLYGON((${points.map(([lng, lat]) => `${lng} ${lat}`).join(", ")}))`;
}

type ProductSeed = {
  name: string;
  description: string;
  priceKroner: number;
  prepMinutes: number;
  allergens: string[];
  requiresAge?: boolean;
  options?: {
    name: string;
    required: boolean;
    minimum: number;
    maximum: number;
    values: { name: string; extraKroner: number }[];
  }[];
};

const MENU: { category: string; description: string; products: ProductSeed[] }[] = [
  {
    category: "Dagens tilbud",
    description: "Godt og raskt, klart pa noen minutter.",
    products: [
      {
        name: "Dagens baguett og kaffe",
        description: "Baguett etter dagens utvalg med en kopp kaffe.",
        priceKroner: 149,
        prepMinutes: 6,
        allergens: ["gluten", "melk"],
      },
    ],
  },
  {
    category: "Burger og varmmat",
    description: "Tilberedes pa bestilling.",
    products: [
      {
        name: "Klubbhusburger",
        description: "180 g norsk storfe, salat, tomat, sylta lok og husets dressing.",
        priceKroner: 219,
        prepMinutes: 18,
        allergens: ["gluten", "melk", "egg", "sennep"],
        options: [
          {
            name: "Pommes frites",
            required: true,
            minimum: 1,
            maximum: 1,
            values: [
              { name: "Med pommes frites", extraKroner: 39 },
              { name: "Uten pommes frites", extraKroner: 0 },
            ],
          },
          {
            name: "Tilpasninger",
            required: false,
            minimum: 0,
            maximum: 3,
            values: [
              { name: "Ekstra ost", extraKroner: 20 },
              { name: "Uten lok", extraKroner: 0 },
              { name: "Glutenfritt brod", extraKroner: 15 },
            ],
          },
        ],
      },
      {
        name: "Kyllingwrap",
        description: "Grillet kylling, sprod salat og hvitloksdressing.",
        priceKroner: 169,
        prepMinutes: 12,
        allergens: ["gluten", "melk"],
      },
    ],
  },
  {
    category: "Polser",
    description: "Klassikeren pa banen.",
    products: [
      {
        name: "Grillpolse i lompe",
        description: "Norsk grillpolse med lompe og tilbehor.",
        priceKroner: 69,
        prepMinutes: 5,
        allergens: ["gluten", "sennep"],
        options: [
          {
            name: "Tilbehor",
            required: false,
            minimum: 0,
            maximum: 4,
            values: [
              { name: "Sennep", extraKroner: 0 },
              { name: "Ketchup", extraKroner: 0 },
              { name: "Sprod lok", extraKroner: 0 },
              { name: "Agurksalat", extraKroner: 0 },
            ],
          },
        ],
      },
      {
        name: "Polse med brus",
        description: "Grillpolse og en liten brus.",
        priceKroner: 99,
        prepMinutes: 5,
        allergens: ["gluten"],
        options: [
          {
            name: "Valg av brus",
            required: true,
            minimum: 1,
            maximum: 1,
            values: [
              { name: "Cola", extraKroner: 0 },
              { name: "Cola Zero", extraKroner: 0 },
              { name: "Solo", extraKroner: 0 },
              { name: "Farris", extraKroner: 0 },
            ],
          },
        ],
      },
    ],
  },
  {
    category: "Baguetter og panini",
    description: "Ferske og enkle a spise pa farten.",
    products: [
      {
        name: "Panini med skinke og ost",
        description: "Varmpresset panini.",
        priceKroner: 129,
        prepMinutes: 8,
        allergens: ["gluten", "melk"],
        options: [
          {
            name: "Brodvalg",
            required: false,
            minimum: 0,
            maximum: 1,
            values: [{ name: "Glutenfritt alternativ", extraKroner: 15 }],
          },
        ],
      },
      {
        name: "Baguett med reker",
        description: "Rekesalat, sitron og salat.",
        priceKroner: 149,
        prepMinutes: 6,
        allergens: ["gluten", "skalldyr", "egg"],
      },
    ],
  },
  {
    category: "Kaffe",
    description: "Fra kaffebaren i klubbhuset.",
    products: [
      {
        name: "Filterkaffe",
        description: "Stor kopp.",
        priceKroner: 39,
        prepMinutes: 2,
        allergens: [],
      },
      {
        name: "Cappuccino",
        description: "Espresso med skummet melk.",
        priceKroner: 55,
        prepMinutes: 4,
        allergens: ["melk"],
        options: [
          {
            name: "Melk",
            required: false,
            minimum: 0,
            maximum: 1,
            values: [
              { name: "Havremelk", extraKroner: 8 },
              { name: "Laktosefri melk", extraKroner: 8 },
            ],
          },
        ],
      },
    ],
  },
  {
    category: "Drikke",
    description: "Kaldt og forfriskende.",
    products: [
      {
        name: "Flaskevann",
        description: "0,5 liter.",
        priceKroner: 35,
        prepMinutes: 1,
        allergens: [],
      },
      {
        name: "Cola Zero",
        description: "0,5 liter.",
        priceKroner: 45,
        prepMinutes: 1,
        allergens: [],
      },
      {
        name: "Alkoholfri pils",
        description: "0,33 liter.",
        priceKroner: 69,
        prepMinutes: 1,
        allergens: ["gluten"],
      },
      {
        name: "Pils 0,4",
        description: "Serveres kun der klubben har bevilling. Legitimasjon ved levering.",
        priceKroner: 99,
        prepMinutes: 2,
        allergens: ["gluten"],
        requiresAge: true,
      },
    ],
  },
  {
    category: "Snacks",
    description: "Noe a tygge pa mellom slagene.",
    products: [
      {
        name: "Potetgull",
        description: "Liten pose.",
        priceKroner: 35,
        prepMinutes: 1,
        allergens: [],
      },
      {
        name: "Sjokolade",
        description: "Utvalget varierer.",
        priceKroner: 30,
        prepMinutes: 1,
        allergens: ["melk", "soya"],
      },
      {
        name: "Energibar",
        description: "Nott- og daddelbar.",
        priceKroner: 45,
        prepMinutes: 1,
        allergens: ["notter"],
      },
    ],
  },
  {
    category: "Is",
    description: "Perfekt pa varme dager.",
    products: [
      {
        name: "Batis",
        description: "Klassisk krone-is.",
        priceKroner: 45,
        prepMinutes: 1,
        allergens: ["melk"],
      },
      {
        name: "Softis i kjeks",
        description: "Lages i kiosken.",
        priceKroner: 55,
        prepMinutes: 3,
        allergens: ["melk", "gluten"],
      },
    ],
  },
];

const STAFF = [
  { email: "admin@skjeberggk.no", name: "Kari Administrator", role: "ADMIN" },
  { email: "kjokken@skjeberggk.no", name: "Ola Kjokken", role: "KITCHEN" },
  { email: "levering@skjeberggk.no", name: "Nils Levering", role: "DELIVERY" },
];

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "Mangler DIRECT_URL. Kopier .env.local.example til .env.local og fyll inn verdiene fra Supabase.",
    );
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Sletter tidligere seed-data. Bestillinger og hendelser folger med gjennom
    // fremmednoklene, sa scriptet kan kjores flere ganger.
    await client.query(`DELETE FROM clubs WHERE slug = $1`, [CLUB_SLUG]);

    const clubResult = await client.query<{ id: string }>(
      `INSERT INTO clubs (id, name, slug, address, timezone, currency, is_ordering_enabled,
                          is_course_delivery_paused, default_prep_minutes, delivery_fee,
                          free_delivery_threshold, minimum_order_amount, phone, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Europe/Oslo', 'NOK', true,
               false, 20, 4900, 40000, 7500, '+47 69 00 00 00', now(), now())
       RETURNING id`,
      [CLUB_NAME, CLUB_SLUG, "Golfveien 1, 1747 Skjeberg"],
    );

    const clubId = clubResult.rows[0].id;

    // --- Hull -------------------------------------------------------------
    const holes = buildHoles();
    const holeIdByNumber = new Map<number, string>();

    for (const hole of holes) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO holes (id, club_id, hole_number, name, par, is_delivery_enabled, play_minutes,
                            area_geometry, centerline_geometry, tee_location, green_location)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, true, 15,
                 ST_GeomFromEWKT($5), ST_GeomFromEWKT($6), ST_GeomFromEWKT($7), ST_GeomFromEWKT($8))
         RETURNING id`,
        [
          clubId,
          hole.holeNumber,
          hole.name,
          hole.par,
          polygonWkt(hole.polygon),
          lineWkt(hole.tee, hole.green),
          pointWkt(hole.tee),
          pointWkt(hole.green),
        ],
      );

      holeIdByNumber.set(hole.holeNumber, result.rows[0].id);
    }

    // --- Leveringspunkter --------------------------------------------------
    const teePoints = [1, 4, 7, 10, 13, 16];

    for (const [index, holeNumber] of teePoints.entries()) {
      const hole = holes[holeNumber - 1];
      await client.query(
        `INSERT INTO delivery_points (id, club_id, hole_id, name, instructions, is_active, is_pickup, sort_order, location)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, true, false, $5, ST_GeomFromEWKT($6))`,
        [
          clubId,
          holeIdByNumber.get(holeNumber),
          `Hull ${holeNumber} – utslagssted`,
          "Vi moter deg ved benken pa utslagsstedet.",
          index,
          pointWkt(hole.tee),
        ],
      );
    }

    await client.query(
      `INSERT INTO delivery_points (id, club_id, hole_id, name, instructions, is_active, is_pickup, sort_order, location)
       VALUES (gen_random_uuid(), $1, NULL, 'Klubbhuset – hovedinngang', 'Hentes i restauranten.', true, true, 90, ST_GeomFromEWKT($2)),
              (gen_random_uuid(), $1, $3, 'Halfway house ved hull 10', 'Hentes i kiosken.', true, true, 91, ST_GeomFromEWKT($4))`,
      [
        clubId,
        pointWkt([BASE_LNG, BASE_LAT - metersToLat(120)]),
        holeIdByNumber.get(10),
        pointWkt(holes[9].tee),
      ],
    );

    // --- Meny --------------------------------------------------------------
    for (const [categoryIndex, group] of MENU.entries()) {
      const categoryResult = await client.query<{ id: string }>(
        `INSERT INTO categories (id, club_id, name, description, sort_order, is_active)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, true)
         RETURNING id`,
        [clubId, group.category, group.description, categoryIndex],
      );

      const categoryId = categoryResult.rows[0].id;

      for (const [productIndex, product] of group.products.entries()) {
        const productResult = await client.query<{ id: string }>(
          `INSERT INTO products (id, club_id, category_id, name, description, price, image_url,
                                 allergens, preparation_minutes, is_available,
                                 requires_age_verification, sort_order, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NULL, $6, $7, true, $8, $9, now(), now())
           RETURNING id`,
          [
            clubId,
            categoryId,
            product.name,
            product.description,
            Math.round(product.priceKroner * 100),
            product.allergens,
            product.prepMinutes,
            product.requiresAge ?? false,
            productIndex,
          ],
        );

        const productId = productResult.rows[0].id;

        for (const [optionIndex, option] of (product.options ?? []).entries()) {
          const optionResult = await client.query<{ id: string }>(
            `INSERT INTO product_options (id, product_id, name, minimum_choices, maximum_choices, required, sort_order)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [productId, option.name, option.minimum, option.maximum, option.required, optionIndex],
          );

          for (const [valueIndex, value] of option.values.entries()) {
            await client.query(
              `INSERT INTO product_option_values (id, product_option_id, name, additional_price, is_available, sort_order)
               VALUES (gen_random_uuid(), $1, $2, $3, true, $4)`,
              [optionResult.rows[0].id, value.name, Math.round(value.extraKroner * 100), valueIndex],
            );
          }
        }
      }
    }

    // --- Apningstider ------------------------------------------------------
    for (let day = 0; day < 7; day += 1) {
      await client.query(
        `INSERT INTO opening_hours (id, club_id, day_of_week, ordering_opens_at, ordering_closes_at,
                                    delivery_opens_at, delivery_closes_at)
         VALUES (gen_random_uuid(), $1, $2, '08:00', '20:00', '09:00', '19:00')`,
        [clubId, day],
      );
    }

    await client.query("COMMIT");
    console.log(`Opprettet ${CLUB_NAME} med 18 hull, ${MENU.length} kategorier og leveringspunkter.`);

    await seedStaff(client, clubId);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Oppretter ansatte i Supabase Auth og kobler dem til users-tabellen.
 * Hoppes over hvis service role-nokkelen ikke er satt.
 */
async function seedStaff(client: pg.PoolClient, clubId: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const password = process.env.SEED_STAFF_PASSWORD ?? "Golf2026!";

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn(
      "Hopper over ansattbrukere: NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY mangler.",
    );
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const person of STAFF) {
    let userId: string | undefined;

    const created = await supabase.auth.admin.createUser({
      email: person.email,
      password,
      email_confirm: true,
      user_metadata: { name: person.name },
    });

    if (created.data.user) {
      userId = created.data.user.id;
    } else {
      // Brukeren finnes fra en tidligere kjoring. Finn den og sett nytt passord.
      const existing = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const match = existing.data.users.find((user) => user.email === person.email);

      if (!match) {
        console.warn(`Kunne ikke opprette ${person.email}: ${created.error?.message}`);
        continue;
      }

      userId = match.id;
      await supabase.auth.admin.updateUserById(userId, { password });
    }

    await client.query(
      `INSERT INTO users (id, club_id, email, name, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, now(), now())
       ON CONFLICT (id) DO UPDATE
         SET club_id = EXCLUDED.club_id,
             name = EXCLUDED.name,
             role = EXCLUDED.role,
             is_active = true,
             updated_at = now()`,
      [userId, clubId, person.email, person.name, person.role],
    );

    console.log(`Ansatt klar: ${person.email} (${person.role})`);
  }

  console.log(`\nLogg inn i ansattpanelet med passordet: ${password}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
