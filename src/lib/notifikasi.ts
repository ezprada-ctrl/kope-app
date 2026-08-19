import type { NotifTipe } from "@/types/database";
import { KAS_KATEGORI_LABEL } from "@/lib/kas";
import type { CashKategori } from "@/types/database";

export const NOTIF_TIPE_LABEL: Record<NotifTipe, string> = {
  kas_masuk: "Kas masuk",
  kas_keluar: "Kas keluar",
  rekonsiliasi_selisih: "Selisih rekonsiliasi",
};

export const NOTIF_TIPE_TONE: Record<NotifTipe, string> = {
  kas_masuk: "border-emerald-900 bg-emerald-950/60 text-emerald-300",
  kas_keluar: "border-amber-900 bg-amber-950/60 text-amber-300",
  rekonsiliasi_selisih: "border-red-900 bg-red-950/60 text-red-300",
};

/** Label kategori kas untuk notifikasi, jatuh ke teks mentah kalau tidak dikenal. */
export function labelKategoriNotif(kategori: string | null): string | null {
  if (!kategori) return null;
  return KAS_KATEGORI_LABEL[kategori as CashKategori] ?? kategori;
}
