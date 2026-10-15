# Dari nemu unit sampai settle

Urutan nyata satu siklus jual-beli iPhone di KOPE — apa yang terjadi di dunia nyata, dan apa yang wajib dicatat di aplikasi persis saat itu juga.

Status di aplikasi cuma bisa **maju**, tidak bisa mundur. Salah pilih diperbaiki lewat `Unit → Edit`, jejaknya tetap tercatat di audit log.

---

## 0. Nemu unit, QC lewat checklist online

**Status unit:** belum tercatat

**Dunia nyata:**
Penjual isi checklist kondisi unit secara online (fisik, IMEI, kelengkapan). QC-nya di sini — sebelum ada kontak fisik sama sekali. Kalau lolos, baru nego harga sampai deal.

**Di aplikasi:**
Belum ada apa pun. Jangan buka form dulu sebelum harga benar-benar deal — sekali disimpan, unitnya permanen di database (tidak bisa hard-delete) dan kode yang dipakai ikut "kepakai" selamanya, walau deal itu sendiri batal.

---

## 1. Catat unitnya

**Status unit:** `Sourced`

**Dunia nyata:**
Belum ada uang keluar. Ini murni mendaftarkan rencana beli.

**Di aplikasi:** `Unit → + Unit baru`

- **Tipe** — baru / bekas, model, kondisi, IMEI, kode unit
- **Sumber dana** — kosongkan kalau modal sendiri, atau pilih pemodal
- **Jenis akad** — mudharabah / mandiri internal / konsinyasi
- **Harga beli**, estimasi biaya kurir ambil, estimasi refurbish

Status otomatis jadi `Sourced` begitu disimpan.

---

## 2. Bayar penjual, kurir jemput

**Status unit:** `Dibayar ke penjual`

**Dunia nyata:**
Kamu buka app Bank Jago sendiri, transfer ke rekening penjual. Kurir dikirim ke lokasinya buat ambil unit — begitu kurir dan penjual sudah ketemu langsung, deal sudah hampir pasti jalan (>70%), checklist online tadi sudah menyaring sebagian besar risiko batal.

**Di aplikasi:**

- `Modal → + Catat modal` — hanya kalau pakai dana pemodal, pilih **Capital call**, plafonnya dicek otomatis di database
- `Unit → detail unit → Dibayar ke penjual`
- `Kurir → + Transaksi → Ambil barang`

Kas keluar (ke penjual + fee kurir) tercatat sendiri di buku Kas — tidak ada input manual buat itu.

---

## 3. Unit sampai di tangan

**Status unit:** `Di stok`

**Dunia nyata:**
Unit diterima, dicek fisik terakhir kalinya — konfirmasi cocok sama checklist online yang sudah lolos di awal.

**Di aplikasi:** `Unit → detail unit → Di stok`

---

## 4. Deal ke buyer

**Status unit:** `Deal, menunggu antar`

**Dunia nyata:**
Nego harga jual ke buyer. Kadang buyer transfer deposit/DP dulu ke Bank Jago sebelum barang dikirim — kamu cek mutasinya masuk lewat app Bank Jago.

**Di aplikasi:**

- `Deposit → + Deposit` — hanya kalau buyer bayar di depan, catat jumlah dan siapa yang bayar
- `Unit → Edit` — isi **harga jual**, biaya kurir antar, biaya admin/packing
- `Unit → detail → Deal, menunggu antar`

Harga jual wajib terisi dulu — sistem menolak status ini kalau masih kosong.

---

## 5. Kurir antar, COD

**Status unit:** `Terkirim & dibayar`

**Dunia nyata:**
Kurir antar ke buyer, COD sukses. Sisa pembayaran masuk ke Bank Jago — kamu cek lagi lewat app-nya buat mastiin dananya benar-benar sudah nyampe sebelum unit ditandai lunas.

**Di aplikasi:**

- `Kurir → + Transaksi → Antar barang`
- `Unit → detail → Terkirim & dibayar`

Kas masuk otomatis dihitung sisa harga jual dikurangi deposit yang sudah masuk duluan.

### Cabang · buyer batal di tengah jalan

Kurir sudah berangkat tapi buyer batal. Catat transaksi kurir dengan status **batal_forfeited**, lalu ke `Deposit` isi **rincian kerugian** (bensin, upah kurir, dst — wajib sebelum bisa diselesaikan), pilih **Hangus jadi revenue**, baru pindahkan unit ke status `Batal (deposit hangus)`. Alur berhenti di sini, tidak lanjut ke settle.

---

## 6. Settle

**Status unit:** `Settled`

**Dunia nyata:**
Tidak ada aksi fisik. Murni pembukuan penutup.

**Di aplikasi:** `Unit → detail → Settled`

Sekali klik: bagi hasil dieksekusi ke pemodal/Owner 1/Owner 2, dan modal pemodal yang tertahan di unit ini dikembalikan.

### Cabang · unit ini rugi

Kalau harga jual lebih kecil dari HPP, sistem menolak settle sampai `Unit → Edit` diisi dulu: klasifikasi kerugian (normal / kelalaian / fraud), justifikasi, dan penanggung untuk kelalaian & fraud. Rugi normal diserap dari porsi modal pemodal — bukan dari nisbah bagi hasil.

---

## Rutinitas kamu · bukan per unit, tapi berkala

Tiap kamu buka app Bank Jago buat cek saldo — bukan pas transaksi unit tertentu, tapi jadwal rutin sendiri — bandingkan angka yang muncul di sana terhadap yang dihitung KOPE.

`Rekonsiliasi → + Catat rekonsiliasi`

Masukkan saldo Bank Jago apa adanya. Angka "tercatat di app" **bukan kamu yang isi** — dihitung otomatis dari seluruh buku Kas s.d. tanggal itu, supaya rekonsiliasi benar-benar membandingkan bank terhadap sistem, bukan terhadap ketikan admin sendiri. Kalau ada selisih, itu sinyal ada yang belum tercatat atau salah catat.

**Urutannya penting:** kalau lagi pakai data dummy buat latihan, matikan dulu togglenya di menu Data dummy sebelum mencatat rekonsiliasi asli pertama — angka pembandingnya dibekukan saat baris dibuat, jadi kalau salah, salahnya nempel selamanya.

---

## Yang gampang kelewat

- Kode unit unik selamanya — termasuk yang disembunyikan lewat toggle data dummy. Kalau kena bentrok, itu sebabnya.
- Fee kurir dicatat dua kali per unit normal: sekali saat ambil dari penjual, sekali saat antar ke buyer.
- Deposit cuma dibuat kalau buyer benar-benar bayar di depan — bukan wajib untuk semua transaksi.
- Status cuma bisa maju, tidak bisa mundur. Salah pilih diperbaiki lewat `Edit unit`, jejaknya tetap tercatat di audit log.

---

## Menu buat mengecek hasil, kapan saja

| Menu | Isinya |
|---|---|
| Bagi hasil | Riwayat pembagian margin per unit yang sudah settled |
| Kas | Semua uang masuk/keluar dompet Bank Jago, satu buku |
| Modal | Outstanding dan sisa plafon tiap pemodal |
| Ringkasan finansial | Laba rugi periode dan kas bebas |
| Rekonsiliasi | Rutinitas kamu sendiri lewat app Bank Jago — lihat bagian di atas |
