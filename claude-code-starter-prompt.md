# Prompt Starter untuk Claude Code

Paste teks di bawah ini ke Claude Code sebagai instruksi awal. Lampirkan juga file `spek-aplikasi-keuangan-iphone-business.md` di project directory supaya Claude Code bisa reference full spec-nya.

---

## PROMPT:

Gue mau bangun aplikasi manajemen keuangan untuk bisnis jual-beli iPhone (baru & bekas). Spec lengkap ada di file `spek-aplikasi-keuangan-iphone-business.md` — baca itu dulu sebelum mulai coding.

### Tech Stack
- Backend/DB: Supabase (Postgres + Auth + Storage + Edge Functions)
- Frontend: Next.js (App Router) + Tailwind CSS
- Hosting: Vercel (frontend), Supabase (backend) — semua di tier gratis dulu
- Bot (fase 2, belum sekarang): Telegram Bot API + Supabase Edge Function webhook

### Urutan Kerja yang Gue Mau

**Fase 1 — Foundation (mulai dari sini)**
1. Setup project Next.js + Supabase, termasuk Supabase Auth dengan 3 role: `admin`, `owner_partner`, `investor`.
2. Buat semua tabel sesuai skema di section 3 spec: `units`, `investor_ledger`, `courier_master`, `courier_transactions`, `cancellation_deposits`, `refunds`, `profit_share_settings`, `profit_split`, `loss_allocation`, `bank_reconciliation`, `audit_log`.
3. Implementasikan Row Level Security (RLS) Supabase sesuai tabel role & akses di section 2 — admin full akses, partner & investor view-only dengan scope masing-masing (investor cuma lihat unit yang dia danai + agregat).
4. Setup audit log trigger otomatis di semua tabel finansial (immutable, no hard delete — semua koreksi jadi entry baru yang tertaut ke entry asal).

**Fase 2 — Core Flow: Siklus Unit**
1. Implementasikan state machine unit sesuai section 4 (`sourced → paid_to_seller → in_stock → sold_pending_delivery → delivered_paid → settled`, plus cabang `cancelled_forfeited`).
2. Form input unit baru (admin only) — auto-compute `hpp_total` dan `margin` sesuai formula di section 3.
3. Halaman detail unit yang nunjukkin full breakdown biaya (harga beli, kurir ambil, refurbish, kurir antar, admin/packing) — visible untuk admin & partner (HPP+margin), investor cuma untuk unit yang dia danai.

**Fase 3 — Investor Ledger & Capital Call**
1. Form capital call (admin request dana ke investor untuk unit tertentu atau kas pool).
2. Logic validasi: `outstanding + capital_call_baru <= plafon_aktif` (plafon default 300jt, adjustable).
3. Dashboard outstanding balance real-time untuk investor.
4. Return of capital flow — ketika unit settled, otomatis catat pengembalian modal.

**Fase 4 — Profit Split Engine**
1. Implementasikan `profit_share_settings` — menu admin untuk ubah `investor_percentage` kapanpun (default 60%, immediate effect untuk unit yang settled setelahnya).
2. Auto-compute `profit_split` saat unit di-mark settled, sesuai formula section 3: `investor_profit = margin_bruto * investor_percentage`, sisanya dibagi 20% admin / 80% partner.
3. Dashboard ringkasan profit per role (admin, partner, investor masing-masing lihat riwayat keuntungan mereka).

**Fase 5 — Kurir & Cancellation**
1. CRUD `courier_master` (siap nambah kurir walau sekarang cuma 1 aktif).
2. Form `courier_transactions` — pisahkan `fee_gross`, `reimbursement_bensin`, auto-compute `fee_net_kurir`.
3. Flow `cancellation_deposits` — charge 75k (variable) di depan, admin yang mark status `applied_to_transaction` (deal jadi, masuk ke harga transaksi) atau `forfeited_as_revenue` (batal, kurir tetap dibayar dari situ, selisih jadi revenue bisnis).

**Fase 6 — Bank Reconciliation**
1. Halaman rekonsiliasi manual — admin input/upload mutasi Bank Jago (screenshot atau manual entry), sistem bandingkan dengan `mutasi_tercatat_di_app`, flag otomatis kalau ada selisih (jangan silent fail).
2. Notifikasi (bisa mulai dengan in-app notification dulu, email/Telegram belakangan) ke admin, partner, investor setiap ada transaksi masuk/keluar dompet bisnis.

**Fase 7 — Refund Infra (siapkan struktur, belum perlu UI lengkap)**
1. Tabel `refunds` sudah ada dari Fase 1, tapi belum perlu UI/flow lengkap — cukup pastikan struktur tabel siap dipakai nanti.

### Constraint Penting
- **Jangan pernah hard-delete** data finansial apapun — semua harus lewat audit_log dan entry koreksi.
- **RLS harus ketat** — investor TIDAK BOLEH bisa lihat unit yang bukan dia danai, partner TIDAK BOLEH bisa edit apapun.
- Semua angka uang pakai tipe data yang presisi (jangan float biasa — pakai `numeric` di Postgres untuk hindari rounding error).
- Mobile-responsive — admin kemungkinan input dari HP saat lagi COD.

### Yang Belum Perlu Dikerjakan Sekarang
- Telegram bot (command-based) — infrastruktur boleh disiapkan tapi implementasi nanti setelah web app stabil.
- Multi-investor pooling logic (`loss_allocation`) — tabel siapkan tapi logic aktifnya nanti kalau investor kedua masuk.

Mulai dari Fase 1. Setelah tiap fase selesai, kasih gue summary singkat apa yang udah dibuat sebelum lanjut ke fase berikutnya, biar gue bisa review dan test dulu.
