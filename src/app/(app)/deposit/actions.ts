"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { CancellationPayer, CancellationStatus } from "@/types/database";

export type FormState = { error?: string } | null;

const PAYER_VALID: CancellationPayer[] = ["buyer", "seller"];

export async function catatDeposit(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await requireProfile();
  if (profile.role !== "admin") {
    return { error: "Hanya admin yang bisa mencatat deposit." };
  }

  const unit_id = String(formData.get("unit_id") ?? "").trim();
  const dibayar_oleh = String(formData.get("dibayar_oleh") ?? "") as CancellationPayer;

  if (!unit_id) return { error: "Unit wajib dipilih." };
  if (!PAYER_VALID.includes(dibayar_oleh)) {
    return { error: "Pihak pembayar tidak valid." };
  }

  const jumlah = Number(
    String(formData.get("jumlah") ?? "").replace(/[^\d.-]/g, ""),
  );
  if (!Number.isFinite(jumlah) || jumlah <= 0) {
    return { error: "Jumlah deposit harus lebih besar dari nol." };
  }

  const tanggal = String(formData.get("tanggal") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.from("cancellation_deposits").insert({
    unit_id,
    dibayar_oleh,
    jumlah,
    nama_pembayar: String(formData.get("nama_pembayar") ?? "").trim() || null,
    tanggal:
      tanggal === "" ? new Date().toISOString() : new Date(tanggal).toISOString(),
    bukti_url: String(formData.get("bukti_url") ?? "").trim() || null,
    catatan: String(formData.get("catatan") ?? "").trim() || null,
  });

  if (error) return { error: `Gagal menyimpan: ${error.message}` };

  // Trigger DB mencatat kas masuk. Kalau nanti deal jadi, nilai ini
  // dipotong dari pelunasan supaya tidak terhitung dua kali.
  revalidatePath("/deposit");
  revalidatePath("/kas");
  redirect("/deposit");
}

/** Admin menandai deal jadi (deposit masuk harga) atau batal (deposit hangus). */
export async function resolveDeposit(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await requireProfile();
  if (profile.role !== "admin") {
    return { error: "Hanya admin yang bisa menyelesaikan deposit." };
  }

  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "") as CancellationStatus;

  if (!id) return { error: "Deposit tidak ditemukan." };
  if (status !== "applied_to_transaction" && status !== "forfeited_as_revenue") {
    return { error: "Status resolve tidak valid." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_deposit", {
    p_deposit_id: id,
    p_status: status,
  });

  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };

  revalidatePath("/deposit");
  revalidatePath("/kas");
  return null;
}
