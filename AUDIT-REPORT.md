# AUDIT-REPORT — KOPE

Audit read-only terhadap checklist A–K. **Tidak ada kode yang diubah** dalam sesi ini.

- Tanggal audit: 19 Agustus 2026
- Basis kode: commit `ade4bf4` (branch `master`)
- Basis database: project Supabase `gzhlbikjmzwqsrnqpthr` (production), dicek langsung lewat SQL Editor

## Keterbatasan audit — baca ini dulu

1. **`analisis-akad-vs-aplikasi-kope.md` tidak ada.** Prompt menyebut file itu sebagai
   checklist utama, tapi file tersebut tidak ada di repo, tidak ada di working tree,
   dan tidak ada di folder Downloads. Audit ini dijalankan **murni terhadap checklist
   A–K yang tertulis di dalam prompt**. Kalau file analisis itu memuat item atau nuansa
   yang tidak tercermin di checklist, audit ini belum mencakupnya.
2. `spek-aplikasi-keuangan-iphone-business.md` **ada** dan sudah dibaca.
3. Ada dokumen akad tertandatangani di `~/Downloads` (`SIGNED - HALO KOPE AKAD
   MUDHARABAH M. IKRAM_2025-05-07_16.27_signed.pdf`) yang **tidak saya buka** — di luar
   scope audit ini, tapi kemungkinan besar berisi jawaban untuk pertanyaan 1–3 di
   bagian akhir prompt.

## Ringkasan eksekutif

| Status | Jumlah item |
|---|---|
| `[SUDAH]` | 1 |
| `[SEBAGIAN]` | 14 |
| `[BELUM]` | 33 |
| `[BEDA]` | 3 |
| **Total** | **51** |

Tiga hal terpenting dari audit ini:

1. **Tidak ada fondasi akuntansi sama sekali.** Tidak ada `accounts`, tidak ada
   `journal_entries`/`journal_lines`, tidak ada periode akuntansi. Yang ada adalah
   pembukuan **single-entry berbasis kas** (`cash_ledger`) yang dibangun rapi dan
   konsisten — tapi itu bukan double-entry, dan tidak bisa menghasilkan Neraca.
2. **Database produksi masih kosong.** 0 unit, 0 ledger, 0 kas, 0 profit split.
   Artinya **sekarang adalah momen termurah** untuk membongkar fondasi — tidak ada
   satu pun baris data finansial yang perlu dimigrasikan. Detail di bagian akhir.
3. **Dugaan di prompt soal J2 terbukti benar.** Nisbah memang dikunci saat unit
   **di-settle**, bukan saat unit masuk skema. Buktinya ada di bawah.

---

## A. FONDASI AKUNTANSI

| # | Item | Status |
|---|---|---|
| A1 | Chart of Accounts | `[BELUM]` |
| A2 | Jurnal double-entry | `[BELUM]` |
| A3 | Posting otomatis ke jurnal | `[BELUM]` |
| A4 | Periode akuntansi + penguncian | `[BELUM]` |
| A5 | Laporan Neraca | `[BELUM]` |
| A6 | Laporan Laba Rugi | `[SEBAGIAN]` |
| A7 | Laporan Arus Kas | `[SEBAGIAN]` |
| A8 | Akun modal per mitra | `[SEBAGIAN]` |
| A9 | Saldo awal & jurnal penyesuaian | `[SEBAGIAN]` |

**A1–A2 `[BELUM]`** — Tidak ada tabel `accounts`, `journal_entries`, maupun
`journal_lines` di seluruh `supabase/migrations/`. Inventaris lengkap tabel yang ada
(17 buah): `profiles`, `plafon_settings`, `units`, `investor_ledger`, `courier_master`,
`courier_transactions`, `cancellation_deposits`, `refunds`, `profit_share_settings`,
`profit_split`, `loss_allocation`, `loss_allocation_items`, `bank_reconciliation`,
`audit_log`, `cash_ledger`, `operational_expenses`, `notifications`.

**A3 `[BELUM]`, tapi polanya sudah ada** — Tidak ada jurnal, jadi tidak ada posting ke
jurnal. Namun mekanisme *auto-posting dari tabel sumber* **sudah terbukti jalan** untuk
kas: `0008_cash_ledger.sql` punya 5 trigger (`kas_dari_investor_ledger()`,
`kas_dari_units()`, `kas_dari_courier_tx()`, `kas_dari_cancellation()`,
`kas_dari_operational_expense()`) yang menulis ke `cash_ledger` lewat helper
`catat_kas()`. Ini template yang tepat untuk posting jurnal nanti — jangan dibuang.

