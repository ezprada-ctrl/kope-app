// Isi data dummy siklus penuh buat latihan & demo KOPE App.
//
// Jalankan dari root project:
//   node --env-file=.env.local scripts/seed-dummy.mjs
//
// Butuh SUPABASE_SERVICE_ROLE_KEY di .env.local (bypass RLS, cuma dipakai
// script ini — form aplikasi tidak pernah pakai key ini). Semua baris yang
// dibuat ditandai is_dummy=true (migrasi 0021) — tidak pernah bercampur
// dengan data asli, dan bisa disembunyikan/ditampilkan lagi kapan saja
// lewat menu "Data dummy" di aplikasi tanpa pernah dihapus permanen.
//
// Aman dijalankan ulang: script berhenti kalau sudah ada data dummy,
// kecuali dipanggil dengan --force (dummy lama dibiarkan apa adanya,
// cuma ditambah yang baru — konsisten dengan aturan tidak ada hard-delete).

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "SUPABASE_SERVICE_ROLE_KEY atau NEXT_PUBLIC_SUPABASE_URL belum ada di .env.local.",
  );
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const FORCE = process.argv.includes("--force");

function rp(n) {
  return new Intl.NumberFormat("id-ID").format(n);
}

async function must(promise, langkah) {
  const { data, error } = await promise;
  if (error) {
    console.error(`✗ Gagal di langkah "${langkah}": ${error.message}`);
    process.exit(1);
  }
  console.log(`✓ ${langkah}`);
  return data;
}

