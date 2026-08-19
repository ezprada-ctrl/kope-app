# Spesifikasi Teknis: Aplikasi Manajemen Keuangan Bisnis Jual-Beli iPhone

## 1. Konteks & Tujuan

Bisnis jual-beli iPhone (baru & bekas) dengan struktur:
- **1 Admin/Owner utama** (akses penuh, satu-satunya yang input transaksi & pegang akses dompet bank)
- **1 Owner partner** (bagi hasil 80%, akses view-only termasuk HPP & margin)
- **1 Investor** (fast-response, danain per-unit sesuai kebutuhan, bagi hasil proporsional)

Latar belakang kritis: rekening sebelumnya campur dengan rekening pribadi pengelola lama → dana Rp92 juta (modal + profit) hilang terpakai untuk kebutuhan pribadi. Sistem baru **wajib** memisahkan dana bisnis dari pribadi (dompet Bank Jago terpisah, hanya admin yang pegang akses transfer) dan mewajibkan rekonsiliasi antara pencatatan aplikasi vs mutasi rekening asli.

Prinsip desain utama: **transparansi radikal** (semua pihak lihat data real-time sesuai levelnya), **audit trail immutable**, dan **tidak ada single point of financial loss** seperti kasus sebelumnya — dimitigasi lewat notifikasi real-time ke semua pihak setiap ada transaksi masuk/keluar dari dompet bisnis.

---

## 2. Role & Akses (RBAC)

| Role | Lihat HPP/Margin | Input Transaksi | Akses Transfer Dompet | Approve/Reject | Notifikasi Real-time |
|---|---|---|---|---|---|
| Admin (gue, 20%) | ✅ | ✅ (satu-satunya) | ✅ (satu-satunya) | ✅ | ✅ |
| Owner Partner (80%) | ✅ | ❌ (view-only) | ❌ | ❌ | ✅ (setiap transaksi) |
| Investor | ✅ (HPP & margin unit yang dia danai) | ❌ (view-only) | ❌ | ❌ | ✅ (setiap transaksi terkait dananya) |

Catatan: partner & investor tidak punya kontrol transfer, tapi dapat notifikasi otomatis tiap ada uang masuk/keluar dompet bisnis — supaya "yang tercatat di app" bisa mereka silangkan sendiri dengan realita, tanpa perlu kontrol transaksional.

---

## 3. Entities & Skema Data (garis besar)

### `units` (siklus hidup 1 unit iPhone)
```
id, tipe (baru/bekas), model, kondisi, 
sumber_dana (investor_id, nullable jika modal sendiri),
harga_beli, biaya_kurir_ambil, biaya_refurbish (jika ada),
hpp_total (computed),
harga_jual, biaya_kurir_antar, biaya_admin_packing,
margin (computed = harga_jual - hpp_total - biaya_kurir_antar - biaya_admin_packing),
status: sourced → paid_to_seller → in_stock → sold_pending_delivery → delivered_paid → settled
        (+ cabang: refunded, partial_refund, cancelled_forfeited)
created_at, updated_at
```

### `investor_ledger`
```
id, investor_id, tipe (capital_call / return_of_capital / profit_share),
jumlah, unit_id (nullable — nullable karena dana boleh masuk kas pool umum, tidak selalu 1:1 ke unit),
outstanding_running_balance (computed),
tanggal, bukti_transfer_url, dicatat_oleh
```
Formula outstanding: `outstanding = SUM(capital_call) - SUM(return_of_capital)`, harus selalu `<= plafon_aktif` (default 300jt, adjustable field terpisah `plafon_settings`).

### `courier_master` (siap nambah kurir, walau sekarang cuma 1)
```
id, nama, kontak, aktif (boolean), tanggal_bergabung
```

### `courier_transactions`
```
id, courier_id, unit_id, tipe (ambil_barang / antar_barang),
fee_gross (misal 75rb), reimbursement_bensin (misal 25rb), fee_net_kurir (computed),
status (selesai / batal_forfeited),
jika batal_forfeited: biaya_pass_through_ke_kurir, revenue_bersih_bisnis (computed = 75rb charge - fee_net_kurir yang tetap dibayar)
tanggal
```

