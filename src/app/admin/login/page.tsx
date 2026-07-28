import { LoginForm } from "@/components/admin/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ neste?: string }>;
}) {
  const { neste } = await searchParams;
  return <LoginForm nextPath={neste ?? "/admin/orders"} />;
}
