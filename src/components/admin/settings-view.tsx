"use client";

import { useState } from "react";

import { Alert, Badge, Button, Card, Spinner } from "@/components/ui";
import { apiPost } from "@/lib/api";
import { formatAmount } from "@/lib/money";

type Club = {
  name: string;
  slug: string;
  isOrderingEnabled: boolean;
  isCourseDeliveryPaused: boolean;
  pauseMessage: string | null;
  defaultPrepMinutes: number;
  deliveryFee: number;
  minimumOrderAmount: number;
};

export function SettingsView({
  club,
  holes,
  orderUrl,
}: {
  club: Club;
  holes: { holeNumber: number; isDeliveryEnabled: boolean }[];
  orderUrl: string;
}) {
  const [state, setState] = useState(club);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Handlingen feilet.");
    } finally {
      setBusy(false);
    }
  }

  const deliveryHoles = holes.filter((hole) => hole.isDeliveryEnabled).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
      <header>
        <h1 className="text-2xl font-bold text-fairway-900">Innstillinger</h1>
        <p className="text-sm text-fairway-700">{club.name}</p>
      </header>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card className="space-y-3 p-4">
        <h2 className="font-bold text-fairway-900">Kapasitet</h2>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={state.isOrderingEnabled ? "success" : "danger"}>
            {state.isOrderingEnabled ? "Tar imot bestillinger" : "Bestillinger pauset"}
          </Badge>
          <Badge tone={state.isCourseDeliveryPaused ? "warning" : "success"}>
            {state.isCourseDeliveryPaused ? "Banelevering pauset" : "Leverer pa banen"}
          </Badge>
        </div>

        <label className="block">
          <span className="text-sm font-semibold text-fairway-900">
            Melding til kundene ved pause
          </span>
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Det er stor pagang. Forventet leveringstid er na 35–45 minutter."
            className="mt-1 w-full rounded-xl border border-fairway-200 px-3 py-2.5 text-sm"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const result = await apiPost<{
                  isOrderingEnabled: boolean;
                  isCourseDeliveryPaused: boolean;
                }>("/api/admin/ordering/pause", {
                  scope: "COURSE_DELIVERY",
                  message: message || undefined,
                });
                setState((current) => ({ ...current, ...result }));
              })
            }
          >
            Pause levering pa banen
          </Button>

          <Button
            variant="danger"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const result = await apiPost<{
                  isOrderingEnabled: boolean;
                  isCourseDeliveryPaused: boolean;
                }>("/api/admin/ordering/pause", { scope: "ALL", message: message || undefined });
                setState((current) => ({ ...current, ...result }));
              })
            }
          >
            Pause alle bestillinger
          </Button>

          <Button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const result = await apiPost<{
                  isOrderingEnabled: boolean;
                  isCourseDeliveryPaused: boolean;
                }>("/api/admin/ordering/resume");
                setState((current) => ({ ...current, ...result }));
              })
            }
          >
            {busy ? <Spinner /> : null}
            Gjenoppta alt
          </Button>
        </div>
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="font-bold text-fairway-900">Standardverdier</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-fairway-600">Standard leveringstid</dt>
            <dd className="font-semibold text-fairway-900">{state.defaultPrepMinutes} min</dd>
          </div>
          <div>
            <dt className="text-fairway-600">Leveringsgebyr</dt>
            <dd className="font-semibold text-fairway-900">{formatAmount(state.deliveryFee)}</dd>
          </div>
          <div>
            <dt className="text-fairway-600">Minstebelop</dt>
            <dd className="font-semibold text-fairway-900">
              {formatAmount(state.minimumOrderAmount)}
            </dd>
          </div>
          <div>
            <dt className="text-fairway-600">Hull med levering</dt>
            <dd className="font-semibold text-fairway-900">
              {deliveryHoles} av {holes.length}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="font-bold text-fairway-900">Lenke og QR-kode</h2>
        <p className="text-sm text-fairway-700">
          Denne lenken kan trykkes pa scorekort, golfbiler og menyer.
        </p>
        <code className="block rounded-xl bg-fairway-50 px-3 py-2 text-sm break-all">
          {orderUrl}
        </code>
        <Button
          variant="secondary"
          onClick={() => {
            void navigator.clipboard.writeText(orderUrl);
          }}
        >
          Kopier lenken
        </Button>
      </Card>
    </div>
  );
}
