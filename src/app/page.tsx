import Link from "next/link";

import { Card } from "@/components/ui";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const clubs = await prisma.club
    .findMany({ orderBy: { name: "asc" }, select: { name: true, slug: true } })
    .catch(() => []);

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <div>
        <h1 className="text-3xl font-bold text-fairway-900">Bestilling pa golfbanen</h1>
        <p className="mt-2 text-fairway-700">
          Kundene apner klubbens lenke eller skanner QR-koden, bestiller fra mobilen og far maten
          levert der de er pa banen.
        </p>
      </div>

      {clubs.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-bold tracking-wide text-fairway-700 uppercase">Klubber</h2>
          {clubs.map((club) => (
            <Card key={club.slug} className="p-4">
              <Link href={`/${club.slug}`} className="font-semibold text-fairway-800">
                {club.name} →
              </Link>
              <p className="text-sm text-fairway-600">/{club.slug}</p>
            </Card>
          ))}
        </section>
      ) : (
        <Card className="space-y-2 p-4">
          <h2 className="font-semibold text-fairway-900">Ingen klubber enna</h2>
          <p className="text-sm text-fairway-700">
            Fyll ut <code>.env.local</code> med Supabase-nokler og kjor{" "}
            <code>npm run db:setup</code> for a opprette databasen og legge inn testdata.
          </p>
        </Card>
      )}

      <Card className="p-4">
        <Link href="/admin/login" className="font-semibold text-fairway-800">
          Ansattpanel →
        </Link>
        <p className="text-sm text-fairway-600">For restaurant, kjokken og levering.</p>
      </Card>
    </main>
  );
}
