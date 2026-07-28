-- Geografiske indekser, hullforslag-algoritmen (paragraf 6.2), ordrenummer og RLS.

-- ---------------------------------------------------------------------------
-- Romlige indekser
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS holes_area_geometry_idx ON "holes" USING GIST ("area_geometry");
CREATE INDEX IF NOT EXISTS holes_centerline_geometry_idx ON "holes" USING GIST ("centerline_geometry");
CREATE INDEX IF NOT EXISTS holes_tee_location_idx ON "holes" USING GIST ("tee_location");
CREATE INDEX IF NOT EXISTS holes_green_location_idx ON "holes" USING GIST ("green_location");
CREATE INDEX IF NOT EXISTS delivery_points_location_idx ON "delivery_points" USING GIST ("location");

-- ---------------------------------------------------------------------------
-- Kobling mot Supabase Auth. Hoppes over hvis auth-skjemaet ikke finnes,
-- slik at migreringen ogsa kan kjores mot en vanlig PostgreSQL-instans.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_id_auth_fkey"
      FOREIGN KEY ("id") REFERENCES auth.users("id") ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN insufficient_privilege OR duplicate_object THEN
    RAISE NOTICE 'Hopper over fremmednokkel mot auth.users: %', SQLERRM;
END
$$;

-- ---------------------------------------------------------------------------
-- Lopende ordrenummer per klubb.
-- Radlasen pa klubben serialiserer samtidige bestillinger.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION next_order_number(p_club_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_next integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_club_id::text, 0));

  SELECT COALESCE(MAX("order_number"), 0) + 1
    INTO v_next
    FROM "orders"
   WHERE "club_id" = p_club_id;

  RETURN v_next;
END
$$;