**A4 `[BELUM]`** — Tidak ada `fiscal_periods`, tidak ada penguncian. Konsekuensi nyata:
tidak ada yang mencegah entry backdated. Ini berbahaya karena `v_cash_ledger_running`
menghitung saldo berjalan dengan window function terurut `(tanggal, urutan)` —
entry backdated akan diam-diam menggeser seluruh saldo berjalan setelahnya.

**A5 `[BELUM]`** — Tidak ada Neraca dan memang belum bisa dibuat: tanpa COA dan jurnal,
sisi aset (terutama nilai persediaan unit yang belum terjual) tidak pernah dihitung.

**A6 `[SEBAGIAN]`** — Ada `laba_rugi_periode(p_mulai date, p_selesai date)` di
`0008_cash_ledger.sql:~L200` dan halaman
[`/dashboard/financial-summary`](src/app/(app)/dashboard/financial-summary/page.tsx).
Yang kurang: rumusnya cuma `sum(profit_split.margin_bruto) − sum(operational_expenses.jumlah)`.
Tidak ada pemisahan pendapatan vs HPP, tidak memasukkan revenue kurir
(`courier_transactions.revenue_bersih_bisnis`) maupun deposit hangus sebagai baris
pendapatan tersendiri, dan hanya menghitung unit yang **sudah settled** — unit yang
terjual tapi belum di-settle tidak muncul di laba rugi periode mana pun.

**A7 `[SEBAGIAN]`** — Ada buku kas berjalan `v_cash_ledger_running` +
`saldo_kas_per_tanggal()` + `saldo_kas_sekarang()` (`0008_cash_ledger.sql`). Yang kurang:
ini buku kas, **bukan** Laporan Arus Kas. Tidak ada klasifikasi operasi / investasi /
pendanaan. `cash_kategori` punya 9 nilai yang sebetulnya sudah setengah jalan ke sana
(`capital_call_in` dan `return_of_capital_out` jelas pendanaan), tapi pengelompokannya
belum pernah dibuat.

**A8 `[SEBAGIAN]`** — Yang sudah ada: modal investor terlacak penuh di `investor_ledger`
(`capital_call` / `return_of_capital` / `profit_share`) dengan view `v_investor_outstanding`
dan `v_investor_ledger_running`; ekuitas admin & partner yang belum ditarik terlacak lewat
`profit_split.payout_status` (`0008_cash_ledger.sql:106`) dan diringkas di
`v_financial_summary`. Yang kurang: tidak ada konsep **prive/penarikan** sebagai entitas
(hanya flag `sudah_ditarik`, tanpa tanggal/nominal/bukti penarikan), tidak ada **laba
ditahan** sebagai akun, dan tidak ada laporan mutasi modal per mitra.

**A9 `[SEBAGIAN]`** — Saldo awal **ada**: `cash_kategori` punya `'saldo_awal'` dan ada
halaman [`/kas/saldo-awal`](src/app/(app)/kas/saldo-awal/page.tsx). Jurnal penyesuaian
`[BELUM]` — tidak ada mekanisme apa pun untuk itu.

---

## B. MASTER DATA

| # | Item | Status |
|---|---|---|
| B1 | Tabel customers | `[BELUM]` |
| B2 | Tabel suppliers | `[BELUM]` |
| B3 | Produk & IMEI/serial tracking | `[SEBAGIAN]` |
| B4 | Attachment universal | `[SEBAGIAN]` |

**B1 & B2 `[BELUM]`** — Tidak ada tabel `customers` maupun `suppliers`. Saat ini pembeli
dan penjual hanya muncul sebagai teks lepas: `cancellation_deposits.nama_pembayar` dan
enum `cancellation_payer` (`'buyer'`/`'seller'`). Konsekuensi: K1 (laba per customer/channel)
mustahil, dan E1/E2 (piutang/hutang) tidak punya tempat bergantung.

