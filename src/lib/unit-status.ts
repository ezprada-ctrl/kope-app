import type { UnitStatus } from "@/types/database";

export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  sourced: "Sourced",
  paid_to_seller: "Dibayar ke penjual",
  in_stock: "Di stok",
  sold_pending_delivery: "Deal, menunggu antar",
  delivered_paid: "Terkirim & dibayar",
  settled: "Settled",
  refunded: "Refund penuh",
  partial_refund: "Refund sebagian",
  cancelled_forfeited: "Batal (deposit hangus)",
};

/** Keterangan singkat untuk ditampilkan di UI biar admin nggak salah pilih. */
export const UNIT_STATUS_KETERANGAN: Record<UnitStatus, string> = {
  sourced: "Unit sudah ditemukan, belum dibayar.",
  paid_to_seller: "Dana sudah ditransfer ke penjual.",
  in_stock: "QC lolos, unit ada di tangan dan siap dijual.",
  sold_pending_delivery: "Buyer sudah deal, deposit dibayar di depan.",
  delivered_paid: "COD sukses, uang masuk dompet Jago.",
  settled: "Profit split dieksekusi, modal investor dikembalikan.",
  refunded: "Transaksi di-refund penuh.",
  partial_refund: "Sebagian dana dikembalikan ke buyer.",
  cancelled_forfeited: "Buyer batal, kurir tetap dibayar dari deposit.",
};

export const UNIT_STATUS_TONE: Record<UnitStatus, string> = {
  sourced: "border-neutral-700 bg-neutral-800/60 text-neutral-300",
  paid_to_seller: "border-sky-900 bg-sky-950/60 text-sky-300",
  in_stock: "border-indigo-900 bg-indigo-950/60 text-indigo-300",
  sold_pending_delivery: "border-amber-900 bg-amber-950/60 text-amber-300",
  delivered_paid: "border-emerald-900 bg-emerald-950/60 text-emerald-300",
  settled: "border-emerald-700 bg-emerald-900/60 text-emerald-200",
  refunded: "border-red-900 bg-red-950/60 text-red-300",
  partial_refund: "border-red-900 bg-red-950/60 text-red-300",
  cancelled_forfeited: "border-red-900 bg-red-950/60 text-red-300",
};

/** Jalur normal siklus unit (section 4 spec) — dipakai untuk stepper. */
export const ALUR_UTAMA: UnitStatus[] = [
  "sourced",
  "paid_to_seller",
  "in_stock",
  "sold_pending_delivery",
  "delivered_paid",
  "settled",
];

/**
 * Transisi yang diizinkan. Maju saja — tidak ada mundur.
 * Salah input status diperbaiki lewat edit unit + jejaknya tetap di audit_log,
 * bukan dengan memundurkan state machine.
 *
 * `refunded` & `partial_refund` sengaja belum punya jalur masuk: infrastruktur
 * tabelnya sudah siap (Fase 7) tapi flow-nya belum diaktifkan.
 */
export const TRANSISI: Record<UnitStatus, UnitStatus[]> = {
  sourced: ["paid_to_seller"],
  paid_to_seller: ["in_stock"],
  in_stock: ["sold_pending_delivery"],
  sold_pending_delivery: ["delivered_paid", "cancelled_forfeited"],
  delivered_paid: ["settled"],
  settled: [],
  refunded: [],
  partial_refund: [],
  cancelled_forfeited: [],
};

export function transisiBerikutnya(dari: UnitStatus): UnitStatus[] {
  return TRANSISI[dari] ?? [];
}

export function bolehTransisi(dari: UnitStatus, ke: UnitStatus): boolean {
  return transisiBerikutnya(dari).includes(ke);
}

/** Status yang mewajibkan harga jual sudah terisi sebelum bisa dimasuki. */
export const BUTUH_HARGA_JUAL: UnitStatus[] = ["delivered_paid", "settled"];

export function statusFinal(status: UnitStatus): boolean {
  return transisiBerikutnya(status).length === 0;
}
