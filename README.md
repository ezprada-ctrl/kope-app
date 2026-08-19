# KOPE — Manajemen Keuangan Jual-Beli iPhone

Web app 3-role (admin / owner partner / investor) untuk mencatat siklus unit,
modal investor, bagi hasil, kurir, dan rekonsiliasi bank.

Spec lengkap: [`spek-aplikasi-keuangan-iphone-business.md`](spek-aplikasi-keuangan-iphone-business.md).
Rencana kerja per fase: [`claude-code-starter-prompt.md`](claude-code-starter-prompt.md).

## Stack

- Next.js 16 (App Router, Turbopack) + React 19 + Tailwind CSS 4
- Supabase (Postgres + Auth), akses lewat `@supabase/ssr`
- Target hosting: Vercel (frontend) + Supabase (backend), tier gratis

## Menjalankan lokal

```bash
npm run dev
```

Butuh `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
```

Publishable key aman ditaruh di browser **karena** RLS aktif di semua tabel.
Secret key (`sb_secret_…`) tidak dipakai app ini dan tidak boleh masuk repo.

## Database

Migrasi ada di [`supabase/migrations/`](supabase/migrations) dan **sudah
diterapkan** ke project Supabase `gzhlbikjmzwqsrnqpthr` (org KOPE):

| File | Isi |
|---|---|
| `0001_enums_and_helpers.sql` | Enum, tabel `profiles`, trigger auto-profile saat signup, helper RLS (`is_admin()`, dst.) |
| `0002_core_tables.sql` | 12 tabel inti + kolom computed (`hpp_total`, `margin`, `fee_net_kurir`, `selisih`) |
| `0003_audit_and_immutability.sql` | `audit_log` append-only + trigger audit & anti hard-delete |
| `0004_rls.sql` | 38 policy RLS untuk 3 role |
| `0005_views_and_seed.sql` | View outstanding & plafon, seed 60% investor + plafon 300jt |
| `0006_capital_call_dan_settle.sql` | Trigger plafon capital call + `settle_unit()` (status + return of capital dalam satu transaksi) |
| `0007_profit_split.sql` | `settle_unit()` diperluas: hitung `profit_split` + catat bagi hasil, plus view `v_profit_ringkasan` |
| `0008_cash_ledger.sql` | `cash_ledger` (single source of truth kas) + `operational_expenses` + trigger dari 5 tabel sumber, view `v_financial_summary`, fungsi `laba_rugi_periode()` |
| `0009_kurir_dan_deposit.sql` | Perbaikan double-count deposit vs harga jual, `resolve_deposit()`, view kurir & deposit |
| `0010_rekonsiliasi_dan_notifikasi.sql` | Trigger `mutasi_tercatat_di_app` dipaksa dari kas (bukan input manual), tabel `notifications` + fan-out otomatis dari `cash_ledger`/`bank_reconciliation` |
| `0011_refund_readiness.sql` | Kategori kas `refund_out`, kolom `bukti_url` + timestamp status di `refunds` |

Menerapkan ulang di project lain: jalankan berurutan lewat Supabase SQL Editor
atau `supabase db push`.

### Aturan yang dipaksakan di level database

- **Tidak ada hard-delete.** Trigger `block_hard_delete()` menolak `DELETE` di
  semua tabel finansial — koreksi dilakukan lewat entry baru yang menunjuk
  entry asal (`koreksi_dari_id`).
- **`audit_log` immutable.** `UPDATE`/`DELETE` di tabel itu ditolak trigger.
- **Uang selalu `numeric(18,2)`**, tidak pernah `float`.
- **RLS ketat.** Investor hanya bisa membaca unit yang dia danai; partner
  read-only; hanya admin yang bisa insert/update.
- **Plafon capital call ditegakkan trigger**, bukan hanya dicek di UI.
  `outstanding + capital_call_baru <= plafon_aktif`, diserialkan dengan
  advisory lock per investor supaya dua request bersamaan tidak bisa menembus.
- **Settle unit lewat `settle_unit()`**, bukan update status biasa — supaya
  perubahan status, profit split, bagi hasil, dan pengembalian modal investor
  terjadi dalam satu transaksi. Unit yang sudah settled ditolak kalau di-settle
  ulang.
