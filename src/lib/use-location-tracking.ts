"use client";

import { useEffect, useRef, useState } from "react";

import { apiPost } from "@/lib/api";

/** Terskler fra paragraf 6.3, slik at vi ikke sender posisjon hvert sekund. */
const MIN_DISTANCE_METERS = 25;
const MIN_INTERVAL_MS = 25_000;
const ACCURACY_IMPROVEMENT_FACTOR = 0.5;

type Sent = { latitude: number; longitude: number; accuracy: number; at: number };

function distanceMeters(a: Sent, b: { latitude: number; longitude: number }): number {
  const earthRadius = 6_371_000;
  const toRad = (value: number) => (value * Math.PI) / 180;

  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

/**
 * Folger kundens posisjon mens bestillingen er aktiv.
 *
 * Sporingen starter aldri av seg selv: den krever at kunden har delt posisjon,
 * og den stopper sa snart bestillingen er levert, avslatt eller kansellert.
 */
export function useLocationTracking(publicToken: string, enabled: boolean) {
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSent = useRef<Sent | null>(null);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !isSharing) {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      return;
    }

    if (!("geolocation" in navigator)) {
      setError("Nettleseren din stotter ikke posisjonsdeling.");
      return;
    }

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const reading = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy ?? 0,
        };

        const previous = lastSent.current;
        const now = Date.now();

        const shouldSend =
          previous === null ||
          distanceMeters(previous, reading) > MIN_DISTANCE_METERS ||
          now - previous.at > MIN_INTERVAL_MS ||
          reading.accuracyMeters < previous.accuracy * ACCURACY_IMPROVEMENT_FACTOR;

        if (!shouldSend) return;

        lastSent.current = {
          latitude: reading.latitude,
          longitude: reading.longitude,
          accuracy: reading.accuracyMeters,
          at: now,
        };

        void apiPost(`/api/orders/${publicToken}/location`, reading).catch(() => {
          // Darlig dekning er forventet pa banen. Neste maling forsoker igjen.
        });
      },
      (positionError) => {
        setError(
          positionError.code === positionError.PERMISSION_DENIED
            ? "Posisjonsdeling er slatt av. Restauranten bruker hullet du oppga."
            : "Vi far ikke tak i posisjonen din akkurat na.",
        );
        setIsSharing(false);
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [enabled, isSharing, publicToken]);

  return {
    isSharing: isSharing && enabled,
    error,
    start: () => {
      setError(null);
      setIsSharing(true);
    },
    stop: () => setIsSharing(false),
  };
}
