"use client";

import { useState } from "react";

import { Field, inputClass } from "@/components/admin/form-fields";
import { Alert, Button, Card, Spinner, cn } from "@/components/ui";
import { apiPatch, apiPost } from "@/lib/api";

type ClubDefaults = {
  defaultPrepMinutes: number;
  deliveryFee: number;
  minimumOrderAmount: number;
};

type Hole = {
  holeNumber: number;
  isDeliveryEnabled: boolean;
};

/** Godtar bade «49» og «49,50». */
function parseKroner(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function ClubDefaultsEditor({
  initial,
  initialHoles,
  canManage,
}: {
  initial: ClubDefaults;
  initialHoles: Hole[];
  canManage: boolean;
}) {
  const [prepMinutes, setPrepMinutes] = useState(String(initial.defaultPrepMinutes));
  const [deliveryFee, setDeliveryFee] = useState(String(initial.deliveryFee / 100));
  const [minimumOrder, setMinimumOrder] = useState(String(initial.minimumOrderAmount / 100));
  const [holes, setHoles] = useState(initialHoles);

  const [saving, setSaving] = useState(false);
  const [busyHole, setBusyHole] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const enabledCount = holes.filter((hole) => hole.isDeliveryEnabled).length;

  async function saveDefaults(event: React.FormEvent) {
    event.preventDefault();

    const defaultPrepMinutes = Number(prepMinutes.trim());
    if (!prepMinutes.trim() || !Number.isInteger(defaultPrepMinutes) || defaultPrepMinutes < 1) {
      setError("Leveringstiden ma vaere et helt antall minutter, minst 1.");
      return;
    }

    const deliveryFeeKroner = parseKroner(deliveryFee);
    if (deliveryFeeKroner === null) {
      setError("Skriv inn leveringsgebyret i kroner, for eksempel 49 eller 49,50.");
      return;
    }

    const minimumOrderKroner = parseKroner(minimumOrder);
    if (minimumOrderKroner === null) {
      setError("Skriv inn minstebelopet i kroner, for eksempel 75.");
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const result = await apiPatch<ClubDefaults>("/api/admin/settings", {
        defaultPrepMinutes,
        deliveryFeeKroner,
        minimumOrderKroner,
      });
      setPrepMinutes(String(result.defaultPrepMinutes));
      setDeliveryFee(String(result.deliveryFee / 100));
      setMinimumOrder(String(result.minimumOrderAmount / 100));
      setSaved(true);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Kunne ikke lagre standardverdiene.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleHole(hole: Hole) {
    setBusyHole(hole.holeNumber);
    setError(null);

    try {
      const result = await apiPost<{ holeNumber: number; isDeliveryEnabled: boolean }>(
        `/api/admin/holes/${hole.holeNumber}/delivery`,
        { isDeliveryEnabled: !hole.isDeliveryEnabled },
      );
      setHoles((current) =>
        current.map((candidate) =>
          candidate.holeNumber === result.holeNumber
            ? { ...candidate, isDeliveryEnabled: result.isDeliveryEnabled }
            : candidate,
        ),
      );
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Kunne ikke endre levering for hullet.",
      );
    } finally {
      setBusyHole(null);
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="font-bold text-fairway-900">Standardverdier</h2>
        <p className="mt-1 text-sm text-fairway-700">
          Disse brukes nar kunden bestiller, og nar restauranten foreslar leveringstid.
        </p>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {saved ? <Alert tone="success">Standardverdiene er lagret.</Alert> : null}

      <form onSubmit={saveDefaults} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="Standard leveringstid"
            hint="Minutter. Brukes som utgangspunkt nar restauranten godkjenner."
          >
            <input
              type="number"
              min={1}
              max={180}
              value={prepMinutes}
              disabled={!canManage || saving}
              onChange={(event) => {
                setPrepMinutes(event.target.value);
                setSaved(false);
              }}
              className={inputClass}
            />
          </Field>

          <Field label="Leveringsgebyr" hint="I kroner. Sett 0 for gratis levering.">
            <input
              value={deliveryFee}
              disabled={!canManage || saving}
              inputMode="decimal"
              onChange={(event) => {
                setDeliveryFee(event.target.value);
                setSaved(false);
              }}
              className={inputClass}
            />
          </Field>

          <Field label="Minstebelop" hint="I kroner. Bestillinger under dette belopet avvises.">
            <input
              value={minimumOrder}
              disabled={!canManage || saving}
              inputMode="decimal"
              onChange={(event) => {
                setMinimumOrder(event.target.value);
                setSaved(false);
              }}
              className={inputClass}
            />
          </Field>
        </div>

        {canManage ? (
          <Button type="submit" disabled={saving}>
            {saving ? <Spinner /> : null}
            Lagre standardverdier
          </Button>
        ) : (
          <p className="text-sm text-fairway-600">
            Bare administrator og manager kan endre standardverdiene.
          </p>
        )}
      </form>

      <div className="space-y-3 border-t border-fairway-100 pt-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="font-semibold text-fairway-900">Hull med levering</h3>
            <p className="mt-0.5 text-sm text-fairway-700">
              Skru av hull der det ikke er mulig a levere, for eksempel ved banearbeid.
            </p>
          </div>
          <p className="text-sm font-semibold text-fairway-800">
            {enabledCount} av {holes.length}
          </p>
        </div>

        <div className="grid grid-cols-6 gap-2 sm:grid-cols-9">
          {holes.map((hole) => (
            <button
              key={hole.holeNumber}
              type="button"
              disabled={!canManage || busyHole === hole.holeNumber}
              onClick={() => void toggleHole(hole)}
              aria-pressed={hole.isDeliveryEnabled}
              aria-label={
                hole.isDeliveryEnabled
                  ? `Hull ${hole.holeNumber}, levering pa. Trykk for a skru av.`
                  : `Hull ${hole.holeNumber}, levering av. Trykk for a skru pa.`
              }
              className={cn(
                "flex h-11 items-center justify-center rounded-xl text-sm font-semibold transition-colors",
                "disabled:cursor-not-allowed disabled:opacity-60",
                hole.isDeliveryEnabled
                  ? "bg-fairway-600 text-white hover:bg-fairway-700"
                  : "border border-fairway-200 bg-white text-fairway-500 hover:bg-fairway-50",
              )}
            >
              {busyHole === hole.holeNumber ? <Spinner /> : hole.holeNumber}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}
