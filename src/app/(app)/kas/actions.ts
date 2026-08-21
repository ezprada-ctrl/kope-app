"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { bolehTulis, requireProfile } from "@/lib/auth";
import { tanggalLokalISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { CashKategori, ExpenseKategori } from "@/types/database";

export type FormState = { error?: string } | null;

const KATEGORI_VALID: ExpenseKategori[] = [
  "admin_fee",
  "platform_fee",
  "marketing",
  "lain_lain",
];

export async function catatPengeluaran(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await requireProfile();
  if (!bolehTulis(profile.role)) {
    return { error: "Hanya super admin yang bisa mencatat biaya operasional." };
  }

  const kategori = String(formData.get("kategori") ?? "") as ExpenseKategori;
  if (!KATEGORI_VALID.includes(kategori)) {
    return { error: "Kategori tidak valid." };
  }

  const jumlah = Number(
    String(formData.get("jumlah") ?? "").replace(/[^\d.-]/g, ""),
  );
  if (!Number.isFinite(jumlah) || jumlah <= 0) {
    return { error: "Jumlah harus lebih besar dari nol." };
  }

  const tanggal = String(formData.get("tanggal") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.from("operational_expenses").insert({
    kategori,
    jumlah,
    tanggal: tanggal === "" ? tanggalLokalISO() : tanggal,
    deskripsi: String(formData.get("deskripsi") ?? "").trim() || null,
    bukti_url: String(formData.get("bukti_url") ?? "").trim() || null,
  });

  if (error) return { error: `Gagal menyimpan: ${error.message}` };

  // Trigger di DB otomatis bikin entry cash_ledger, jadi halaman kas
  // dan ringkasan finansial ikut berubah.
  revalidatePath("/kas");
  revalidatePath("/dashboard/financial-summary");
  redirect("/kas");
}

/**
 * Saldo awal kas: entry pembuka sebelum sistem ini dipakai.
 * Hanya boleh sekali — kalau sudah ada, ditolak.
 */
export async function catatSaldoAwal(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await requireProfile();
  if (!bolehTulis(profile.role)) {
    return { error: "Hanya super admin yang bisa mengatur saldo awal." };
  }

  const jumlah = Number(
    String(formData.get("jumlah") ?? "").replace(/[^\d.-]/g, ""),
  );
  if (!Number.isFinite(jumlah) || jumlah <= 0) {
    return { error: "Saldo awal harus lebih besar dari nol." };
  }

  const tanggal = String(formData.get("tanggal") ?? "").trim();
  const supabase = await createClient();

  const { count } = await supabase
    .from("cash_ledger")
    .select("id", { count: "exact", head: true })
    .eq("kategori", "saldo_awal" satisfies CashKategori);

  if ((count ?? 0) > 0) {
    return {
      error:
        "Saldo awal sudah pernah dicatat. Koreksi dilakukan lewat entry baru, bukan mengubah yang lama.",
    };
  }

  const { error } = await supabase.from("cash_ledger").insert({
    tipe: "in",
    kategori: "saldo_awal",
    jumlah,
    tanggal: tanggal === "" ? new Date().toISOString() : new Date(tanggal).toISOString(),
    deskripsi: "Saldo awal dompet Bank Jago sebelum sistem dipakai",
  });

  if (error) return { error: `Gagal menyimpan: ${error.message}` };

  revalidatePath("/kas");
  revalidatePath("/dashboard/financial-summary");
  redirect("/kas");
}
