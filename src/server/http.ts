import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { AppError } from "@/server/errors";
import { OrderTransitionError } from "@/server/orders/state-machine";
import { PaymentError } from "@/server/payments/provider";

export function jsonError(message: string, status: number, code: string, details?: unknown) {
  return NextResponse.json({ error: { message, code, details } }, { status });
}

/**
 * Felles feilhandtering for route handlers, slik at klienten alltid far en
 * lesbar norsk melding i stedet for en stack trace.
 */
export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const result = await fn();
    if (result instanceof NextResponse) return result;
    return NextResponse.json(result ?? { ok: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError("Ugyldige data i foresporselen.", 400, "VALIDATION_ERROR", error.issues);
    }
    if (error instanceof AppError) {
      return jsonError(error.message, error.status, error.code, error.details);
    }
    if (error instanceof OrderTransitionError) {
      return jsonError(error.message, 409, "INVALID_TRANSITION");
    }
    if (error instanceof PaymentError) {
      return jsonError(error.message, 409, `PAYMENT_${error.code}`);
    }

    console.error("Ubehandlet feil i API", error);
    return jsonError("Det oppstod en uventet feil.", 500, "INTERNAL_ERROR");
  }
}

// ---------------------------------------------------------------------------
// Rate limiting
//
// Enkel telling i minnet. Holder for en pilot pa en klubb. Ved utrulling til
// flere instanser bor dette flyttes til Redis, jf. paragraf 7.1.
// ---------------------------------------------------------------------------

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  bucket.count += 1;

  if (bucket.count > limit) {
    throw new AppError(
      "For mange foresporsler. Vent litt og prov igjen.",
      429,
      "RATE_LIMITED",
    );
  }
}

export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "ukjent";
  return `${scope}:${ip}`;
}