### `cancellation_deposits` (charge 75k di depan)
```
id, unit_id, dibayar_oleh (buyer/seller_id), jumlah (75rb, variable),
status: pending → applied_to_transaction (deal jadi, masuk ke harga transaksi) 
                → forfeited_as_revenue (batal, admin yang mark)
dicatat_oleh (selalu admin, sesuai keputusan)
```

### `refunds` (infra disiapkan, belum aktif dipakai)
```
id, unit_id, tipe (refund_full / partial_refund),
jumlah, alasan, tanggal, status (pending/approved/completed)
```

### `profit_share_settings` (global config, bisa diubah admin kapanpun)
```
id, investor_percentage (default 60, bisa jadi 50 atau custom), 
admin_percentage (computed = 100 - investor_percentage),
owner_admin_percentage (fixed 20%), owner_partner_percentage (fixed 80% — dari porsi admin aja),
effective_date (kapan setting ini berlaku),
changed_by (admin name/id), created_at
```
Catatan: `owner_admin_percentage` dan `owner_partner_percentage` tidak berubah — ini split dari porsi "admin" setelah investor dapat bagiannya. Jadi formula: `investor_profit = margin * investor_percentage`, terus dari sisa `(margin * admin_percentage)`, baru dibagi 20/80 ke admin & partner.

### `profit_split` (per-unit, dihitung saat unit settled)
```
id, unit_id, tanggal_settle,
margin_bruto (harga_jual - hpp_total - biaya_kurir_antar - biaya_admin_packing),
profit_share_setting_id (link ke setting yang berlaku saat unit settled),
investor_profit (margin_bruto * investor_percentage),
admin_pool_profit (margin_bruto * admin_percentage),
admin_final_profit (admin_pool_profit * 20%),
partner_final_profit (admin_pool_profit * 80%)
```

### `loss_allocation` (infra untuk multi-investor pool, dipakai kalau >1 investor aktif bersamaan)
```
id, periode, total_pool_saat_kejadian, 
allocations: [{investor_id, kontribusi, proporsi, jumlah_rugi_ditanggung}]
```

### `bank_reconciliation`
```
id, tanggal, mutasi_bank_jago (manual upload screenshot/CSV atau input manual admin),
mutasi_tercatat_di_app, selisih (computed, harus 0 — flag kalau tidak 0)
```

### `audit_log` (immutable)
```
id, tabel_terdampak, record_id, aksi (create/update), data_sebelum, data_sesudah, 
dilakukan_oleh, timestamp
```
Semua transaksi finansial tidak boleh di-hard-delete — kalau salah input, buat entry koreksi baru yang tertaut ke entry asal, bukan overwrite.

---

## 4. State Machine — Siklus Unit

```
sourced 
  → paid_to_seller (dana dari investor langsung, atau kas pool)
  → in_stock (QC lolos, tidak ada garansi komplain setelah ini kecuali refund_infra diaktifkan)
  → sold_pending_delivery (buyer sudah deal, cancellation_deposit 75k dibayar dimuka)
  → delivered_paid (COD sukses, uang masuk dompet Jago)
  → settled (profit_split dieksekusi, outstanding investor berkurang)

Cabang alternatif dari sold_pending_delivery:
  → cancelled_forfeited (admin mark batal → courier tetap dibayar, selisih jadi revenue)
```

---

## 5. Alur Dana Investor

