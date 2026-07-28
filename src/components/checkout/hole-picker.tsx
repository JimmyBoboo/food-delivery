"use client";

import { useState } from "react";

import { Alert, Badge, Button, Card, Spinner } from "@/components/ui";
import { apiPost } from "@/lib/api";

import type { HolePosition } from "@/generated/prisma/enums";

export type HoleSuggestionView = {
  holeNumber: number;
  holeName: string | null;
  confidence: number;
  distanceMeters: number;
  isInside: boolean;
  nearestFeature: "TEE" | "FAIRWAY" | "GREEN" | null;
};

export type LocationReading = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};

type Props = {
  clubSlug: string;
  holes: { holeNumber: number; name: string | null; isDeliveryEnabled: boolean }[];
  selectedHole: number | null;
  onSelectHole: (holeNumber: number) => void;
  holePosition: HolePosition | null;
  onSelectPosition: (position: HolePosition) => void;
  onLocation: (location: LocationReading | null) => void;
  onSuggestion: (holeNumber: number | null) => void;
};

const POSITION_LABELS: { value: HolePosition; label: string }[] = [
  { value: "TEE", label: "Ved utslagsstedet" },
  { value: "FAIRWAY", label: "Pa fairway" },
  { value: "GREEN", label: "Ved green" },
];

/**
 * Hullvelger med to likestilte veier: GPS-forslag som kunden ma bekrefte,
 * og manuelt valg. Bestillingen kan alltid fullfores uten GPS, jf. paragraf 6.
 */
