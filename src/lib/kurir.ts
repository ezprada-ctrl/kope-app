import type {
  CancellationPayer,
  CancellationStatus,
  CourierTxStatus,
  CourierTxTipe,
} from "@/types/database";

export const COURIER_TIPE_LABEL: Record<CourierTxTipe, string> = {
  ambil_barang: "Ambil barang",
  antar_barang: "Antar barang",
};

export const COURIER_STATUS_LABEL: Record<CourierTxStatus, string> = {
  pending: "Pending",
  selesai: "Selesai",
  batal_forfeited: "Batal (deposit hangus)",
};

export const COURIER_STATUS_TONE: Record<CourierTxStatus, string> = {
  pending: "border-amber-900 bg-amber-950/60 text-amber-300",
  selesai: "border-emerald-900 bg-emerald-950/60 text-emerald-300",
  batal_forfeited: "border-red-900 bg-red-950/60 text-red-300",
};

export const DEPOSIT_STATUS_LABEL: Record<CancellationStatus, string> = {
  pending: "Menunggu keputusan",
  applied_to_transaction: "Masuk harga transaksi",
  forfeited_as_revenue: "Hangus jadi revenue",
};

export const DEPOSIT_STATUS_TONE: Record<CancellationStatus, string> = {
  pending: "border-amber-900 bg-amber-950/60 text-amber-300",
  applied_to_transaction: "border-emerald-900 bg-emerald-950/60 text-emerald-300",
  forfeited_as_revenue: "border-sky-900 bg-sky-950/60 text-sky-300",
};

export const PAYER_LABEL: Record<CancellationPayer, string> = {
  buyer: "Buyer",
  seller: "Penjual",
};

/** Nominal deposit standar. Bisa diubah per transaksi. */
export const DEPOSIT_DEFAULT = 75000;