1. Admin identifikasi unit yang mau dibeli → ajukan capital call ke investor sejumlah kebutuhan.
2. Investor transfer (bisa langsung habis per-unit, bisa masuk kas pool umum) → dicatat di `investor_ledger` tipe `capital_call`.
3. Sistem cek `outstanding + capital_call_baru <= plafon_aktif` sebelum dana dianggap valid dipakai.
4. Unit terjual & settled → `return_of_capital` dicatat, outstanding berkurang, plafon "terbuka" lagi untuk capital call berikutnya.
5. Profit dari margin unit dibagi per-transaksi sesuai skema co-own:
   - Investor dapat **fixed percentage** dari margin bruto (saat ini 60%, admin bisa ubah jadi 50% atau custom kapanpun, berlaku immediate untuk unit berikutnya).
   - Sisa margin setelah investor dapat bagiannya, dibagi 20% (admin) : 80% (partner).
   - Formula: `investor_profit = margin_bruto * investor_percentage`, `admin_profit = (margin_bruto * admin_percentage) * 20%`, `partner_profit = (margin_bruto * admin_percentage) * 80%`.
6. Kalau ada kerugian unit (refund, kondisi buruk, dll) — investor tanggung sesuai porsi ownership-nya. Contoh: unit margin seharusnya 20jt tapi rugi 5jt (net margin 15jt), investor dapat 9jt (60%), admin+partner dapat sisa 6jt (dibagi 20/80).
7. Admin bisa ubah investor_percentage kapanpun melalui menu `Profit Share Settings` — perubahan langsung berlaku untuk unit yang settled setelah perubahan itu.

---

## 6. Rekonsiliasi Bank (mitigasi risiko utama)

- Setiap transaksi finansial di app **harus** direkonsiliasi terhadap mutasi dompet Bank Jago (upload screenshot/CSV mutasi berkala, atau manual match oleh admin).
- Selisih antara `mutasi_tercatat_di_app` vs `mutasi_bank_jago` → flag otomatis, tidak boleh silent.
- Notifikasi real-time (bisa via Telegram bot juga) ke admin, partner, dan investor tiap ada transaksi masuk/keluar dari dompet bisnis.

---

## 7. Input Channel

- **Utama**: input langsung di aplikasi (web dashboard), oleh admin.
- **Sekunder (dikembangkan sambil jalan)**: Telegram bot, command-based (bukan free-text/AI parsing dulu — supaya gratis total, konsisten dengan pola command bot yang sudah pernah dibangun sebelumnya).
  - Command contoh: `/beli`, `/jual`, `/kurir`, `/bukti` (upload foto bukti transfer via Telegram, disimpan ke storage lalu di-link ke record terkait).
  - Semua input dari Telegram tetap tercatat sebagai `dicatat_oleh: admin` dan masuk `audit_log`.

---

## 8. Dashboard Views (per role)

- **Admin**: 
  - Full CRUD semua tabel
  - Rekonsiliasi bank
  - Capital call management
  - Mark cancel/refund
  - **Profit Share Settings menu** — ubah investor_percentage kapanpun, changes immediate
  
- **Partner (view-only)**: 
  - Daftar unit + HPP + margin + status
  - Ringkasan profit split (terlihat berapa % investor dapat, berapa % admin_pool dapat)
  - Riwayat keuntungan partner
  - Notifikasi transaksi
  
- **Investor (view-only)**: 
  - Outstanding balance
  - Riwayat capital call & return of capital
  - Unit yang dia danai (termasuk HPP & margin unit tsb untuk validasi keadilan bagi hasil)
  - Current profit share percentage
  - Riwayat keuntungan investor
  - Notifikasi transaksi

---

## 9. Hal yang Perlu Diputuskan Saat Build (belum final, bahas sama Claude Code saat eksekusi)

- Format command Telegram bot yang eksak (nama command, urutan parameter).
- Struktur upload/rekonsiliasi mutasi Bank Jago — manual entry vs ada API/CSV export yang bisa diparse.

---

## 10. Stack yang Disarankan (konsisten dengan pola project sebelumnya)

- Backend/DB: Supabase (Postgres + Auth + Storage + Edge Functions)
- Frontend: Next.js + Tailwind (dashboard 3-role)
- Bot: Telegram Bot API (gratis) → webhook via Supabase Edge Function
- Hosting: Netlify/Vercel (frontend), Supabase (backend) — tetap di tier gratis untuk volume transaksi sekarang
