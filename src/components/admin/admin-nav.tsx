"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Badge } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/admin/orders", label: "Bestillinger" },
  { href: "/admin/products", label: "Produkter" },
  { href: "/admin/settings", label: "Innstillinger" },
];

export function AdminNav({ name, role }: { name: string; role: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <header className="border-b border-fairway-100 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
        <span className="font-bold text-fairway-900">Kontrollpanel</span>

        <nav className="flex gap-1">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                pathname.startsWith(link.href)
                  ? "rounded-lg bg-fairway-600 px-3 py-1.5 text-sm font-semibold text-white"
                  : "rounded-lg px-3 py-1.5 text-sm font-medium text-fairway-700 hover:bg-fairway-50"
              }
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-fairway-700 sm:inline">{name}</span>
          <Badge tone="neutral">{role}</Badge>
          <button
            type="button"
            onClick={signOut}
            className="text-sm font-medium text-fairway-600 hover:underline"
          >
            Logg ut
          </button>
        </div>
      </div>
    </header>
  );
}