**B3 `[SEBAGIAN]`** — `units.imei text` dan `units.model text` ada
(`0002_core_tables.sql:33-35`). Yang kurang: tidak ada master produk (model cuma free
text, rawan "iPhone 13 Pro" vs "iphone 13 pro"), **`imei` tidak punya unique constraint**
sehingga satu IMEI bisa masuk dua kali, dan tidak ada tabel riwayat serial.

**B4 `[SEBAGIAN]`** — Kolom bukti ada di **5 tabel**: `investor_ledger.bukti_transfer_url`,
`cancellation_deposits.bukti_url`, `bank_reconciliation.bukti_url`,
`operational_expenses.bukti_url`, `refunds.bukti_url` (ditambahkan di `0011`).
Yang kurang: **tidak ada** di `units` (padahal ini transaksi beli & jual — nota paling
penting justru tidak punya tempat), tidak ada di `courier_transactions`, tidak ada di
`profit_split`. Selain itu semuanya cuma kolom `text` — tidak ada tabel attachment
generik, tidak ada bucket Supabase Storage yang dikonfigurasi, dan tidak ada validasi
bahwa URL-nya benar-benar ada.

---

## C. PERSEDIAAN

| # | Item | Status |
|---|---|---|
| C1 | Kartu stok per unit/IMEI | `[SEBAGIAN]` |
| C2 | Stock opname + selisih | `[BELUM]` |
| C3 | Aging inventory | `[BELUM]` |
| C4 | Write-down nilai | `[BELUM]` |
| C5 | Stok sendiri vs konsinyasi | `[BELUM]` |

**C1 `[SEBAGIAN]`** — Karena `units` adalah satu baris per unit fisik, riwayat
pergerakannya **secara tidak langsung** terekam: `units.status` + state machine di
[`src/lib/unit-status.ts`](src/lib/unit-status.ts), dan setiap perubahan status tercatat
di `audit_log` lewat trigger `log_audit()`. Yang kurang: tidak ada kartu stok eksplisit,
jadi untuk merekonstruksi pergerakan satu unit harus membongkar `audit_log.perubahan`
(JSON) secara manual. Tidak ada tampilan riwayat unit di UI.

**C2, C3, C4 `[BELUM]`** — Tidak ada opname, tidak ada perhitungan umur stok, tidak ada
mekanisme penurunan nilai. Untuk C3 bahan bakunya sebetulnya sudah ada
(`units.tanggal_beli` + `units.status = 'in_stock'`), tinggal dibuat view-nya.

**C5 `[BELUM]`** — `units.investor_id` menandai **sumber dana**, bukan **kepemilikan
barang**. Keduanya tidak bisa dipakai bergantian. Item ini kembar dengan J6 dan J7.

---

## D. BIAYA & PENDAPATAN

| # | Item | Status |
|---|---|---|
| D1 | Tabel expenses fleksibel | `[SEBAGIAN]` |
| D2 | Beban overhead terpisah dari biaya per-unit | `[SEBAGIAN]` |
| D3 | Whitelist biaya sebelum bagi hasil | `[BELUM]` — *scope Prompt 2* |
| D4 | Plafon per kategori biaya | `[BELUM]` — *scope Prompt 2* |

**D1 `[SEBAGIAN]`** — `operational_expenses` ada (`0008_cash_ledger.sql:82`) dengan
`kategori`, `bukti_url`, `koreksi_dari_id`, `dicatat_oleh`, dan trigger otomatis ke
`cash_ledger`. Yang kurang, tiga hal konkret:
- `expense_kategori` cuma punya **4 nilai**: `admin_fee`, `platform_fee`, `marketing`,
  `lain_lain`. Enum, jadi menambah kategori = migrasi DDL, bukan konfigurasi.
- **Tidak ada `unit_id`** — biaya tidak bisa ditempelkan langsung ke unit tertentu.
- **Tidak ada approver/approval** sama sekali.

**D2 `[SEBAGIAN]`** — Pemisahannya **secara struktur sudah benar**: biaya per-unit hidup
sebagai kolom di `units` (`biaya_kurir_ambil`, `biaya_refurbish`, `biaya_kurir_antar`,
`biaya_admin_packing`) dan ikut masuk `hpp_total`/`margin` sebagai generated column,
sementara biaya periodik hidup di `operational_expenses`. Yang kurang: kategori overhead
yang disebut di checklist (gaji, sewa, listrik) **tidak ada** di enum, dan tidak ada
mekanisme alokasi overhead ke unit.

