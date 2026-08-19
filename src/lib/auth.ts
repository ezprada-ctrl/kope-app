import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/types/database";

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin / Owner",
  owner_partner: "Owner Partner",
  pemodal: "Pemodal",
};

/** Profil user yang sedang login, atau redirect ke /login kalau belum. */
export async function requireProfile(): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    // User ada di auth.users tapi profil belum kebentuk — jangan diam-diam lolos.
    redirect("/login?error=profil-tidak-ditemukan");
  }

  if (!profile.aktif) {
    // Profil hasil signup dibuat non-aktif (migrasi 0012). Selama admin
    // belum mengaktifkan, jangan beri akses ke shell aplikasi sama sekali.
    redirect("/login?error=akun-belum-aktif");
  }

  return profile;
}

/** Batasi halaman ke role tertentu. RLS tetap jadi penjaga terakhir di DB. */
export async function requireRole(...roles: UserRole[]): Promise<Profile> {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect("/dashboard?error=akses-ditolak");
  return profile;
}
