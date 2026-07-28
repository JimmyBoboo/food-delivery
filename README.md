# Bestillingsplattform for golfbane

MVP av plattformen der golfspillere bestiller mat og drikke fra klubbens restaurant mens de er ute
på banen, og der restauranten godkjenner, avslår og følger opp bestillingene i et eget
kontrollpanel.

Bygget på Next.js med Supabase som database (PostgreSQL med PostGIS), autentisering, sanntid og
fillagring.

## Kom i gang

### 1. Opprett et Supabase-prosjekt

Lag et prosjekt på [supabase.com](https://supabase.com). Du trenger fem verdier derfra.

```bash
cp .env.local.example .env.local
```

| Variabel | Hvor du finner den |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API → anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → service_role key |
| `DATABASE_URL` | Project Settings → Database → Transaction pooler (port 6543) |
| `DIRECT_URL` | Project Settings → Database → Session pooler (port 5432) |

Husk å bytte ut hele `[YOUR-PASSWORD]`, inkludert klammeparentesene, med databasepassordet.
Inneholder passordet tegn som `@ : / ? # [ ]`, må de prosentkodes — ellers klarer ikke driveren
å se hvor passordet slutter og verten begynner. `@` blir `%40`, `<` blir `%3C` og så videre.

Begge strengene må ende med `sslmode=require&uselibpqcompat=true`. Fra node-postgres 8.16 tolkes
`sslmode=require` alene som full sertifikatvalidering, og da avvises Supabase sitt selvsignerte
sertifikat med «self-signed certificate in certificate chain». `uselibpqcompat=true` gir tilbake
libpq-oppførselen: forbindelsen er fortsatt kryptert, men CA-kjeden valideres ikke.

Bruk **Session pooler** til `DIRECT_URL`, ikke «Direct connection». Verten
`db.<ref>.supabase.co` svarer bare på IPv6, som de fleste hjemmenett og CI-miljøer mangler.
`DATABASE_URL` må ha `?pgbouncer=true&connection_limit=1` på slutten. Service role-nøkkelen brukes
kun på serveren og må aldri eksponeres i frontend.

### 2. Sett opp databasen

```bash
npm install
npm run db:setup     # kjører migreringene og legger inn testdata
```

Migreringene oppretter PostGIS-utvidelsen, alle tabellene fra datamodellen, romlige indekser,
funksjonen `suggest_holes` og slår på row level security. Seed-scriptet oppretter Skjeberg
Golfklubb med 18 hull med ekte geometri, leveringspunkter, åtte menykategorier og tre ansatte.

### 3. Opprett lagringsbøtta for produktbilder

```bash
npm run storage:setup
```

Oppretter den offentlige bøtta `product-images` med 5 MB grense per fil. Scriptet kan kjøres
på nytt uten bivirkninger.

### 4. Start

```bash
npm run dev
```

| Side | Adresse |
| --- | --- |
| Kundens meny | http://localhost:3000/skjeberg-golfklubb |
| Ansattpanel | http://localhost:3000/admin/login |

Innlogging for ansatte, med passordet fra `SEED_STAFF_PASSWORD`:

- `admin@skjeberggk.no` (ADMIN)
- `kjokken@skjeberggk.no` (KITCHEN)
- `levering@skjeberggk.no` (DELIVERY)

## Slik henger det sammen

```text
Kundens mobil ──► Next.js App Router ──► Route Handlers ──► Service-lag (Zod)
                                                              ├── Prisma ──► Supabase PostGIS
                                                              ├── PaymentProvider
                                                              └── Realtime broadcast ──► Ansattpanel
```

All skriving går gjennom service-laget på serveren med service role-nøkkelen. Alle tabeller har
row level security slått på uten policies for `anon`, slik at den offentlige nøkkelen ikke kan lese
noe direkte.

### Mappestruktur

```text
prisma/
  schema.prisma          Datamodellen
  migrations/            PostGIS, suggest_holes, RLS
  seed.ts                Testdata med ekte banegeometri
src/
  app/                   Sider og API-ruter
  components/            Kunde-UI og ansattpanel
  lib/                   Prisma, Supabase-klienter, handlekurv, hooks
  server/
    services/            Forretningslogikk
    orders/              Statusmaskin
    payments/            PaymentProvider og mock-leverandør
    geo/                 Hullforslag mot PostGIS
    realtime/            Kanaler og kringkasting
scripts/run-scenarios.ts Gjennomkjøring av hovedscenariene
```

## Betaling

Betalingslaget er bygget rundt grensesnittet `PaymentProvider` med `authorize`, `capture`, `cancel`
og `refund`. Flyten følger spesifikasjonen: beløpet reserveres når kunden betaler, og trekkes først
når restauranten godkjenner. Avslår restauranten, oppheves reservasjonen automatisk.

MVP-en bruker `MockPaymentProvider`, som fører sin egen reskontro i tabellen `mock_payments` og
oppfører seg som en ekte leverandør: reservasjonen utløper etter 20 minutter, capture avvises hvis
betalingen står i feil tilstand, og hver handling sender en signert webhook til
`/api/webhooks/payment`.

Slik kobler du på en ekte leverandør:

1. Implementer `PaymentProvider` i `src/server/payments/`, for eksempel `vipps.ts`.
2. Registrer den i `providers` i `src/server/payments/index.ts`.
3. Sett `PAYMENT_PROVIDER=vipps` i miljøet.

Ordreflyten trenger ingen endringer.

## Personvern

Posisjonsdata behandles etter prinsippene i spesifikasjonen:

- Nettleseren spør aldri om posisjon før kunden har trykket på knappen selv, og forklaringen vises
  først.
- Manuell hullvelger er alltid tilgjengelig, og hele bestillingen kan fullføres uten GPS.
- Bare siste posisjon lagres, i én rad per bestilling.
- Sporingen stopper når bestillingen er levert, avslått eller kansellert.
- Koordinatene slettes automatisk 24 timer etter registrering. Hullnummeret beholdes for statistikk.

Slettejobben kjøres av `POST /api/maintenance/purge-locations`. På Vercel settes den opp som cron
med `CRON_SECRET` i `Authorization`-headeren.

## Verifisering

```bash
npm run typecheck
npm run dev            # i én terminal
npm run scenarios      # i en annen
```

`npm run scenarios` logger inn som en ekte ansatt og går gjennom bestilling uten GPS, hullforslag
fra GPS, godkjenning med capture, avslag med opphevet reservasjon, to ansatte som godkjenner
samtidig, webhook mottatt to ganger, kundeavbrudd, utsolgt vare, dobbeltklikk på betalingsknappen
og tilgangskontroll på admin-API-et.

## API

### Offentlige endepunkter

```text
GET    /api/clubs/{clubSlug}
GET    /api/clubs/{clubSlug}/menu
GET    /api/clubs/{clubSlug}/availability
POST   /api/location/suggest-hole
POST   /api/orders
POST   /api/orders/{publicToken}/payment-session
GET    /api/orders/{publicToken}
POST   /api/orders/{publicToken}/location
POST   /api/orders/{publicToken}/cancel
```

### Ansattendepunkter

```text
GET    /api/admin/orders
GET    /api/admin/orders/{orderId}
POST   /api/admin/orders/{orderId}/accept
POST   /api/admin/orders/{orderId}/decline
POST   /api/admin/orders/{orderId}/status
POST   /api/admin/orders/{orderId}/eta
POST   /api/admin/orders/{orderId}/assign-driver
POST   /api/admin/orders/{orderId}/not-found
GET    /api/admin/products
POST   /api/admin/products
PATCH  /api/admin/products/{productId}
DELETE /api/admin/products/{productId}
POST   /api/admin/products/{productId}/availability
POST   /api/admin/ordering/pause
POST   /api/admin/ordering/resume
```

### Webhooks og drift

```text
POST /api/webhooks/payment
POST /api/maintenance/purge-locations
```

## Ikke med i denne MVP-en

Egen mobilapp, bakgrunnssporing, gruppebestilling, rabattkoder, SMS- og pushvarsler,
kvitteringsskriver, alderskontroll utover merking av produkter, turneringsmodus og administrasjon
av flere golfklubber.
