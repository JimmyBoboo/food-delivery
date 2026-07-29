"use client";

import { useState } from "react";

import { ClubDefaultsEditor } from "@/components/admin/club-defaults-editor";
import { OpeningHoursEditor } from "@/components/admin/opening-hours-editor";
import { Alert, Badge, Button, Card, Spinner } from "@/components/ui";
import { apiGet, apiPost } from "@/lib/api";
import type { listOpeningHours } from "@/server/services/admin";
import type { getAvailability } from "@/server/services/menu";

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

type OpeningHoursData = Awaited<ReturnType<typeof listOpeningHours>>;
type Availability = Awaited<ReturnType<typeof getAvailability>>;

export function SettingsView({
  club,
  holes,
  openingHours,
  availability: initialAvailability,
  role,
  orderUrl,
}: {
  club: Club;
  holes: { holeNumber: number; isDeliveryEnabled: boolean }[];
  openingHours: OpeningHoursData;
  availability: Availability;
  role: string;
  orderUrl: string;
}) {
  const canManage = role === "ADMIN" || role === "MANAGER";
  const [state, setState] = useState(club);
  const [availability, setAvailability] = useState(initialAvailability);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function refreshAvailability() {
    const next = await apiGet<Availability>(`/api/clubs/${club.slug}/availability`);
    setAvailability(next);
    return next;
  }

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

  const outsideHours =
    state.isOrderingEnabled && !availability.isOrderingEnabled && availability.reasons.length > 0;

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
            {state.isOrderingEnabled ? "Pause av" : "Manuelt pauset"}
          </Badge>
          <Badge tone={availability.isOrderingEnabled ? "success" : "warning"}>
            {availability.isOrderingEnabled
              ? "Kunder kan bestille na"
              : "Kunder kan ikke bestille na"}
          </Badge>
          <Badge tone={availability.isCourseDeliveryPaused ? "warning" : "success"}>
            {availability.isCourseDeliveryPaused
              ? "Banelevering utilgjengelig"
              : "Leverer pa banen"}
          </Badge>
        </div>

        {/*
          «Gjenoppta alt» skrur bare av pauseknappen. Apningstidene gjelder fortsatt,
          sa midt pa natta er menyen stengt selv om pausen er av.
        */}
        {outsideHours ? (
          <Alert tone="warning" title="Apningstidene stenger for bestilling">
            {availability.reasons[0]}
            {availability.opensAt && availability.closesAt
              ? ` Utvid tidene under Apningstider hvis du vil teste na.`
              : " Sett apningstider for i dag under Apningstider."}
          </Alert>
        ) : null}

        {!state.isOrderingEnabled ? (
          <Alert tone="warning" title="Bestilling er manuelt pauset">
            Kundene ser at restauranten ikke tar imot bestillinger. Trykk «Gjenoppta alt» for a
            skru av pausen.
          </Alert>
        ) : null}

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
                await refreshAvailability();
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
                await refreshAvailability();
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
                await refreshAvailability();
              })
            }
          >
            {busy ? <Spinner /> : null}
            Gjenoppta alt
          </Button>
        </div>
      </Card>

      <OpeningHoursEditor initial={openingHours} canManage={canManage} />

      <ClubDefaultsEditor
        initial={{
          defaultPrepMinutes: state.defaultPrepMinutes,
          deliveryFee: state.deliveryFee,
          minimumOrderAmount: state.minimumOrderAmount,
        }}
        initialHoles={holes}
        canManage={canManage}
      />

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
