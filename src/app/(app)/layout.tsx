import Link from "next/link";

import { logout } from "@/app/login/actions";
import { requireProfile, ROLE_LABEL } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";

type NavItem = { href: string; label: string; roles: UserRole[] };

const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    roles: ["super_admin", "admin", "pemodal"],
  },
  {
    href: "/unit",
    label: "Unit",
    roles: ["super_admin", "admin", "pemodal"],
  },
  {
    href: "/modal",
    label: "Modal",
    roles: ["super_admin", "admin", "pemodal"],
  },
  {
    href: "/bagi-hasil",
    label: "Bagi hasil",
    roles: ["super_admin", "admin", "pemodal"],
  },
  {
    href: "/kas",
    label: "Kas",
    roles: ["super_admin", "admin", "pemodal"],
  },
  {
    href: "/kurir",
    label: "Kurir",
    roles: ["super_admin", "admin"],
  },
  {
    href: "/deposit",
    label: "Deposit",
    roles: ["super_admin", "admin"],
  },
  {
    href: "/rekonsiliasi",
    label: "Rekonsiliasi",
    roles: ["super_admin", "admin", "pemodal"],
  },
  {
    href: "/dashboard/financial-summary",
    label: "Ringkasan",
    roles: ["super_admin", "admin"],
  },
];

export default async function AppLayout({
  children,
}: LayoutProps<"/">) {
  const profile = await requireProfile();
  const items = NAV.filter((i) => i.roles.includes(profile.role));

  const supabase = await createClient();
  const { data: belumDibaca } = await supabase.rpc("jumlah_notif_belum_dibaca");

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-950 text-neutral-100">
      <header className="sticky top-0 z-10 border-b border-neutral-900 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/dashboard" className="text-base font-semibold">
            KOPE
          </Link>

          <nav className="flex flex-1 flex-wrap gap-4 text-sm">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-neutral-400 transition hover:text-neutral-100"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/notifikasi"
              className="relative rounded-md border border-neutral-800 px-2.5 py-1 text-neutral-300 transition hover:border-neutral-700 hover:text-neutral-100"
              aria-label={
                belumDibaca
                  ? `Notifikasi, ${belumDibaca} belum dibaca`
                  : "Notifikasi"
              }
            >
              🔔
              {Boolean(belumDibaca) && (
                <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-medium text-neutral-950">
                  {Number(belumDibaca) > 9 ? "9+" : belumDibaca}
                </span>
              )}
            </Link>

            <span className="hidden text-neutral-400 sm:inline">
              {profile.nama} · {ROLE_LABEL[profile.role]}
            </span>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-md border border-neutral-800 px-2.5 py-1 text-neutral-300 transition hover:border-neutral-700 hover:text-neutral-100"
              >
                Keluar
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