// Tanggal LOKAL, bukan UTC. `toISOString()` bikin semua tanggal mundur satu
// hari kalau script dijalankan sebelum pukul 07:00 WIB — dulu bikin capital
// call "hari ini" tercatat kemarin dan kurir bergabung sehari lebih awal.
function tgl(hariKeBelakang) {
  const d = new Date();
  d.setDate(d.getDate() - hariKeBelakang);
  const bulan = String(d.getMonth() + 1).padStart(2, "0");
  const hari = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${bulan}-${hari}`;
}

async function main() {
  console.log("=== Seed data dummy KOPE ===\n");

  if (!FORCE) {
    const { count } = await supabase
      .from("units")
      .select("id", { count: "exact", head: true })
      .eq("is_dummy", true);
    if (count && count > 0) {
      console.log(
        `Sudah ada ${count} unit dummy. Jalankan lagi dengan --force kalau ` +
          "memang mau menambah skenario baru (yang lama tidak akan dihapus — " +
          "tidak bisa hard-delete di aplikasi ini).",
      );
      process.exit(0);
    }
  }

  const admin = await must(
    supabase.from("profiles").select("id, nama").eq("role", "super_admin").limit(1).single(),
    "Ambil profil Super Admin (berperan sebagai owner di skenario ini)",
  );

  // Pemodal HARUS profil ber-role 'pemodal'. Semua view ringkasan modal
  // (v_pemodal_outstanding, dan lewat itu kartu "Outstanding modal" di
  // dashboard + dropdown pemodal di form capital call) memfilter
  // `where role = 'pemodal'`. Kalau capital call diikat ke profil
  // super_admin, uangnya tetap masuk ledger dan kas tapi TIDAK PERNAH
  // muncul di ringkasan mana pun — dashboard bilang Rp0 sementara halaman
  // Ringkasan bilang puluhan juta. Lebih baik berisik di sini daripada
  // menghasilkan data demo yang saling bertentangan.
  const { data: pemodalProfil } = await supabase
    .from("profiles")
    .select("id, nama")
    .eq("role", "pemodal")
    .limit(1)
    .maybeSingle();

  const pemodalId = pemodalProfil?.id ?? admin.id;

  if (pemodalProfil) {
    console.log(`✓ Pemodal dummy memakai profil "${pemodalProfil.nama}" (role pemodal)`);
  } else {
    console.warn(
      "\n⚠  Belum ada user ber-role 'pemodal' di database.\n" +
        "   Capital call dummy terpaksa diikat ke profil super_admin, dan akibatnya:\n" +
        "     · Dashboard → kartu \"Outstanding modal\" tetap Rp0\n" +
        "     · Halaman Modal → \"Belum ada pemodal terdaftar\"\n" +
        "     · Form capital call → dropdown pemodal kosong\n" +
        "   sementara halaman Ringkasan finansial tetap menghitung angkanya.\n" +
        "   Undang satu user dengan role 'pemodal' lalu jalankan ulang dengan\n" +
        "   --force supaya skenario modalnya utuh.\n",
    );
  }

  const kurir = await must(
    supabase
      .from("courier_master")
      .insert({
        nama: "Budi Santoso (dummy)",
        kontak: "0812-0000-0001",
        aktif: true,
        tanggal_bergabung: tgl(60),
        is_dummy: true,
      })
      .select("id")
      .single(),
    "Buat kurir dummy: Budi Santoso",
  );

  // -------------------------------------------------------------------
  // Unit A — iPhone 13 Pro, untung, sampai settled
  // -------------------------------------------------------------------
  const unitA = await must(
    supabase
      .from("units")
      .insert({
        tipe: "bekas",
        model: "iPhone 13 Pro 256GB (dummy)",
        kondisi: "Mulus 95%, batt 89%",
        kode: "DUMMY-A",
        pemodal_id: pemodalId,
        deal_type: "mudharabah",
        harga_beli: 9_500_000,
        biaya_kurir_ambil: 50_000,
        biaya_refurbish: 200_000,
        harga_jual: 11_500_000,
        biaya_kurir_antar: 50_000,
        biaya_admin_packing: 30_000,
        tanggal_beli: tgl(20),
        is_dummy: true,
      })
      .select("id")
      .single(),
    "Unit A dibuat (Sourced) — iPhone 13 Pro, target untung",
  );

  await must(
    supabase.from("pemodal_ledger").insert({
      pemodal_id: pemodalId,
      tipe: "capital_call",
      jumlah: 9_750_000,
      unit_id: unitA.id,
      // tgl(0), bukan dibackdate: skema profit-sharing (migrasi 0019)
      // cuma berlaku_dari hari migrasi dijalankan. Capital call yang
      // dibackdate jatuh sebelum itu, jadi nisbahnya diam-diam balik ke
      // fallback lama alih-alih terkunci lewat snapshot.
      tanggal: tgl(0),
      catatan: "Capital call dummy buat Unit A",
      is_dummy: true,
    }),
    "Capital call buat Unit A dicatat (kas masuk + nisbah terkunci otomatis)",
  );

  await must(
    supabase.from("units").update({ status: "paid_to_seller" }).eq("id", unitA.id),
    "Unit A -> Dibayar ke penjual",
  );
  await must(
    supabase
      .from("courier_transactions")
      .insert({
        courier_id: kurir.id,
        unit_id: unitA.id,
        tipe: "ambil_barang",
        fee_gross: 75_000,
        reimbursement_bensin: 25_000,
        status: "selesai",
        tanggal: tgl(18),
        is_dummy: true,
      }),
    "Kurir ambil Unit A dari penjual",
  );
  await must(
    supabase.from("units").update({ status: "in_stock" }).eq("id", unitA.id),
    "Unit A -> Di stok",
  );
  await must(
    supabase.from("units").update({ status: "sold_pending_delivery" }).eq("id", unitA.id),
    "Unit A -> Deal, menunggu antar",
  );
  await must(
    supabase.from("units").update({ status: "delivered_paid" }).eq("id", unitA.id),
    "Unit A -> Terkirim & dibayar (kas masuk penuh)",
  );
  await must(
    supabase
      .from("courier_transactions")
      .insert({
        courier_id: kurir.id,
        unit_id: unitA.id,
        tipe: "antar_barang",
        fee_gross: 75_000,
        reimbursement_bensin: 25_000,
        status: "selesai",
        tanggal: tgl(15),
        is_dummy: true,
      }),
    "Kurir antar Unit A ke buyer",
  );
  await must(
    supabase.rpc("settle_unit", { p_unit_id: unitA.id }),
    "Unit A di-settle — bagi hasil jalan, modal pemodal kembali",
  );

  // -------------------------------------------------------------------
  // Unit B — iPhone 12, rugi normal, sampai settled
  // -------------------------------------------------------------------
  const unitB = await must(
    supabase
      .from("units")
      .insert({
        tipe: "bekas",
        model: "iPhone 12 128GB (dummy)",
        kondisi: "Baret halus, batt 84%",
        kode: "DUMMY-B",
        pemodal_id: pemodalId,
        deal_type: "mudharabah",
        harga_beli: 6_000_000,
        biaya_kurir_ambil: 50_000,
        biaya_refurbish: 150_000,
        harga_jual: 5_800_000,
        biaya_kurir_antar: 50_000,
        biaya_admin_packing: 30_000,
        tanggal_beli: tgl(25),
        loss_classification: "normal",
        loss_justifikasi:
          "Harga pasar iPhone 12 turun sebelum unit terjual — rugi normal, ditanggung porsi modal pemodal.",
        is_dummy: true,
      })
      .select("id")
      .single(),
    "Unit B dibuat (Sourced) — iPhone 12, target rugi (buat demo alur rugi)",
  );

  await must(
    supabase.from("pemodal_ledger").insert({
      pemodal_id: pemodalId,
      tipe: "capital_call",
      jumlah: 6_200_000,
      unit_id: unitB.id,
      tanggal: tgl(0),
      is_dummy: true,
    }),
    "Capital call buat Unit B dicatat",
  );
  await must(
    supabase.from("units").update({ status: "paid_to_seller" }).eq("id", unitB.id),
    "Unit B -> Dibayar ke penjual",
  );
  await must(
    supabase.from("units").update({ status: "in_stock" }).eq("id", unitB.id),
    "Unit B -> Di stok",
  );
  await must(
    supabase.from("units").update({ status: "sold_pending_delivery" }).eq("id", unitB.id),
    "Unit B -> Deal, menunggu antar",
  );
  await must(
    supabase.from("units").update({ status: "delivered_paid" }).eq("id", unitB.id),
    "Unit B -> Terkirim & dibayar",
  );
  await must(
    supabase.rpc("settle_unit", { p_unit_id: unitB.id }),
    "Unit B di-settle — rugi diserap porsi modal pemodal, bukan nisbah",
  );

  // -------------------------------------------------------------------
  // Unit C — dibatalkan, deposit hangus dengan rincian kerugian riil
  // -------------------------------------------------------------------
  const unitC = await must(
    supabase
      .from("units")
      .insert({
        tipe: "baru",
        model: "iPhone 14 128GB (dummy)",
        kode: "DUMMY-C",
        pemodal_id: pemodalId,
        deal_type: "mudharabah",
        harga_beli: 9_000_000,
        biaya_kurir_ambil: 50_000,
        harga_jual: 10_200_000,
        tanggal_beli: tgl(10),
        is_dummy: true,
      })
      .select("id")
      .single(),
    "Unit C dibuat (Sourced) — iPhone 14, buat demo alur batal",
  );
  await must(
    supabase.from("pemodal_ledger").insert({
      pemodal_id: pemodalId,
      tipe: "capital_call",
      jumlah: 9_050_000,
      unit_id: unitC.id,
      tanggal: tgl(0),
      is_dummy: true,
    }),
    "Capital call buat Unit C dicatat",
  );
  await must(
    supabase.from("units").update({ status: "paid_to_seller" }).eq("id", unitC.id),
    "Unit C -> Dibayar ke penjual",
  );
  await must(
    supabase.from("units").update({ status: "in_stock" }).eq("id", unitC.id),
    "Unit C -> Di stok",
  );
  await must(
    supabase.from("units").update({ status: "sold_pending_delivery" }).eq("id", unitC.id),
    "Unit C -> Deal, menunggu antar",
  );

  const depositC = await must(
    supabase
      .from("cancellation_deposits")
      .insert({
        unit_id: unitC.id,
        dibayar_oleh: "buyer",
        nama_pembayar: "Rina (dummy)",
        jumlah: 75_000,
        tanggal: tgl(6),
        is_dummy: true,
      })
      .select("id")
      .single(),
    "Deposit pembatalan Unit C dicatat (Rp75.000)",
  );

  await must(
    supabase
      .from("courier_transactions")
      .insert({
        courier_id: kurir.id,
        unit_id: unitC.id,
        tipe: "antar_barang",
        fee_gross: 50_000,
        reimbursement_bensin: 10_000,
        status: "batal_forfeited",
        charge_ke_pihak_lain: 60_000,
        tanggal: tgl(5),
        catatan: "Buyer batal saat kurir sudah di jalan (dummy)",
        is_dummy: true,
      }),
    "Kurir sudah di jalan lalu buyer batal — transaksi kurir ditandai batal",
  );

  const [komponenBensin, komponenUpah] = await must(
    supabase.from("loss_components").select("id, kode").in("kode", ["bensin_kurir", "upah_kurir"]),
    "Ambil katalog komponen kerugian (bensin, upah kurir)",
  ).then((rows) => [
    rows.find((r) => r.kode === "bensin_kurir"),
    rows.find((r) => r.kode === "upah_kurir"),
  ]);

  await must(
    supabase.from("cancellation_loss_items").insert({
      cancellation_deposit_id: depositC.id,
      component_id: komponenBensin.id,
      jumlah: 10_000,
      catatan: "Bensin kurir (dummy)",
    }),
    "Rincian kerugian: bensin Rp10.000",
  );
  await must(
    supabase.from("cancellation_loss_items").insert({
      cancellation_deposit_id: depositC.id,
      component_id: komponenUpah.id,
      jumlah: 50_000,
      catatan: "Upah kurir (dummy)",
    }),
    "Rincian kerugian: upah kurir Rp50.000",
  );
  await must(
    supabase.rpc("resolve_deposit", {
      p_deposit_id: depositC.id,
      p_status: "forfeited_as_revenue",
    }),
    "Deposit Unit C diselesaikan: hangus Rp60.000, sisa Rp15.000 kembali ke buyer",
  );
  await must(
    supabase.from("units").update({ status: "cancelled_forfeited" }).eq("id", unitC.id),
    "Unit C -> Batal (deposit hangus)",
  );

  // -------------------------------------------------------------------
  // Unit D — masih jalan (Di stok), belum settled
  // -------------------------------------------------------------------
  const unitD = await must(
    supabase
      .from("units")
      .insert({
        tipe: "bekas",
        model: "iPhone 13 128GB (dummy)",
        kode: "DUMMY-D",
        deal_type: "mandiri_internal",
        harga_beli: 8_200_000,
        biaya_kurir_ambil: 50_000,
        tanggal_beli: tgl(4),
        is_dummy: true,
      })
      .select("id")
      .single(),
    "Unit D dibuat (Sourced) — dana KOPE sendiri (mandiri internal)",
  );
  await must(
    supabase.from("units").update({ status: "paid_to_seller" }).eq("id", unitD.id),
    "Unit D -> Dibayar ke penjual",
  );
  await must(
    supabase.from("units").update({ status: "in_stock" }).eq("id", unitD.id),
    "Unit D -> Di stok (berhenti di sini, masih jalan)",
  );

  // -------------------------------------------------------------------
  // Unit E — baru masuk (Sourced doang)
  // -------------------------------------------------------------------
  await must(
    supabase.from("units").insert({
      tipe: "bekas",
      model: "iPhone 11 128GB (dummy)",
      kode: "DUMMY-E",
      deal_type: "mudharabah",
      pemodal_id: pemodalId,
      harga_beli: 3_800_000,
      tanggal_beli: tgl(1),
      is_dummy: true,
    }),
    "Unit E dibuat (Sourced) — baru masuk, belum diproses",
  );

  // -------------------------------------------------------------------
  // Biaya operasional
  // -------------------------------------------------------------------
  await must(
    supabase.from("operational_expenses").insert([
      {
        tanggal: tgl(14),
        kategori: "marketing",
        deskripsi: "Boost iklan marketplace (dummy)",
        jumlah: 100_000,
        is_dummy: true,
      },
      {
        tanggal: tgl(7),
        kategori: "admin_fee",
        deskripsi: "Biaya admin transfer bank (dummy)",
        jumlah: 15_000,
        is_dummy: true,
      },
    ]),
    "2 biaya operasional dicatat (marketing, admin fee)",
  );

  // -------------------------------------------------------------------
  // Rekonsiliasi bank — 1 cocok, 1 selisih (biar notifikasi ikut kepicu)
  // -------------------------------------------------------------------
  // Trigger set_mutasi_tercatat_di_app() membandingkan bank terhadap
  // saldo_kas_per_tanggal(tanggal baris ini) — BUKAN saldo total hari ini.
  // Dulu di sini dipakai saldo_kas_sekarang(), jadi baris yang niatnya
  // "cocok" malah selisih jutaan karena membandingkan saldo total terhadap
  // saldo per tanggal itu. Ambil angka per tanggal masing-masing.
  const saldoPer = async (tanggal) =>
    Number(
      await must(
        supabase.rpc("saldo_kas_per_tanggal", { p_tanggal: tanggal }),
        `Ambil saldo kas per ${tanggal}`,
      ),
    );

  const saldoCocok = await saldoPer(tgl(2));
  await must(
    supabase.from("bank_reconciliation").insert({
      tanggal: tgl(2),
      mutasi_bank_jago: saldoCocok,
      catatan: "Rekonsiliasi dummy — cocok",
      is_dummy: true,
    }),
    `Rekonsiliasi tanggal ${tgl(2)}: cocok (Rp${rp(saldoCocok)})`,
  );

  const saldoSelisih = await saldoPer(tgl(0));
  await must(
    supabase.from("bank_reconciliation").insert({
      tanggal: tgl(0),
      mutasi_bank_jago: saldoSelisih - 50_000,
      catatan: "Rekonsiliasi dummy — sengaja diselisihkan buat contoh notifikasi",
      is_dummy: true,
    }),
    `Rekonsiliasi tanggal ${tgl(0)}: selisih Rp50.000 (sengaja, buat contoh flag)`,
  );

  console.log("\n=== Selesai ===");
  console.log(
    "5 unit dummy (untung/rugi/batal/jalan/baru), capital call, kurir, biaya\n" +
      "operasional, dan rekonsiliasi sudah masuk. Buka aplikasi dan cek\n" +
      "dashboard/laporan — semuanya sekarang punya angka.\n\n" +
      'Sembunyikan kapan saja lewat menu "Data dummy" di aplikasi begitu mau\n' +
      "mulai pakai data asli. Tidak ada yang pernah dihapus permanen.",
  );
}

main();
