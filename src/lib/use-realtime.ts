"use client";

import { useEffect, useRef } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Lytter pa en Supabase Realtime-kanal.
 *
 * Meldingene er tynne: de sier bare at noe er endret. Klienten henter selve
 * innholdet gjennom API-et etterpa, slik at ingen sensitive opplysninger
 * sendes over kanalen, jf. paragraf 10.
 */
export function useRealtimeChannel(
  topic: string | null,
  onMessage: () => void,
  options: { isPrivate?: boolean } = {},
) {
  const handler = useRef(onMessage);
  handler.current = onMessage;

  const isPrivate = options.isPrivate ?? false;

  useEffect(() => {
    if (!topic) return;
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;

    const supabase = getSupabaseBrowserClient();
    const channel = supabase.channel(topic, { config: { private: isPrivate } });

    channel
      .on("broadcast", { event: "*" }, () => {
        handler.current();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [topic, isPrivate]);
}
