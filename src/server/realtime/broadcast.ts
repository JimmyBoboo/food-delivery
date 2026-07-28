import { env } from "@/lib/env";

/**
 * Kanalnavn, jf. paragraf 10.
 *
 * Ansattkanalene er private og krever innlogget Supabase-bruker gjennom
 * policyen pa realtime.messages. Kundens kanal er nokkelt med public_token.
 */
export const channels = {
  clubOrders: (clubId: string) => `club:${clubId}:orders`,
  delivery: (clubId: string) => `delivery:${clubId}`,
  order: (publicToken: string) => `order:${publicToken}`,
};

export type BroadcastMessage = {
  topic: string;
  event: string;
  /** Kun ikke-sensitive felter. Klienten henter resten gjennom API-et. */
  payload: Record<string, unknown>;
  isPrivate: boolean;
};

/**
 * Sender meldinger gjennom Supabase Realtime sitt HTTP-endepunkt, slik at
 * serveren slipper a holde en websocket apen.
 *
 * Sanntid er en forbedring, ikke en forutsetning: feiler kallet, logges det
 * og klientene faller tilbake pa polling.
 */
export async function broadcast(messages: BroadcastMessage[]): Promise<void> {
  if (messages.length === 0) return;

  try {
    const response = await fetch(`${env.supabaseUrl}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.supabaseServiceRoleKey,
        Authorization: `Bearer ${env.supabaseServiceRoleKey}`,
      },
      body: JSON.stringify({
        messages: messages.map((message) => ({
          topic: message.topic,
          event: message.event,
          payload: message.payload,
          private: message.isPrivate,
        })),
      }),
    });

    if (!response.ok) {
      console.warn("Realtime-kringkasting feilet", response.status, await response.text());
    }
  } catch (error) {
    console.warn("Realtime-kringkasting feilet", error);
  }
}

/** Varsler ansattpanelet om at en bestilling er endret. */
export async function notifyOrderChanged(input: {
  clubId: string;
  orderId: string;
  publicToken: string;
  status: string;
  event: "order.created" | "order.updated";
}): Promise<void> {
  await broadcast([
    {
      topic: channels.clubOrders(input.clubId),
      event: input.event,
      payload: { orderId: input.orderId, status: input.status },
      isPrivate: true,
    },
    {
      topic: channels.order(input.publicToken),
      event: "status",
      payload: { status: input.status },
      isPrivate: false,
    },
  ]);
}