**D3 `[BELUM]`** — Saat ini biaya yang dipotong sebelum bagi hasil **hardcoded di level
database**, di dalam generated column `units.margin` (`0002_core_tables.sql:55-61`).
Mengubah daftar biaya = mengubah definisi kolom generated. Ini persis yang diminta jadi
konfigurasi. *Sesuai instruksi, tidak dikerjakan sekarang.*

**D4 `[BELUM]`** — Tidak ada. Catatan: pola plafon yang bisa ditiru **sudah ada** dan
matang — `plafon_settings` + trigger `cek_plafon_capital_call()` dengan advisory lock
per investor (`0006`). Struktur yang sama bisa dipakai untuk plafon biaya.

---

## E. AR / AP / KAS

| # | Item | Status |
|---|---|---|
| E1 | Piutang customer + aging | `[BELUM]` |
| E2 | Hutang supplier + aging | `[BELUM]` |
| E3 | Multi kas & bank | `[BELUM]` |
| E4 | Buku kas harian | `[SUDAH]` |

**E1 & E2 `[BELUM]`** — Tidak ada tabel piutang/hutang. Model bisnis saat ini
mengasumsikan COD (`delivered_paid` = "COD sukses, uang masuk dompet Jago"), jadi piutang
tidak pernah dimodelkan. Bergantung pada B1/B2.

**E3 `[BELUM]`** — Ini asumsi yang tertanam dalam-dalam. `cash_ledger`
(`0008_cash_ledger.sql:42`) **tidak punya kolom akun/dompet sama sekali** — tidak ada
`account_id`, tidak ada `bank_id`. Saldo dihitung sebagai `sum(delta)` atas seluruh tabel,
yang secara implisit berarti "satu dompet". Demikian pula `bank_reconciliation` yang
namanya saja sudah mengunci ke satu bank (`mutasi_bank_jago`). Menambah kas kedua
**akan** membuat semua fungsi saldo (`saldo_kas_sekarang()`, `saldo_kas_per_tanggal()`)
salah tanpa peringatan.

**E4 `[SUDAH]`** — `v_cash_ledger_running` (`0008_cash_ledger.sql:280`) dengan running
balance via window function terurut `(tanggal, urutan)`, ditopang
`saldo_kas_per_tanggal()` dan `saldo_kas_sekarang()`, ditampilkan di
[`/kas`](src/app/(app)/kas/page.tsx). Buku kasnya benar dan konsisten — saldo sengaja
tidak disimpan sebagai kolom, jadi entry backdated tidak merusak angka.
*Catatan: keterbatasan "satu dompet" saya hitung sebagai kekurangan E3, bukan E4.*

---

## F. DOKUMEN TRANSAKSI

| # | Item | Status |
|---|---|---|
| F1 | Penomoran dokumen berurutan tanpa lompatan | `[BELUM]` |
| F2 | Surat jalan / qabdh | `[BELUM]` |
| F3 | Cetak/export PDF | `[BELUM]` |

**F1 `[BELUM]`** — Yang ada cuma `units.kode text unique` (`0002_core_tables.sql:31`) yang
diisi manual dan boleh NULL. Tidak ada sequence, tidak ada jaminan tanpa lompatan, dan
tidak ada penomoran untuk dokumen lain (PO, invoice, kwitansi, retur) karena
dokumen-dokumen itu memang belum ada.

**F2 `[BELUM]`** — `courier_transactions` mencatat fee, tipe (`ambil_barang`/`antar_barang`),
dan status, tapi **tidak ada bukti serah terima**: tidak ada tanda tangan, tidak ada foto
terima, bahkan tidak ada kolom `bukti_url`. Untuk kebutuhan qabdh, ini titik terlemah di
seluruh aplikasi.

**F3 `[BELUM]`** — Dikonfirmasi lewat pencarian di seluruh `src/`: tidak ada `jspdf`,
`pdfkit`, `exceljs`, `xlsx`, penanganan CSV, maupun `window.print`. Tidak ada dependency
terkait di `package.json`.

---

## G. RETUR, GARANSI, PEMBATALAN

| # | Item | Status |
|---|---|---|
| G1 | Flow retur berfungsi penuh | `[SEBAGIAN]` |
| G2 | Warranties + claims + provisi | `[BELUM]` |
| G3 | Cancellation deposit: kerugian_riil / ditahan / dikembalikan | `[BELUM]` |