-- ---------------------------------------------------------------------------
-- Hullforslag, jf. paragraf 6.2.
--
--  1. ST_Covers avgjor om posisjonen ligger inne i hullets polygon.
--  2. Avstand til senterlinjen skiller hull som overlapper.
--  3. Avstand til tee og green brukes som tilleggsinformasjon.
--  4. Rapportert GPS-noyaktighet trekkes fra for avstanden vektes.
--  5. De tre mest sannsynlige hullene returneres.
--
-- Konfidensen er ikke normalisert: et hull man star inne i havner mellom
-- 0.55 og 1.0, mens et hull man star utenfor aldri kan overstige 0.55.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION suggest_holes(
  p_club_id  uuid,
  p_lat      double precision,
  p_lng      double precision,
  p_accuracy double precision DEFAULT 0
)
RETURNS TABLE (
  hole_id           uuid,
  hole_number       integer,
  hole_name         text,
  is_inside         boolean,
  confidence        double precision,
  distance_meters   double precision,
  centerline_meters double precision,
  tee_meters        double precision,
  green_meters      double precision,
  nearest_feature   text
)
LANGUAGE sql
STABLE
AS $$
  WITH input AS (
    SELECT
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography AS pt,
      -- GPS-noyaktighet under 10 meter behandles som 10, og over 150 som 150,
      -- slik at en enkelt darlig maling ikke gjor alle hull like sannsynlige.
      LEAST(GREATEST(COALESCE(p_accuracy, 0), 10), 150) AS tolerance
  ),
  candidates AS (
    SELECT
      h."id",
      h."hole_number",
      h."name",
      COALESCE(ST_Covers(h."area_geometry"::geography, i.pt), false) AS is_inside,
      CASE WHEN h."area_geometry" IS NULL THEN NULL
           ELSE ST_Distance(h."area_geometry"::geography, i.pt) END AS area_m,
      CASE WHEN h."centerline_geometry" IS NULL THEN NULL
           ELSE ST_Distance(h."centerline_geometry"::geography, i.pt) END AS centerline_m,
      CASE WHEN h."tee_location" IS NULL THEN NULL
           ELSE ST_Distance(h."tee_location"::geography, i.pt) END AS tee_m,
      CASE WHEN h."green_location" IS NULL THEN NULL
           ELSE ST_Distance(h."green_location"::geography, i.pt) END AS green_m,
      i.tolerance
    FROM "holes" h
    CROSS JOIN input i
    WHERE h."club_id" = p_club_id
      AND (
        h."area_geometry" IS NOT NULL
        AND ST_DWithin(h."area_geometry"::geography, i.pt, 400 + i.tolerance)
        OR h."centerline_geometry" IS NOT NULL
        AND ST_DWithin(h."centerline_geometry"::geography, i.pt, 400 + i.tolerance)
      )
  ),
  scored AS (
    SELECT
      c.*,
      GREATEST(COALESCE(c.area_m, c.centerline_m, 9999) - c.tolerance, 0) AS effective_m,
      GREATEST(COALESCE(c.centerline_m, 9999) - c.tolerance, 0) AS effective_centerline_m
    FROM candidates c
  )
  SELECT
    s."id",
    s."hole_number",
    s."name",
    s.is_inside,
    ROUND((
      CASE
        WHEN s.is_inside THEN 0.55 + 0.45 * exp(-s.effective_centerline_m / 90.0)
        ELSE 0.55 * exp(-s.effective_m / 70.0) * exp(-s.effective_centerline_m / 200.0)
      END
    )::numeric, 2)::double precision AS confidence,
    ROUND(COALESCE(s.area_m, s.centerline_m)::numeric, 0)::double precision AS distance_meters,
    ROUND(s.centerline_m::numeric, 0)::double precision AS centerline_meters,
    ROUND(s.tee_m::numeric, 0)::double precision AS tee_meters,
    ROUND(s.green_m::numeric, 0)::double precision AS green_meters,
    CASE
      WHEN s.tee_m IS NULL OR s.green_m IS NULL THEN NULL
      WHEN s.tee_m <= s.green_m AND s.tee_m < 60 THEN 'TEE'
      WHEN s.green_m < s.tee_m AND s.green_m < 60 THEN 'GREEN'
      ELSE 'FAIRWAY'
    END AS nearest_feature
  FROM scored s
  ORDER BY s.is_inside DESC, s.effective_centerline_m ASC, s.effective_m ASC
  LIMIT 3;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security.
--
-- Ingen policies opprettes for anon eller authenticated, slik at den offentlige
-- API-nokkelen ikke kan lese eller skrive noe direkte. All datatilgang gar
-- gjennom service-laget pa serveren, som bruker service role-nokkelen og
-- dermed omgar RLS.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clubs', 'users', 'categories', 'products', 'product_options',
    'product_option_values', 'holes', 'delivery_points', 'orders',
    'order_items', 'order_item_options', 'order_location', 'order_events',
    'opening_hours', 'special_opening_hours', 'payment_webhook_events',
    'mock_payments'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;

-- Service-laget kaller suggest_holes gjennom Prisma med service role,
-- men funksjonen skal ikke vaere tilgjengelig for anonyme klienter.
REVOKE ALL ON FUNCTION suggest_holes(uuid, double precision, double precision, double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION next_order_number(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Realtime Authorization: ansatte kan bare lytte pa kanalene til sin egen klubb.
-- Kundens statuskanal er nokkelt med public_token og handteres som apen kanal
-- med kun ikke-sensitive felter.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'realtime' AND table_name = 'messages') THEN
    DROP POLICY IF EXISTS "staff_read_own_club_topics" ON realtime.messages;
    CREATE POLICY "staff_read_own_club_topics"
      ON realtime.messages
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
            FROM public.users u
           WHERE u."id" = (SELECT auth.uid())
             AND u."is_active"
             AND realtime.topic() IN (
               'club:' || u."club_id"::text || ':orders',
               'delivery:' || u."club_id"::text
             )
        )
      );
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Kunne ikke opprette policy pa realtime.messages: %', SQLERRM;
END
$$;
