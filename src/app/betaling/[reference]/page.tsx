import { notFound } from "next/navigation";

import { MockCheckout } from "@/components/payment/mock-checkout";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Simulert betalingsside. Erstattes av Vipps MobilePay eller en kortleverandor
 * nar onboarding er pa plass. Skjermbildet finnes for at hele flyten med
 * reservasjon, capture og kansellering skal kunne testes ende til ende.
 */
export default async function MockPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ retur?: string }>;
}) {
  const { reference } = await params;
  const { retur } = await searchParams;

  const payment = await prisma.mockPayment.findUnique({ where: { reference } });
  if (!payment) notFound();

  const order = await prisma.order.findUnique({
    where: { id: payment.orderId },
    select: { orderNumber: true, publicToken: true, club: { select: { name: true } } },
  });

  if (!order) notFound();

  return (
    <MockCheckout
      reference={reference}
      amount={payment.amount}
      status={payment.status}
      orderNumber={order.orderNumber}
      clubName={order.club.name}
      returnUrl={retur ?? `/ordre/${order.publicToken}`}
    />
  );
}