- **Pembulatan bagi hasil tidak boleh menghilangkan rupiah.** Hanya bagian
  pertama tiap pembagian yang dibulatkan; sisanya dihitung sebagai pengurangan,
  sehingga `investor + admin + partner` selalu sama persis dengan margin.
- **Perubahan skema bagi hasil tidak retroaktif.** `profit_share_settings`
  append-only, dan tiap `profit_split` menyimpan `profit_share_setting_id` yang
  berlaku saat unit di-settle.
- **Kas bisnis hanya boleh ditulis lewat trigger.** Entry `cash_ledger` dibuat
  otomatis dari tabel sumber (investor_ledger, units, courier_transactions,
  cancellation_deposits, operational_expenses) — jangan pernah mencatatnya
  manual, karena itu bikin double-count.
- **Saldo kas bukan kolom tersimpan.** Dihitung window function di
  `v_cash_ledger_running`, diurutkan `(tanggal, urutan)`. Kolom running balance
  yang disimpan akan diam-diam salah begitu ada entry backdated atau koreksi.
- **Deposit yang dipakai jadi cicilan harga tidak boleh dihitung dua kali.**
  Saat unit jadi `delivered_paid`, kas masuk dicatat sebesar
  `harga_jual − deposit yang sudah diterima` (lihat `deposit_diterima_unit()`).
  Deposit yang hangus tidak dipotong — itu revenue tersendiri.
- **`mutasi_tercatat_di_app` tidak bisa diisi manual.** Trigger
  `set_mutasi_tercatat_di_app()` selalu menimpanya dengan
  `saldo_kas_per_tanggal()` — kalau boleh diketik admin, rekonsiliasi jadi
  membandingkan bank terhadap angka yang bisa keliru, persis masalah yang mau
  dicegah.
- **Notifikasi fan-out ke semua user aktif** tiap ada entry `cash_ledger`
  baru (admin, partner, investor — bukan cuma yang terkait) — ini realisasi
  "transparansi radikal" di spec: partner & investor tidak punya akses
  transfer, tapi tahu persis tiap kali uang bisnis bergerak.

## Refund — struktur siap, flow belum aktif

Tabel `refunds` sengaja belum punya alur jalan. Untuk mengaktifkannya nanti
dibutuhkan tiga hal, dan ketiganya keputusan bisnis, bukan sekadar coding:

1. **Trigger kas** `refunds` → `cash_ledger` kategori `refund_out` saat status
   jadi `completed`. Kategorinya sudah ada, triggernya belum dibuat.
2. **Jalur transisi unit** ke `refunded` / `partial_refund`. Kedua status ada di
   enum tapi `TRANSISI` di `src/lib/unit-status.ts` sengaja dikosongkan, jadi
   tidak ada jalan masuk dari UI.
3. **Perlakuan unit yang sudah settled.** `profit_split` punya `unique(unit_id)`
   sehingga bagi hasil tidak bisa dihitung ulang. Membalik profit yang sudah
   dibagi butuh mekanisme koreksi tersendiri — perlu diputuskan dulu apakah
   koreksi dicatat sebagai entry baru bertanda negatif, atau lewat tabel
   pembalik terpisah.

## Membuat user

1. Supabase Dashboard → Authentication → Users → tambah user.
2. Trigger `on_auth_user_created` otomatis membuat baris `profiles` dengan role
   default `investor`.
3. Set role yang benar:

```sql
update public.profiles set role = 'admin' where email = 'email@contoh.com';
```

Role yang valid: `admin`, `owner_partner`, `investor`.

## Status per fase

- [x] **Fase 1** — skema DB, RLS 3 role, audit log, auth + shell dashboard
- [x] **Fase 2** — state machine unit, form input/edit, daftar + detail unit
- [x] **Fase 3** — investor ledger, capital call + penegakan plafon, return of capital otomatis
- [x] **Fase 4** — profit split engine, menu ubah porsi investor, riwayat keuntungan per role
- [x] **Fase 3.5** — kas bisnis terpusat (`cash_ledger`), biaya operasional, ringkasan finansial
- [x] **Fase 5** — CRUD kurir, transaksi kurir, flow deposit pembatalan
- [x] **Fase 6** — rekonsiliasi bank (saldo app dipaksa dari `cash_ledger`) + notifikasi in-app
- [x] **Fase 7** — struktur refund diaudit & dilengkapi (flow sengaja belum diaktifkan)
