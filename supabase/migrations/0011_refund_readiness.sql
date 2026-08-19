-- =====================================================================
-- 0011 — Kesiapan struktur refund (Fase 7)
--
-- Spec: "Tabel refunds sudah ada dari Fase 1, belum perlu UI/flow lengkap —
-- cukup pastikan struktur tabel siap dipakai nanti."
--
-- Audit menemukan tiga celah yang bikin tabel BELUM benar-benar siap. Semua
-- diperbaiki di sini secara aditif; tidak ada flow/UI yang dibangun.
-- =====================================================================

-- ---------------------------------------------------------------------
-- CELAH 1 — kas tidak punya kategori untuk refund.
--
-- Refund memindahkan uang KELUAR dompet Jago, tapi `cash_kategori` tidak
-- punya nilai yang cocok. Tanpa ini, begitu flow refund diaktifkan, uangnya
-- tidak bisa dicatat di cash_ledger sama sekali — dan rekonsiliasi terhadap
-- Bank Jago langsung meleset sebesar nilai refund.
-- ---------------------------------------------------------------------
alter type public.cash_kategori add value if not exists 'refund_out';

-- ---------------------------------------------------------------------
-- CELAH 2 — tidak ada tempat menyimpan bukti transfer.
--
-- Semua tabel finansial lain punya kolom bukti (investor_ledger,
-- cancellation_deposits, operational_expenses, bank_reconciliation).
-- refunds tidak — padahal refund justru uang keluar ke pihak luar, yang
-- paling perlu jejak bukti.
-- ---------------------------------------------------------------------
alter table public.refunds
  add column if not exists bukti_url text;

-- ---------------------------------------------------------------------
-- CELAH 3 — status berubah tanpa jejak kapan.
--
-- `status` punya pending → approved → completed, tapi tidak ada timestamp
-- kapan transisinya terjadi. cancellation_deposits punya tanggal_resolve
-- untuk kebutuhan yang sama; disamakan supaya polanya konsisten.
-- ---------------------------------------------------------------------
alter table public.refunds
  add column if not exists tanggal_approved timestamptz,
  add column if not exists tanggal_completed timestamptz;

comment on table public.refunds is
  'Infrastruktur refund. Struktur siap, flow BELUM diaktifkan.
   Untuk mengaktifkan nanti dibutuhkan: (1) trigger kas refunds -> cash_ledger
   kategori refund_out saat status jadi completed; (2) jalur transisi unit ke
   status refunded/partial_refund di TRANSISI (src/lib/unit-status.ts), yang
   sengaja dikosongkan; (3) keputusan perlakuan unit yang sudah settled —
   profit_split punya unique(unit_id) sehingga tidak bisa dihitung ulang,
   jadi pembalikan bagi hasil butuh mekanisme koreksi tersendiri.';

comment on column public.refunds.koreksi_dari_id is
  'Menunjuk entry refund asal kalau baris ini adalah koreksi. Konsisten dengan larangan hard-delete.';