export function HolePicker({
  clubSlug,
  holes,
  selectedHole,
  onSelectHole,
  holePosition,
  onSelectPosition,
  onLocation,
  onSuggestion,
}: Props) {
  const [status, setStatus] = useState<"idle" | "explaining" | "locating" | "done" | "error">(
    "idle",
  );
  const [suggestions, setSuggestions] = useState<HoleSuggestionView[]>([]);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function requestLocation() {
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setErrorMessage("Nettleseren din stotter ikke posisjon. Velg hull manuelt nedenfor.");
      return;
    }

    setStatus("locating");
    setErrorMessage(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const reading: LocationReading = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy ?? 0,
        };

        setAccuracy(reading.accuracyMeters);
        onLocation(reading);

        try {
          const result = await apiPost<{ suggestions: HoleSuggestionView[] }>(
            "/api/location/suggest-hole",
            { clubSlug, ...reading },
          );

          setSuggestions(result.suggestions);
          setStatus("done");

          if (result.suggestions.length === 0) {
            setErrorMessage(
              "Vi klarte ikke a kjenne igjen hvor pa banen du er. Velg hull manuelt nedenfor.",
            );
          } else {
            onSuggestion(result.suggestions[0].holeNumber);
          }
        } catch (error) {
          setStatus("error");
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Kunne ikke hente hullforslag. Velg hull manuelt nedenfor.",
          );
        }
      },
      (error) => {
        setStatus("error");
        setErrorMessage(
          error.code === error.PERMISSION_DENIED
            ? "Du sa nei til posisjonsdeling. Det gar helt fint, velg hull manuelt nedenfor."
            : "Vi fikk ikke tak i posisjonen din. Velg hull manuelt nedenfor.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-bold text-fairway-900">Hvor er du pa banen?</h2>
        <p className="mt-1 text-sm text-fairway-700">
          Vi trenger dette for a finne deg med maten. Du kan velge hull selv, eller la telefonen
          foresla.
        </p>
      </div>

      {status === "idle" ? (
        <Button variant="secondary" size="lg" className="w-full" onClick={() => setStatus("explaining")}>
          Finn hvor jeg er pa banen
        </Button>
      ) : null}

      {status === "explaining" ? (
        <Card className="space-y-3 p-4">
          <h3 className="font-semibold text-fairway-900">For vi sporr nettleseren</h3>
          <p className="text-sm text-fairway-700">
            Posisjonen brukes bare til a foresla hvilket hull du er pa, og til at
            leveringspersonen skal finne deg. Vi lagrer kun siste posisjon, sletter den innen 24
            timer etter levering, og bruker den aldri til markedsforing.
          </p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={requestLocation}>
              Del posisjon
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => setStatus("idle")}>
              Nei takk
            </Button>
          </div>
        </Card>
      ) : null}

      {status === "locating" ? (
        <Card className="flex items-center gap-3 p-4">
          <Spinner className="text-fairway-600" />
          <p className="text-sm text-fairway-700">Finner posisjonen din ...</p>
        </Card>
      ) : null}

      {errorMessage ? <Alert tone="warning">{errorMessage}</Alert> : null}

      {suggestions.length > 0 ? (
        <Card className="space-y-3 p-4">
          <div>
            <h3 className="font-semibold text-fairway-900">
              Vi tror du er pa hull {suggestions[0].holeNumber}. Stemmer det?
            </h3>
            {accuracy !== null ? (
              <p className="mt-1 text-xs text-fairway-600">
                Noyaktighet omtrent {Math.round(accuracy)} meter.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.holeNumber}
                type="button"
                onClick={() => onSelectHole(suggestion.holeNumber)}
                className={
                  selectedHole === suggestion.holeNumber
                    ? "flex w-full items-center gap-3 rounded-xl border-2 border-fairway-600 bg-fairway-50 p-3 text-left"
                    : "flex w-full items-center gap-3 rounded-xl border border-fairway-200 p-3 text-left"
                }
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fairway-600 font-bold text-white">
                  {suggestion.holeNumber}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-fairway-900">
                    Hull {suggestion.holeNumber}
                    {suggestion.holeName ? ` – ${suggestion.holeName}` : ""}
                  </span>
                  <span className="block text-xs text-fairway-600">
                    {suggestion.isInside
                      ? "Du er innenfor dette hullet"
                      : `Omtrent ${suggestion.distanceMeters} meter unna`}
                    {suggestion.nearestFeature === "TEE"
                      ? ", naer utslagsstedet"
                      : suggestion.nearestFeature === "GREEN"
                        ? ", naer green"
                        : ""}
                  </span>
                </span>
                <Badge tone={suggestion.confidence > 0.6 ? "success" : "neutral"}>
                  {Math.round(suggestion.confidence * 100)} %
                </Badge>
              </button>
            ))}
          </div>

          <p className="text-xs text-fairway-600">
            Stemmer ingen av forslagene? Velg hull manuelt nedenfor.
          </p>
        </Card>
      ) : null}

      <div>
        <label className="text-sm font-semibold text-fairway-900" htmlFor="hull">
          Velg hull
        </label>
        <select
          id="hull"
          value={selectedHole ?? ""}
          onChange={(event) => onSelectHole(Number(event.target.value))}
          className="mt-1 w-full rounded-xl border border-fairway-200 bg-white px-3 py-3 text-base"
        >
          <option value="" disabled>
            Velg hullnummer
          </option>
          {holes.map((hole) => (
            <option key={hole.holeNumber} value={hole.holeNumber} disabled={!hole.isDeliveryEnabled}>
              Hull {hole.holeNumber}
              {hole.name ? ` – ${hole.name}` : ""}
              {hole.isDeliveryEnabled ? "" : " (ingen levering)"}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className="text-sm font-semibold text-fairway-900">Hvor pa hullet?</span>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {POSITION_LABELS.map((position) => (
            <button
              key={position.value}
              type="button"
              onClick={() => onSelectPosition(position.value)}
              className={
                holePosition === position.value
                  ? "rounded-xl border-2 border-fairway-600 bg-fairway-50 px-2 py-2.5 text-xs font-semibold text-fairway-800"
                  : "rounded-xl border border-fairway-200 bg-white px-2 py-2.5 text-xs font-medium text-fairway-700"
              }
            >
              {position.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
