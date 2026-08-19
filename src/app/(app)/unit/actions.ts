"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  BUTUH_HARGA_JUAL,
  bolehTransisi,
  UNIT_STATUS_LABEL,
} from "@/lib/unit-status";
import type { UnitStatus, UnitTipe } from "@/types/database";

export type FormState = { error?: string } | null;

const TIPE_VALID: UnitTipe[] = ["baru", "bekas"];

/** Ambil angka rupiah dari FormData. String kosong dianggap 0 (atau null). */
function angka(formData: FormData, key: string): number;
function angka(formData: FormData, key: string, kosongJadiNull: true): number | null;
function angka(
  formData: FormData,
  key: string,
  kosongJadiNull = false,
): number | null {
  const raw = String(formData.get(key) ?? "").replace(/[^\d.-]/g, "");
  if (raw === "") return kosongJadiNull ? null : 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : kosongJadiNull ? null : 0;
}

function teks(formData: FormData, key: string) {
  const v = String(formData.get(key) ?? "").trim();
  return v === "" ? null : v;
}

/** Field yang sama-sama dipakai form tambah & edit. */
function bacaFormUnit(formData: FormData) {
  const tipe = String(formData.get("tipe") ?? "") as UnitTipe;
  const model = String(formData.get("model") ?? "").trim();

  if (!TIPE_VALID.includes(tipe)) return { error: "Tipe unit tidak valid." };
  if (!model) return { error: "Model wajib diisi." };

  const nilai = {
    tipe,
    model,
    kondisi: teks(formData, "kondisi"),
    imei: teks(formData, "imei"),
    kode: teks(formData, "kode"),
    pemodal_id: teks(formData, "pemodal_id"),
    harga_beli: angka(formData, "harga_beli"),
    biaya_kurir_ambil: angka(formData, "biaya_kurir_ambil"),
    biaya_refurbish: angka(formData, "biaya_refurbish"),
    harga_jual: angka(formData, "harga_jual", true),
    biaya_kurir_antar: angka(formData, "biaya_kurir_antar"),
    biaya_admin_packing: angka(formData, "biaya_admin_packing"),
    tanggal_beli: teks(formData, "tanggal_beli"),
    tanggal_jual: teks(formData, "tanggal_jual"),
    catatan: teks(formData, "catatan"),
  };

  const negatif = (
    [
      ["harga_beli", nilai.harga_beli],
      ["biaya_kurir_ambil", nilai.biaya_kurir_ambil],
      ["biaya_refurbish", nilai.biaya_refurbish],
      ["biaya_kurir_antar", nilai.biaya_kurir_antar],
      ["biaya_admin_packing", nilai.biaya_admin_packing],
      ["harga_jual", nilai.harga_jual ?? 0],
    ] as const
  ).find(([, v]) => v < 0);

  if (negatif) return { error: `Nilai ${negatif[0]} tidak boleh negatif.` };

  return { nilai };
}

export async function tambahUnit(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await requireProfile();
  if (profile.role !== "admin") return { error: "Hanya admin yang bisa input unit." };

  const hasil = bacaFormUnit(formData);
  if ("error" in hasil) return { error: hasil.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("units")
    .insert({ ...hasil.nilai, status: "sourced" })
    .select("id")
    .single();

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Kode unit sudah dipakai unit lain."
          : `Gagal menyimpan: ${error.message}`,
    };
  }

  revalidatePath("/unit");
  redirect(`/unit/${data.id}`);
}

export async function ubahUnit(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await requireProfile();
  if (profile.role !== "admin") return { error: "Hanya admin yang bisa mengubah unit." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Unit tidak ditemukan." };

  const hasil = bacaFormUnit(formData);
  if ("error" in hasil) return { error: hasil.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("units")
    .update(hasil.nilai)
    .eq("id", id);

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Kode unit sudah dipakai unit lain."
          : `Gagal menyimpan: ${error.message}`,
    };
  }

  revalidatePath("/unit");
  revalidatePath(`/unit/${id}`);
  redirect(`/unit/${id}`);
}

/**
 * Pindah status sesuai state machine (section 4 spec).
 * Validasi transisi dilakukan di sini; RLS di DB tetap jadi penjaga terakhir
 * kalau ada yang coba nembak langsung ke PostgREST.
 */
export async function ubahStatusUnit(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await requireProfile();
  if (profile.role !== "admin") return { error: "Hanya admin yang bisa mengubah status." };

  const id = String(formData.get("id") ?? "");
  const tujuan = String(formData.get("status") ?? "") as UnitStatus;
  if (!id || !tujuan) return { error: "Data transisi tidak lengkap." };

  const supabase = await createClient();
  const { data: unit, error: errAmbil } = await supabase
    .from("units")
    .select("id, status, harga_jual, tanggal_jual")
    .eq("id", id)
    .single();

  if (errAmbil || !unit) return { error: "Unit tidak ditemukan." };

  if (!bolehTransisi(unit.status, tujuan)) {
    return {
      error: `Tidak bisa pindah dari "${UNIT_STATUS_LABEL[unit.status]}" ke "${UNIT_STATUS_LABEL[tujuan]}".`,
    };
  }

  if (BUTUH_HARGA_JUAL.includes(tujuan) && unit.harga_jual === null) {
    return {
      error: `Harga jual wajib diisi dulu sebelum unit ditandai "${UNIT_STATUS_LABEL[tujuan]}".`,
    };
  }

  // Settle punya efek samping uang (return of capital), jadi dijalankan
  // sebagai satu transaksi di database lewat settle_unit(), bukan update biasa.
  if (tujuan === "settled") {
    const { error } = await supabase.rpc("settle_unit", { p_unit_id: id });
    if (error) return { error: `Gagal men-settle unit: ${error.message}` };

    revalidatePath("/unit");
    revalidatePath(`/unit/${id}`);
    revalidatePath("/modal");
    revalidatePath("/dashboard");
    return null;
  }

  const patch: { status: UnitStatus; tanggal_jual?: string } = {
    status: tujuan,
  };

  if (tujuan === "delivered_paid" && !unit.tanggal_jual) {
    patch.tanggal_jual = new Date().toISOString().slice(0, 10);
  }

  const { error } = await supabase.from("units").update(patch).eq("id", id);
  if (error) return { error: `Gagal mengubah status: ${error.message}` };

  revalidatePath("/unit");
  revalidatePath(`/unit/${id}`);
  return null;
}
