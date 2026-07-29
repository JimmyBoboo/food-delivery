/**
 * Apningstider er lokale for klubben, mens serveren kan sta i en helt annen
 * tidssone. Pa Vercel kjorer den i UTC, og da ville «apner 08:00» blitt tolket
 * to timer feil om sommeren. Alt som sammenlignes med apningstider ma derfor
 * gjennom disse funksjonene.
 */

/** Datoen i klubbens tidssone, pa formen 2026-07-30. */
export function clubDate(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Klokka i klubbens tidssone, pa formen 08:00, alltid pa 24-timersform. */
export function clubTime(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}

/** Ukedag i klubbens tidssone, der 0 er sondag slik OpeningHours forventer. */
export function clubDayOfWeek(timezone: string, now = new Date()): number {
  return isoDateToUtc(clubDate(timezone, now)).getUTCDay();
}

/**
 * Datokolonner ligger som `date` uten tidssone i databasen. De leses og skrives
 * derfor alltid ved midnatt UTC, slik at datoen ikke forskyves en dag.
 */
export function isoDateToUtc(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** Motstykket til isoDateToUtc, brukt nar rader sendes til nettleseren. */
export function utcToIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