**G1 `[SEBAGIAN]`** — Struktur **ada dan cukup lengkap**: tabel `refunds`
(`0002_core_tables.sql:221`), enum `refund_tipe` & `refund_status`, plus `bukti_url`,
`tanggal_approved`, `tanggal_completed` dari `0011_refund_readiness.sql`. Status
`refunded` dan `partial_refund` ada di enum `unit_status`. Yang membuat flow-nya mati —
tiga penghalang, dan ketiganya **disengaja** serta terdokumentasi di README:
1. `TRANSISI` di [`src/lib/unit-status.ts:70-79`](src/lib/unit-status.ts) memberi
   `refunded: []` dan `partial_refund: []`, dan **tidak ada satu pun status yang menuju
   ke sana** — jadi tidak ada jalan masuk dari UI.
2. Tidak ada trigger `refunds` → `cash_ledger`. Kategori `refund_out` sudah ditambahkan
   di `0011`, tapi triggernya tidak pernah dibuat.
3. `profit_split` punya `unique(unit_id)` (`0002_core_tables.sql:275`), jadi bagi hasil
   yang sudah dihitung tidak bisa dihitung ulang untuk unit yang diretur.

**G2 `[BELUM]`** — Tidak ada `warranties`, `warranty_claims`, maupun provisi garansi.

**G3 `[BELUM]`** — Ini yang eksplisit ingin diubah, dan audit membenarkan keluhannya.
`cancellation_deposits` (`0002_core_tables.sql:194`) hanya punya `jumlah` (default 75000)
dan `status`. **Tidak ada** `kerugian_riil`, `jumlah_ditahan`, maupun `jumlah_dikembalikan`.
Fungsi `resolve_deposit()` (`0009_kurir_dan_deposit.sql`) hanya membalik status tanpa
menghitung apa pun, dan enum `cancellation_status` memaksa pilihan biner:
`applied_to_transaction` atau `forfeited_as_revenue` — sehingga **seluruh** nominal
deposit langsung jadi revenue, persis seperti yang Anda tulis.

---

## H. REKONSILIASI & KONTROL

| # | Item | Status |
|---|---|---|
| H1 | Import mutasi bank CSV | `[BELUM]` |
| H2 | Matching otomatis + manual + aging | `[BELUM]` |
| H3 | Approval workflow | `[BELUM]` |
| H4 | Segregation of duties | `[BELUM]` |
| H5 | Audit trail readable | `[SEBAGIAN]` |
| H6 | Backup terjadwal + export | `[BELUM]` |

**H1 & H2 `[BELUM]`** — Tidak ada `bank_statement_lines`. Rekonsiliasi yang ada bekerja di
level **agregat per tanggal**, bukan per baris mutasi: `bank_reconciliation` menyimpan
`mutasi_bank_jago` (diketik manual) vs `mutasi_tercatat_di_app`, dengan `selisih` dan
`flagged` sebagai generated column. Karena tidak ada baris mutasi individual, tidak ada
yang bisa di-*match*, dan tidak ada konsep "item belum terekonsiliasi" apalagi umurnya.

**H3 `[BELUM]`** — Tidak ada approval workflow di tabel mana pun. Tidak ada kolom
`approved_by`/`approved_at` kecuali `refunds.tanggal_approved` yang belum terpakai.

**H4 `[BELUM]`** — Justru **berlawanan** dengan yang diminta. RLS saat ini memberi admin
hak insert/update di semua tabel finansial (`0004_rls.sql`, 44 policy), termasuk
`bank_reconciliation`. Jadi orang yang sama menginput transaksi **dan** memverifikasi
rekonsiliasinya. `dicatat_oleh` memang direkam di setiap tabel, tapi tidak ada satu pun
constraint yang memakainya untuk mencegah hal ini. Perlu dicatat: dengan hanya 1 profil
admin di sistem saat ini, SoD memang belum bisa ditegakkan tanpa menambah peran.

