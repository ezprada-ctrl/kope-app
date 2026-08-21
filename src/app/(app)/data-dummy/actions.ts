"use server";

import { revalidatePath } from "next/cache";

import { bolehTulis, requirePenulis } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string } | null;

/**
 * Toggle tampil/sembunyi seluruh data dummy. Ini BUKAN hapus — baris
 * dummy tetap ada selamanya di database, cuma disembunyikan dari semua
 * tampilan lewat RLS begitu tampilkan=false. Lihat migrasi 0021.
 */
export async function aturTampilanDataDummy(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await requirePenulis();
  if (!bolehTulis(profile.role)) {
    return { error: "Hanya super admin yang bisa mengatur tampilan data dummy." };
  }

  const tampilkan = formData.get("tampilkan") === "true";

  const supabase = await createClient();
  const { error } = await supabase.rpc("atur_tampilan_data_dummy", {
    p_tampilkan: tampilkan,
  });

  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };

  // Semua halaman yang menampilkan data transaksional kena imbasnya.
  revalidatePath("/", "layout");
  return null;
}
