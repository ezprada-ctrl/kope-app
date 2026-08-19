"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { LedgerTipe } from "@/types/database";

export type FormState = { error?: string } | null;

/** Tipe yang boleh diinput manual. `profit_share` dibuat otomatis (Fase 4). */
const TIPE_MANUAL: LedgerTipe[] = ["capital_call", "return_of_capital"];

export async function catatLedger(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await requireProfile();
  if (profile.role !== "admin") {
    return { error: "Hanya admin yang bisa mencatat pergerakan modal." };
  }

  const investor_id = String(formData.get("investor_id") ?? "");
  const tipe = String(formData.get("tipe") ?? "") as LedgerTipe;
  const jumlahRaw = String(formData.get("jumlah") ?? "").replace(/[^\d.-]/g, "");
  const unitRaw = String(formData.get("unit_id") ?? "").trim();
  const tanggal = String(formData.get("tanggal") ?? "").trim();

  if (!investor_id) return { error: "Investor wajib dipilih." };
  if (!TIPE_MANUAL.includes(tipe)) return { error: "Tipe transaksi tidak valid." };

  const jumlah = Number(jumlahRaw);
  if (!Number.isFinite(jumlah) || jumlah <= 0) {
    return { error: "Jumlah harus lebih besar dari nol." };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("investor_ledger").insert({
    investor_id,
    tipe,
    jumlah,
    unit_id: unitRaw === "" ? null : unitRaw,
    tanggal: tanggal === "" ? new Date().toISOString() : new Date(tanggal).toISOString(),
    bukti_transfer_url:
      String(formData.get("bukti_transfer_url") ?? "").trim() || null,
    catatan: String(formData.get("catatan") ?? "").trim() || null,
  });

  if (error) {
    // Trigger cek_plafon_capital_call() melempar check_violation dengan pesan
    // yang sudah manusiawi — teruskan apa adanya.
    if (error.code === "23514" || error.message.includes("plafon")) {
      return { error: error.message.replace(/^.*?:\s*/, "") };
    }
    return { error: `Gagal menyimpan: ${error.message}` };
  }

  revalidatePath("/modal");
  revalidatePath("/dashboard");
  redirect("/modal");
}
