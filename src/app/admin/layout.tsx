import { AdminNav } from "@/components/admin/admin-nav";
import { getStaffSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getStaffSession();

  return (
    <div className="min-h-screen bg-sand-50">
      {session ? <AdminNav name={session.name} role={session.role} /> : null}
      {children}
    </div>
  );
}
