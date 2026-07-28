"use client";

import { useState } from "react";

import { Alert, Button, Card, Spinner } from "@/components/ui";
import { apiPost } from "@/lib/api";
import { formatAmount } from "@/lib/money";

export function MockCheckout({
  reference,
  amount,
  status,
  orderNumber,
  clubName,
  returnUrl,
}: {
  reference: string;
  amount: number;
  status: string;
  orderNumber: number;
  clubName: string;
  returnUrl: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const alreadyHandled = status !== "CREATED";

  async function act(action: "authorize" | "cancel" | "fail") {
    setBusy(action);
    setError(null);

    try {
      await apiPost(`/api/payments/mock/${reference}`, { action });
      window.location.href = returnUrl;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Noe gikk galt.");
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8">
      <Alert tone="warning" title="Simulert betaling">
        Dette skjermbildet erstatter Vipps MobilePay i MVP-en. Betalingslaget er bygget slik at en
        ekte leverandor kan kobles pa uten endringer i ordreflyten.
      </Alert>

      <Card className="mt-4 space-y-5 p-6">
        <div className="text-center">
          <p className="text-sm text-fairway-600">{clubName}</p>
          <p className="mt-1 text-sm text-fairway-700">Bestilling nummer {orderNumber}</p>
          <p className="mt-4 text-4xl font-bold text-fairway-900">{formatAmount(amount)}</p>
          <p className="mt-2 text-sm text-fairway-700">
            Belopet reserveres na. Det trekkes forst nar restauranten godkjenner bestillingen.
          </p>
        </div>

        {alreadyHandled ? (
          <Alert tone="info">
            Denne betalingen er allerede behandlet (status {status}).
          </Alert>
        ) : (
          <div className="space-y-2">
            <Button
              size="lg"
              className="w-full"
              disabled={busy !== null}
              onClick={() => act("authorize")}
            >
              {busy === "authorize" ? <Spinner /> : null}
              Betal med Vipps
            </Button>

            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              disabled={busy !== null}
              onClick={() => act("authorize")}
            >
              Betal med kort
            </Button>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button
                variant="ghost"
                disabled={busy !== null}
                onClick={() => act("cancel")}
              >
                Avbryt
              </Button>
              <Button
                variant="ghost"
                disabled={busy !== null}
                onClick={() => act("fail")}
                className="text-red-600"
              >
                Simuler feil
              </Button>
            </div>
          </div>
        )}

        {error ? <Alert tone="danger">{error}</Alert> : null}

        {alreadyHandled ? (
          <Button className="w-full" onClick={() => (window.location.href = returnUrl)}>
            Tilbake til bestillingen
          </Button>
        ) : null}
      </Card>
    </main>
  );
}
