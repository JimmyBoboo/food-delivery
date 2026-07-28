/**
 * Kjorer gjennom hovedscenariene mot en app som allerede kjorer.
 *
 *   1. npm run dev
 *   2. npm run scenarios
 *
 * Scriptet logger inn som en ekte ansatt gjennom Supabase Auth og kaller de
 * samme HTTP-endepunktene som ansattpanelet, slik at ogsa tilgangskontrollen
 * og lasingen blir testet.
 */

import { createHmac, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const { Pool } = pg;

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const CLUB_SLUG = "skjeberg-golfklubb";
const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET ?? "utviklingshemmelighet";
const STAFF_EMAIL = process.env.SCENARIO_STAFF_EMAIL ?? "kjokken@skjeberggk.no";
const STAFF_PASSWORD = process.env.SEED_STAFF_PASSWORD ?? "Golf2026!";

/** Samme grense som @supabase/ssr bruker nar den deler opp sesjonscookien. */
const COOKIE_CHUNK_SIZE = 3180;

let passed = 0;
let failed = 0;
let staffCookie = "";

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`  OK    ${label}`);
  } else {
    failed += 1;
    console.log(`  FEIL  ${label}${detail ? ` – ${detail}` : ""}`);
  }
}

async function api<T>(
  path: string,
  init: RequestInit & { asStaff?: boolean } = {},
): Promise<{ status: number; body: T }> {
  const { asStaff, ...rest } = init;

  const response = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(asStaff ? { cookie: staffCookie } : {}),
      ...(rest.headers ?? {}),
    },
  });

  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : {}) as T };
}

/**
 * Logger inn og bygger den samme cookien som @supabase/ssr skriver i
 * nettleseren, slik at admin-endepunktene ser en innlogget bruker.
 */
async function signInAsStaff() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("Mangler NEXT_PUBLIC_SUPABASE_URL eller NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: STAFF_EMAIL,
    password: STAFF_PASSWORD,
  });

  if (error || !data.session) {
    throw new Error(
      `Kunne ikke logge inn som ${STAFF_EMAIL}: ${error?.message ?? "ingen sesjon"}. Kjor npm run db:seed forst.`,
    );
  }

  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const name = `sb-${projectRef}-auth-token`;
  const value = `base64-${Buffer.from(JSON.stringify(data.session)).toString("base64")}`;

  if (value.length <= COOKIE_CHUNK_SIZE) {
    staffCookie = `${name}=${encodeURIComponent(value)}`;
    return;
  }

  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += COOKIE_CHUNK_SIZE) {
    chunks.push(value.slice(index, index + COOKIE_CHUNK_SIZE));
  }

  staffCookie = chunks
    .map((chunk, index) => `${name}.${index}=${encodeURIComponent(chunk)}`)
    .join("; ");
}

type MenuResponse = {
  club: { id: string };
  categories: { products: { id: string; options: unknown[] }[] }[];
};

async function loadSimpleProduct() {
  const { body } = await api<MenuResponse>(`/api/clubs/${CLUB_SLUG}/menu`);
  const product = body.categories
    .flatMap((category) => category.products)
    .find((candidate) => candidate.options.length === 0);

  if (!product) throw new Error("Fant ingen produkt uten tilvalg. Kjor npm run db:seed.");
  return product;
}

async function placeOrder(overrides: Record<string, unknown> = {}) {
  const product = await loadSimpleProduct();

  const { status, body } = await api<{ publicToken: string }>("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      clubSlug: CLUB_SLUG,
      items: [{ productId: product.id, quantity: 2, optionValueIds: [] }],
      customerName: "Jimmy Testesen",
      customerPhone: "+47 900 00 000",
      selectedHoleNumber: 7,
      selectedHolePosition: "FAIRWAY",
      deliveryTargetType: "NEXT_TEE",
      deliveryPointId: null,
      idempotencyKey: randomUUID(),
      ...overrides,
    }),
  });

  if (status !== 200) throw new Error(`Kunne ikke opprette bestilling: ${JSON.stringify(body)}`);
  return body.publicToken;
}