**H5 `[SEBAGIAN]`** — Lebih baik dari dugaan di checklist. `audit_log`
(`0003_audit_and_immutability.sql:9`) menyimpan `data_sebelum`, `data_sesudah`, **dan**
`perubahan` — dan `perubahan` sudah berupa diff per-field dalam bentuk
`{"kolom": {"dari": x, "jadi": y}}`, bukan dump mentah, dengan `updated_at` sengaja
dibuang supaya tidak jadi noise. Tabelnya juga immutable (trigger `block_audit_mutation()`).
Yang kurang: **tidak ada halaman UI untuk melihat audit log** (tidak ada route `/audit`),
dan `perubahan` masih JSONB — belum ada penerjemah ke kalimat manusia
("Admin mengubah harga jual dari 12.000.000 jadi 12.500.000").

**H6 `[BELUM]`** — Tidak ada export apa pun (lihat F3). Backup: project ada di Supabase
**free tier**, yang backup-nya terbatas dan tidak terjadwal sesuai kebutuhan akuntan.

---

## I. PAJAK

| # | Item | Status |
|---|---|---|
| I1 | Konfigurasi pajak | `[BELUM]` |

Tidak ada tabel setting pajak, tidak ada perhitungan PPh final UMKM maupun PPN, dan tidak
ada tarif yang di-hardcode sekalipun. Belum tersentuh sama sekali.

---

## J. AKAD & BAGI HASIL — *scope Prompt 2, jangan dikerjakan sekarang*

| # | Item | Status |
|---|---|---|
| J1 | Entitas contracts/akad | `[BELUM]` |
| J2 | Nisbah dikunci saat unit masuk skema | `[SEBAGIAN]` — **waktunya salah** |
| J3 | Amandemen akad + persetujuan tercatat | `[SEBAGIAN]` |
| J4 | realized_loss + return_of_capital < capital_call | `[BELUM]` |
| J5 | Klasifikasi kerugian normal/kelalaian/fraud | `[SEBAGIAN]` |
| J6 | owner_of_record / custody_holder / risk_bearer | `[BELUM]` |
| J7 | deal_type per transaksi | `[BELUM]` |
| J8 | Trade-in/buyback dipecah 2 dokumen | `[BELUM]` |

**J1 `[BELUM]`** — Tidak ada entitas akad. Yang ada `profit_share_settings`
(`0002_core_tables.sql:245`) — sebuah **konfigurasi global**, bukan kontrak: tidak ada
pihak, tidak ada jenis akad, tidak ada basis perhitungan, tidak ada tanggal mulai/berakhir,
tidak ada dokumen akad. Nisbah berlaku ke semua investor sekaligus.

**J2 `[SEBAGIAN]` — dugaan di prompt TERBUKTI.** Pengunciannya sendiri ada:
`profit_split.profit_share_setting_id` adalah FK `not null` yang menyimpan setting mana
yang dipakai. Tapi **waktunya salah**. Di `settle_unit()` (`0007_profit_split.sql`):

```sql
-- Setting yang berlaku SAAT INI. Perubahan persentase berlaku langsung
-- untuk unit yang di-settle setelahnya, tidak retroaktif.
select * into v_setting
  from public.profit_share_settings
 where effective_date <= now()
 order by effective_date desc, created_at desc
 limit 1;
```

`now()` di sini adalah **waktu settle**, bukan waktu unit masuk skema. Akibatnya: unit
yang capital call-nya disetujui bulan Januari dengan nisbah 60:40, kalau baru di-settle
bulan Maret setelah nisbah diubah jadi 50:50, akan dibagi dengan **50:50**. Investor
terikat nisbah yang belum ada saat dia menyerahkan uang.

**J3 `[SEBAGIAN]`** — Yang benar: `profit_share_settings` append-only (didokumentasikan di
comment tabel), punya `changed_by` dan `effective_date`, dan unit yang **sudah settled**
tidak pernah dihitung ulang karena `profit_split` menyimpan snapshot. Yang kurang: tidak
ada entitas amandemen, **tidak ada persetujuan pihak kedua** (admin bisa ubah sendiri —
`profit_share_settings` punya 2 policy RLS, insert khusus admin), dan karena cacat J2 di
atas, perubahan nisbah **tetap mengenai unit yang sudah berjalan** tapi belum di-settle.

**J4 `[BELUM]`** — Dua hal, keduanya terkonfirmasi:
- **Tidak ada kolom `realized_loss`** di `units`. Rugi memang terekam sebagai
  `profit_split.margin_bruto` yang negatif, tapi hanya sebagai catatan.
