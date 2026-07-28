import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold text-fairway-900">Fant ikke siden</h1>
      <p className="mt-2 text-fairway-700">
        Lenken kan vaere feil, eller bestillingen kan vaere fjernet.
      </p>
      <Link href="/" className="mt-6 rounded-xl bg-fairway-600 px-5 py-3 font-semibold text-white">
        Til forsiden
      </Link>
    </main>
  );
}