async function authorizePayment(publicToken: string) {
  const session = await api<{ redirectUrl: string }>(
    `/api/orders/${publicToken}/payment-session`,
    { method: "POST" },
  );

  const reference = new URL(session.body.redirectUrl).pathname.split("/").pop()!;

  await api(`/api/payments/mock/${reference}`, {
    method: "POST",
    body: JSON.stringify({ action: "authorize" }),
  });

  return reference;
}

async function orderStatus(publicToken: string): Promise<string> {
  const { body } = await api<{ status: string }>(`/api/orders/${publicToken}`);
  return body.status;
}

async function findOrderId(pool: pg.Pool, publicToken: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM orders WHERE public_token = $1`,
    [publicToken],
  );
  return result.rows[0].id;
}

async function readOrder(pool: pg.Pool, publicToken: string) {
  const result = await pool.query(
    `SELECT status, payment_status, decline_reason, estimated_delivery_at
       FROM orders WHERE public_token = $1`,
    [publicToken],
  );

  return {
    status: result.rows[0].status as string,
    paymentStatus: result.rows[0].payment_status as string,
    declineReason: result.rows[0].decline_reason as string | null,
    estimatedDeliveryAt: result.rows[0].estimated_delivery_at as Date | null,
  };
}

async function sendWebhook(eventId: string, reference: string) {
  const body = JSON.stringify({
    id: eventId,
    provider: "mock",
    type: "payment.authorized",
    reference,
  });

  const response = await fetch(`${BASE_URL}/api/webhooks/payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-payment-signature": createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex"),
    },
    body,
  });

  return { status: response.status, body: (await response.json()) as { duplicate?: boolean } };
}

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Mangler DIRECT_URL i .env.local.");

  const pool = new Pool({ connectionString });

  console.log(`\nKjorer scenarier mot ${BASE_URL}\n`);
  await signInAsStaff();

  const whoami = await api<{ orders: unknown[] }>("/api/admin/orders", { asStaff: true });
  check("Ansatt er innlogget mot admin-API-et", whoami.status === 200, `status ${whoami.status}`);

  if (whoami.status !== 200) {
    console.log("\nAvbryter: innloggingen fungerte ikke, resten av scenariene krever den.\n");
    await pool.end();
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  console.log("\n1. Bestilling uten GPS");
  const plain = await placeOrder();
  check("Bestillingen ble opprettet", (await orderStatus(plain)) === "DRAFT");
  await authorizePayment(plain);
  check(
    "Reservert betaling sender bestillingen til restauranten",
    (await orderStatus(plain)) === "PENDING_RESTAURANT",
  );

  // -------------------------------------------------------------------------
  console.log("\n2. Hullforslag fra GPS");
  const suggestion = await api<{ suggestions: { holeNumber: number; confidence: number }[] }>(
    "/api/location/suggest-hole",
    {
      method: "POST",
      body: JSON.stringify({
        clubSlug: CLUB_SLUG,
        latitude: 59.1832,
        longitude: 11.2033,
        accuracyMeters: 12,
      }),
    },
  );
  check(
    "PostGIS returnerer inntil tre forslag",
    suggestion.body.suggestions?.length > 0 && suggestion.body.suggestions.length <= 3,
    JSON.stringify(suggestion.body),
  );

  // -------------------------------------------------------------------------
  console.log("\n3. Godkjenning trekker betalingen");
  const acceptId = await findOrderId(pool, plain);
  const acceptResponse = await api(`/api/admin/orders/${acceptId}/accept`, {
    method: "POST",
    asStaff: true,
    body: JSON.stringify({ etaMinutes: 20 }),
  });
  check("Endepunktet svarer 200", acceptResponse.status === 200, JSON.stringify(acceptResponse.body));

  const accepted = await readOrder(pool, plain);
  check("Bestillingen er godkjent", accepted.status === "ACCEPTED", accepted.status);
  check("Betalingen er trukket", accepted.paymentStatus === "CAPTURED", accepted.paymentStatus);
  check("Forventet leveringstid er satt", accepted.estimatedDeliveryAt !== null);

  // -------------------------------------------------------------------------
  console.log("\n4. Avslag opphever reservasjonen");
  const declineToken = await placeOrder();
  await authorizePayment(declineToken);
  const declineId = await findOrderId(pool, declineToken);

  await api(`/api/admin/orders/${declineId}/decline`, {
    method: "POST",
    asStaff: true,
    body: JSON.stringify({ reason: "Varen er utsolgt." }),
  });

  const declined = await readOrder(pool, declineToken);
  check("Bestillingen er avslatt", declined.status === "DECLINED", declined.status);
  check("Reservasjonen er opphevet", declined.paymentStatus === "CANCELLED", declined.paymentStatus);
  check("Kunden ser arsaken", declined.declineReason === "Varen er utsolgt.");

  // -------------------------------------------------------------------------
  console.log("\n5. To ansatte godkjenner samme bestilling samtidig");
  const raceToken = await placeOrder();
  await authorizePayment(raceToken);
  const raceId = await findOrderId(pool, raceToken);

  const [first, second] = await Promise.all([
    api(`/api/admin/orders/${raceId}/accept`, {
      method: "POST",
      asStaff: true,
      body: JSON.stringify({ etaMinutes: 15 }),
    }),
    api(`/api/admin/orders/${raceId}/accept`, {
      method: "POST",
      asStaff: true,
      body: JSON.stringify({ etaMinutes: 15 }),
    }),
  ]);

  const successCount = [first, second].filter((result) => result.status === 200).length;
  check(
    "Bare en av dem lykkes",
    successCount === 1,
    `statuser ${first.status} og ${second.status}`,
  );
  check(
    "Den andre far en tydelig melding",
    [first, second].some((result) => result.status === 409),
  );

  // -------------------------------------------------------------------------
  console.log("\n6. Webhook mottatt to ganger");
  const duplicateToken = await placeOrder();
  const reference = await authorizePayment(duplicateToken);
  const eventId = randomUUID();
  const firstHook = await sendWebhook(eventId, reference);
  const secondHook = await sendWebhook(eventId, reference);
  check("Forste webhook behandles", firstHook.status === 200 && !firstHook.body.duplicate);
  check("Andre webhook ignoreres", secondHook.status === 200 && secondHook.body.duplicate === true);

  // -------------------------------------------------------------------------
  console.log("\n7. Kunden avbryter for godkjenning");
  const cancelToken = await placeOrder();
  await authorizePayment(cancelToken);
  const cancelled = await api<{ status: string }>(`/api/orders/${cancelToken}/cancel`, {
    method: "POST",
  });
  check("Bestillingen er kansellert", cancelled.body.status === "CANCELLED");

  // -------------------------------------------------------------------------
  console.log("\n8. Utsolgt vare kan ikke bestilles");
  const product = await loadSimpleProduct();
  await pool.query(`UPDATE products SET is_available = false WHERE id = $1`, [product.id]);

  const soldOut = await api<{ error?: { code: string } }>("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      clubSlug: CLUB_SLUG,
      items: [{ productId: product.id, quantity: 1, optionValueIds: [] }],
      customerName: "Jimmy Testesen",
      customerPhone: "+47 900 00 000",
      selectedHoleNumber: 3,
      deliveryTargetType: "NEXT_TEE",
      idempotencyKey: randomUUID(),
    }),
  });

  check(
    "Bestillingen avvises",
    soldOut.status === 409 && soldOut.body.error?.code === "PRODUCT_UNAVAILABLE",
    JSON.stringify(soldOut.body),
  );

  await pool.query(`UPDATE products SET is_available = true WHERE id = $1`, [product.id]);

  // -------------------------------------------------------------------------
  console.log("\n9. Dobbeltklikk oppretter bare en bestilling");
  const sharedKey = randomUUID();
  const tokenA = await placeOrder({ idempotencyKey: sharedKey });
  const tokenB = await placeOrder({ idempotencyKey: sharedKey });
  check("Samme bestilling returneres", tokenA === tokenB);

  // -------------------------------------------------------------------------
  console.log("\n10. Uinnlogget slipper ikke inn i ansattpanelet");
  const unauthorized = await api(`/api/admin/orders`);
  check("Admin-API-et krever innlogging", unauthorized.status === 401, `status ${unauthorized.status}`);

  await pool.end();

  console.log(`\n${passed} kontroller ok, ${failed} feilet.\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