- **`return_of_capital` selalu penuh.** `settle_unit()` memanggil
  `modal_tertahan_unit(p_unit_id)` (`0006_capital_call_dan_settle.sql`) yang isinya
  `sum(capital_call) − sum(return_of_capital)` untuk unit itu — angka ini **tidak pernah
  dikurangi kerugian**. Jadi meskipun unit rugi, investor tetap menerima 100% modalnya
  kembali, dan seluruh kerugian jatuh ke kas bisnis. Diperkuat oleh
  `investor_ledger.jumlah` yang punya `check (jumlah > 0)` sehingga entry negatif memang
  tidak mungkin dicatat. Tidak ada constraint eksplisit "modal harus kembali utuh" yang
  perlu dihapus — yang perlu diubah adalah **logika** `modal_tertahan_unit()`, dan
  `settle_unit()` sudah punya komentar jujur soal ini: *"Kerugian tetap terekam di
  profit_split"* — terekam, tapi tidak pernah dieksekusi ke uang.

**J5 `[SEBAGIAN]`** — Infrastruktur alokasi rugi **ada tapi mati**: `loss_allocation` dan
`loss_allocation_items` (`0002_core_tables.sql:302-323`) menyimpan proporsi kontribusi dan
`jumlah_rugi_ditanggung` per investor. Namun pengecekan menyeluruh menunjukkan kedua tabel
ini **tidak pernah ditulis oleh fungsi mana pun dan tidak muncul di UI mana pun** — satu-satunya
rujukan lain hanyalah trigger audit (`0003`), policy RLS (`0004`), dan definisi tipe di
`src/types/database.ts`. Selain itu modelnya murni **proporsional**; tidak ada kolom
klasifikasi (normal/kelalaian/fraud) dan tidak ada aturan penanggung yang berbeda per jenis.

**J6, J7, J8 `[BELUM]`** — Tidak ada `owner_of_record`, `custody_holder`, `risk_bearer`,
tidak ada `deal_type`, dan tidak ada mekanisme trade-in. Untuk J8 perlu dicatat: struktur
saat ini **memang mendorong** pencatatan satu-transaksi yang Anda tolak, karena satu unit =
satu baris `units` dengan satu `harga_beli` dan satu `harga_jual`.

---

## K. ANALITIK

| # | Item | Status |
|---|---|---|
| K1 | Laba per periode/model/channel/customer/kurir | `[SEBAGIAN]` |
| K2 | Inventory turnover & perputaran modal | `[BELUM]` |
| K3 | ROIC | `[BELUM]` |
| K4 | Cashflow forecast & budgeting | `[BELUM]` |
| K5 | SLA tracking per tahap | `[BELUM]` |

**K1 `[SEBAGIAN]`** — Yang ada cuma dimensi **periode**: `laba_rugi_periode()` dan
`v_profit_ringkasan` (`0007_profit_split.sql:141`). Empat dimensi lain tidak ada:
per model (mungkin secara teknis, tapi `units.model` free text tanpa master produk —
lihat B3), per channel & per customer (mustahil, tidak ada entitas customer — lihat B1),
per kurir (ada `v_courier_transactions` tapi isinya fee kurir, bukan agregasi laba).

**K2, K3, K4 `[BELUM]`** — Tidak ada. Untuk K3 (ROIC) perlu digarisbawahi: karena dokumen
akad memakainya sebagai indikator naik tahap, angkanya harus berasal dari fondasi
akuntansi yang benar (A1–A5) — menghitungnya sekarang di atas `margin` saja akan
menghasilkan angka yang menyesatkan.

**K5 `[BELUM]`** — `units` hanya punya `tanggal_beli`, `tanggal_jual`, `tanggal_settle`.
Tidak ada timestamp per tahap (order masuk → approval → pengadaan → kirim). Datanya
sebetulnya **bisa direkonstruksi** dari `audit_log` karena setiap perubahan status
tercatat berikut waktunya, tapi tidak ada kolom, view, maupun laporan SLA.

---

## PERUBAHAN YANG MERUSAK DATA

**Kesimpulan utama: saat ini praktis tidak ada risiko, karena database produksi masih kosong.**

Hitungan baris diambil langsung dari database produksi `gzhlbikjmzwqsrnqpthr` pada
19 Agustus 2026:

