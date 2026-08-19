"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { bolehTulis, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CourierTxStatus, CourierTxTipe } from "@/types/database";

export type FormState = { error?: string } | null;

const TIPE_VALID: CourierTxTipe[] = ["ambil_barang", "antar_barang"];
const STATUS_VALID: CourierTxStatus[] = ["pending", "selesai", "batal_forfeited"];

function angka(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").replace(/[^\d.-]/g, "");
  if (raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

async function pastikanAdmin() {
  const profile = await requireProfile();
  return bolehTulis(profile.role);
}

// ---------------------------------------------------------------- kurir

export async function simpanKurir(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await pastikanAdmin())) {
    return { error: "Hanya super admin yang bisa mengelola kurir." };
  }

  const nama = String(formData.get("nama") ?? "").trim();
  if (!nama) return { error: "Nama kurir wajib diisi." };

  const id = String(formData.get("id") ?? "").trim();
  const nilai = {
    nama,
    kontak: String(formData.get("kontak") ?? "").trim() || null,
    aktif: formData.get("aktif") === "on",
    catatan: String(formData.get("catatan") ?? "").trim() || null,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("courier_master").update(nilai).eq("id", id)
    : await supabase.from("courier_master").insert({
        ...nilai,
        tanggal_bergabung:
          String(formData.get("tanggal_bergabung") ?? "").trim() ||
          new Date().toISOString().slice(0, 10),
      });

  if (error) return { error: `Gagal menyimpan: ${error.message}` };

  revalidatePath("/kurir");
  redirect("/kurir");
}

// ---------------------------------------------------- transaksi kurir

export async function simpanTransaksiKurir(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await pastikanAdmin())) {
    return { error: "Hanya super admin yang bisa mencatat transaksi kurir." };
  }

  const courier_id = String(formData.get("courier_id") ?? "").trim();
  const tipe = String(formData.get("tipe") ?? "") as CourierTxTipe;
  const status = String(formData.get("status") ?? "") as CourierTxStatus;

  if (!courier_id) return { error: "Kurir wajib dipilih." };
  if (!TIPE_VALID.includes(tipe)) return { error: "Tipe transaksi tidak valid." };
  if (!STATUS_VALID.includes(status)) return { error: "Status tidak valid." };

  const fee_gross = angka(formData, "fee_gross");
  const reimbursement_bensin = angka(formData, "reimbursement_bensin");
  const charge_ke_pihak_lain = angka(formData, "charge_ke_pihak_lain");

  if (fee_gross < 0 || reimbursement_bensin < 0 || charge_ke_pihak_lain < 0) {
    return { error: "Nilai tidak boleh negatif." };
  }
  if (fee_gross === 0 && reimbursement_bensin === 0) {
    return { error: "Fee kurir tidak boleh nol semua." };
  }

  const unitRaw = String(formData.get("unit_id") ?? "").trim();
  const tanggal = String(formData.get("tanggal") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.from("courier_transactions").insert({
    courier_id,
    unit_id: unitRaw === "" ? null : unitRaw,
    tipe,
    status,
    fee_gross,
    reimbursement_bensin,
    charge_ke_pihak_lain,
    tanggal:
      tanggal === "" ? new Date().toISOString() : new Date(tanggal).toISOString(),
    catatan: String(formData.get("catatan") ?? "").trim() || null,
  });

  if (error) return { error: `Gagal menyimpan: ${error.message}` };

  // Trigger DB otomatis mencatat kas keluar sebesar fee_gross + bensin.
  revalidatePath("/kurir");
  revalidatePath("/kas");
  redirect("/kurir");
}
