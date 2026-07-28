import { notFound } from "next/navigation";

import { OrderStatusView } from "@/components/order/order-status-view";
import { NotFoundError } from "@/server/errors";
import { getOrderForCustomer } from "@/server/services/order-views";
import { refreshPaymentFromProvider } from "@/server/services/orders";

export const dynamic = "force-dynamic";

export default async function OrderStatusPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;

  try {
    // Kunden kan ha kommet tilbake fra betalingssiden for webhooken rakk frem.
    await refreshPaymentFromProvider(publicToken);
    const order = await getOrderForCustomer(publicToken);

    return <OrderStatusView initialOrder={order} publicToken={publicToken} />;
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