| Tabel | Baris |
|---|---|
| `units` | **0** |
| `investor_ledger` | **0** |
| `profit_split` | **0** |
| `cash_ledger` | **0** |
| `operational_expenses` | **0** |
| `cancellation_deposits` | **0** |
| `courier_transactions` | **0** |
| `courier_master` | **0** |
| `bank_reconciliation` | **0** |
| `refunds` | **0** |
| `loss_allocation` | **0** |
| `profiles` | 1 (admin) |
| `profit_share_settings` | 1 (seed 60%) |
| `audit_log` | 6 |

Turunannya: 0 unit settled, 0 unit dengan margin negatif, 0 unit ber-IMEI.

Karena itu, item-item berikut — yang **normalnya** merusak data — sekarang bisa
dikerjakan tanpa migrasi data sama sekali. Tapi tiap hari yang lewat dengan aplikasi
sudah dipakai akan menaikkan ongkosnya:

| Item | Kenapa merusak kalau data sudah ada | Baris terdampak sekarang |
|---|---|---|
| A1–A3 (COA + jurnal + posting) | Semua transaksi historis harus dijurnal mundur, dan saldo awal tiap akun harus dibentuk | 0 |
| J2 (waktu penguncian nisbah) | Unit yang sudah settled dihitung pakai nisbah waktu settle; menurut prompt harus dibiarkan apa adanya dan ditandai legacy | 0 settled |
| J4 (realized_loss + modal tidak kembali utuh) | Mengubah `modal_tertahan_unit()` mengubah arti `return_of_capital` yang sudah tercatat | 0 |
| G3 (pemecahan deposit) | Deposit yang sudah `forfeited_as_revenue` sudah masuk `cash_ledger` sebagai revenue penuh; memecahnya perlu jurnal koreksi | 0 |
| E3 (multi kas/bank) | Semua baris `cash_ledger` lama harus di-assign ke satu akun default | 0 |
| D3 (whitelist biaya) | `units.margin` adalah generated column; mengubah rumusnya menulis ulang margin **seluruh** unit historis, termasuk yang sudah di-settle dan sudah dibagi hasilnya | 0 |
| B3 (unique IMEI) | Kalau ada IMEI duplikat historis, constraint akan gagal dipasang | 0 |

**Satu peringatan yang tetap berlaku meski data kosong:** `units.hpp_total` dan
`units.margin` adalah `GENERATED ALWAYS AS ... STORED`. Mengubah rumusnya **wajib** lewat
drop + recreate kolom, dan itu menulis ulang nilai untuk semua baris — tidak ada cara
mengubahnya untuk unit baru saja. Kalau D3 jadi dikerjakan nanti, keputusan arsitektur
"margin sebagai generated column" kemungkinan besar harus dibongkar dulu.

---

## Catatan tambahan (tidak diminta, tidak saya ubah)

1. **`loss_allocation` + `loss_allocation_items` adalah kode mati.** Punya DDL, RLS,
   trigger audit, dan tipe TypeScript, tapi nol penulis dan nol pembaca. Saat mengerjakan
   J5 nanti, putuskan dulu: dipakai atau dibuang — jangan dibiarkan menggantung.
2. **`bank_reconciliation.mutasi_bank_jago` mengunci nama bank ke dalam skema.** Saat E3
   (multi bank) dikerjakan, kolom ini akan jadi beban.
3. **Belum ada satu pun test otomatis** di repo. Untuk perubahan sebesar Prompt 1 —
   khususnya constraint debit = kredit — saya sarankan ada test sebelum mulai, bukan
   sesudah.
4. **`README.md` sudah sangat akurat** terhadap keadaan kode. Beberapa item di atas
   (G1, J3) memang sudah dijelaskan jujur di sana sebagai keputusan sadar, bukan
   kelalaian. Kalau Prompt 1 dijalankan, README perlu ikut diperbarui.

---

## Yang TIDAK saya lakukan di sesi ini

Sesuai instruksi: tidak ada file kode, migrasi, atau konfigurasi yang dibuat/diubah/dihapus.
Satu-satunya file yang ditulis adalah `AUDIT-REPORT.md` ini. Tidak ada refactor, tidak ada
"sekalian dirapikan", dan tidak ada item `[SUDAH]` yang disentuh.

Menunggu instruksi berikutnya sebelum menjalankan PROMPT 1.
