"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { bolehTulis, requirePenulis } from "@/lib/auth";
import { COOKIE_DEV } from "@/lib/dev-notes";

export type FormState = { error?: string } | null;

/**
 * Buka catatan operasional di /dev.
 *
 * Passwordnya dibandingkan DI SERVER dan dibaca dari env var, bukan ditulis
 * di source: kalau dihardcode dia ikut ter-commit ke repo, dan kalau dicek di
 * komponen client dia ikut terkirim ke browser siapa pun yang membuka halaman.
 *
 * Ini lapis kedua, bukan penjaga sebenarnya — /dev sudah dikunci super_admin
 * lewat requirePenulis() persis seperti menu Data dummy. Anggap password ini
 * sebagai pengingat "ini catatan operasional", bukan pengaman data sensitif.
 */
export async function bukaCatatanDev(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await requirePenulis();
  if (!bolehTulis(profile.role)) {
    return { error: "Hanya super admin yang bisa membuka catatan dev." };
  }

  const seharusnya = process.env.DEV_NOTES_PASSWORD;
  if (!seharusnya) {
    return {
      error:
        "DEV_NOTES_PASSWORD belum diset di environment. Tambahkan di .env.local " +
        "(lokal) dan di Environment Variables Vercel (produksi).",
    };
  }

  const diisi = String(formData.get("password") ?? "");
  if (diisi !== seharusnya) return { error: "Password salah." };

  const jar = await cookies();
  jar.set(COOKIE_DEV, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/dev",
    // Cookie sesi: tertutup lagi begitu browser ditutup.
  });

  revalidatePath("/dev");
  return null;
}

export async function kunciCatatanDev() {
  await requirePenulis();
  const jar = await cookies();
  jar.delete({ name: COOKIE_DEV, path: "/dev" });
  revalidatePath("/dev");
}
