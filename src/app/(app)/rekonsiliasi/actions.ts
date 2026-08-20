"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { bolehTulis, requirePenulis, requireProfile } from "@/lib/auth";
import { cariSaldoPadaTanggal, parseMutasiJagoPdf } from "@/lib/parse-mutasi-jago";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string } | null;

export type EkstrakSaldoState =
  | { status: "ok"; saldo: number; tanggalLabel: string; waktuLabel: string | null }
  | { status: "error"; error: string }
  | null;

/**
 * Baca PDF "Pockets Transactions History" yang diupload admin, ambil saldo
 * berjalan dari transaksi terakhir pada/sebelum tanggal rekonsiliasi yang
 * dipilih. Hasilnya cuma buat prefill form — tidak menulis apa pun ke DB,
 * admin tetap harus cek & klik "Catat rekonsiliasi" sendiri.
 */
export async function ekstrakSaldoDariPdf(
  _prev: EkstrakSaldoState,
  formData: FormData,
): Promise<EkstrakSaldoState> {
  await requirePenulis();

  const tanggal = String(formData.get("tanggal") ?? "").trim();
  if (!tanggal) {
    return { status: "error", error: "Pilih tanggal saldo dulu sebelum upload PDF." };
  }

  const file = formData.get("pdf");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", error: "File PDF tidak ditemukan." };
  }
  if (file.type && file.type !== "application/pdf") {
    return { status: "error", error: "File harus berupa PDF." };
  }

  let records;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    records = await parseMutasiJagoPdf(bytes);
  } catch {
    return {
      status: "error",
      error: "Gagal membaca PDF — pastikan ini file mutasi asli dari app Jago.",
    };
  }

  const hasil = cariSaldoPadaTanggal(records, tanggal);
  if (!hasil) {
    return {
      status: "error",
      error: "Tidak ada transaksi pada/sebelum tanggal ini di dalam PDF. Isi manual.",
    };
  }

  return {
    status: "ok",
    saldo: hasil.balance,
    tanggalLabel: hasil.tanggalLabel,
    waktuLabel: hasil.waktuLabel,
  };
}

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
