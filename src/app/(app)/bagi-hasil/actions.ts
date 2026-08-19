"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; ok?: string } | null;

export async function ubahPorsiPemodal(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await requireProfile();
  if (profile.role !== "admin") {
    return { error: "Hanya admin yang bisa mengubah skema bagi hasil." };
  }

  const raw = String(formData.get("pemodal_percentage") ?? "").trim();
  const persen = Number(raw);

  if (!Number.isFinite(persen) || persen < 0 || persen > 100) {
    return { error: "Porsi pemodal harus antara 0 dan 100." };
  }

  const supabase = await createClient();

  // Tabel ini append-only: mengubah setting = insert baris baru dengan
  // effective_date baru. Baris lama tetap ada supaya profit_split yang sudah
  // terlanjur dihitung tetap bisa ditelusuri ke setting yang berlaku saat itu.
  const { error } = await supabase.from("profit_share_settings").insert({
    pemodal_percentage: persen,
    owner_admin_percentage: 20,
    owner_partner_percentage: 80,
    effective_date: new Date().toISOString(),
    catatan: String(formData.get("catatan") ?? "").trim() || null,
  });

  if (error) return { error: `Gagal menyimpan: ${error.message}` };

  revalidatePath("/bagi-hasil");
  revalidatePath("/dashboard");
  return { ok: `Porsi pemodal sekarang ${persen}%. Berlaku untuk unit yang di-settle setelah ini.` };
}
