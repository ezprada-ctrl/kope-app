"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { bolehTulis, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string } | null;

export async function catatRekonsiliasi(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await requireProfile();
  if (!bolehTulis(profile.role)) {
    return { error: "Hanya super admin yang bisa mencatat rekonsiliasi." };
  }

  const tanggal = String(formData.get("tanggal") ?? "").trim();
  if (!tanggal) return { error: "Tanggal wajib diisi." };

  const mutasi_bank_jago = Number(
    String(formData.get("mutasi_bank_jago") ?? "").replace(/[^\d.-]/g, ""),
  );
  if (!Number.isFinite(mutasi_bank_jago)) {
    return { error: "Saldo Bank Jago harus berupa angka." };
  }

  const supabase = await createClient();

  // mutasi_tercatat_di_app SENGAJA tidak dikirim dari sini — trigger DB
  // (set_mutasi_tercatat_di_app) yang mengisinya dari saldo_kas_per_tanggal(),
  // supaya tidak bisa dimanipulasi lewat form.
  const { error } = await supabase.from("bank_reconciliation").insert({
    tanggal,
    mutasi_bank_jago,
    bukti_url: String(formData.get("bukti_url") ?? "").trim() || null,
    catatan: String(formData.get("catatan") ?? "").trim() || null,
  });

  if (error) return { error: `Gagal menyimpan: ${error.message}` };

  revalidatePath("/rekonsiliasi");
  redirect("/rekonsiliasi");
}
