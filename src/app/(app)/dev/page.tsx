import { cookies } from "next/headers";

import DevGateForm from "@/components/dev-gate-form";
import { requirePenulis } from "@/lib/auth";
import { COOKIE_DEV } from "@/lib/dev-notes";

import { kunciCatatanDev } from "./actions";

export const metadata = { title: "Dev" };

function Catatan({
  judul,
  anak,
  nada,
}: {
  judul: string;
  anak: React.ReactNode;
  nada?: "penting";
}) {
  return (
    <section
      className={`rounded-xl border p-4 ${
        nada === "penting"
          ? "border-amber-900 bg-amber-950/30"
          : "border-neutral-900 bg-neutral-900/40"
      }`}
    >
      <h2
        className={`text-sm font-medium ${
          nada === "penting" ? "text-amber-200" : "text-neutral-200"
        }`}
      >
        {judul}
      </h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-neutral-400">
        {anak}
      </div>
    </section>
  );
}

export default async function DevPage() {
  await requirePenulis();

  const jar = await cookies();
  const terbuka = jar.get(COOKIE_DEV)?.value === "1";

  if (!terbuka) {
    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Dev</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Catatan operasional internal. Masukkan password untuk membuka.
          </p>
        </div>
        <DevGateForm />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Dev</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Catatan operasional yang gampang kelupaan. Urutannya penting.
          </p>
        </div>
        <form action={kunciCatatanDev}>
          <button
            type="submit"
            className="rounded-lg border border-neutral-800 px-3 py-1.5 text-xs text-neutral-400 transition hover:border-neutral-700 hover:text-neutral-200"
          >
            Kunci lagi
          </button>
        </form>
      </div>

      <Catatan
        nada="penting"
        judul="Urutan sebelum mulai pakai data asli"
        anak={
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>
              Undang satu user dengan role <code className="text-neutral-300">pemodal</code>.
              Sebelum ini ada, dropdown pemodal di form capital call kosong dan
              capital call tidak bisa dicatat sama sekali.
            </li>
            <li>
              Matikan toggle di menu <strong className="text-neutral-300">Data dummy</strong>.
            </li>
            <li>
              <strong className="text-neutral-300">Baru</strong> catat rekonsiliasi
              bank yang pertama.
            </li>
          </ol>
        }
      />

      <Catatan
        nada="penting"
        judul="Kenapa rekonsiliasi harus paling akhir"
        anak={
          <p>
            Rekonsiliasi satu-satunya angka yang <strong className="text-neutral-300">dibekukan</strong>,
            bukan dihitung ulang. Kolom <code className="text-neutral-300">mutasi_tercatat_di_app</code>{" "}
            dihitung sekali saat baris dibuat lalu disimpan permanen, dan{" "}
            <code className="text-neutral-300">selisih</code> diturunkan dari situ.
            Kalau dicatat sementara data dummy masih tampil, angka pembandingnya
            ikut menelan uang dummy dan salahnya nempel selamanya. Semua halaman
            lain menghitung ulang tiap dibuka, jadi cuma yang ini urutannya
            krusial.
          </p>
        }
      />

      <Catatan
        judul="Kode unit itu unik global — termasuk baris yang disembunyikan"
        anak={
          <p>
            Unique constraint tetap berlaku pada baris dummy yang tidak kelihatan.
            Kalau kode yang mau dipakai pernah terpakai data dummy, errornya
            “Kode unit sudah dipakai unit lain” untuk baris yang tidak muncul di
            mana pun — bingung nyarinya. Unit dummy/simulasi sengaja diberi
            prefix <code className="text-neutral-300">DUMMY-</code> dan{" "}
            <code className="text-neutral-300">SIM-</code>.
          </p>
        }
      />

      <Catatan
        judul="Backup harian tetap menyimpan data dummy"
        anak={
          <p>
            Cron backup jalan pakai service_role yang memang menembus RLS, jadi
            isinya apa adanya — itu benar untuk sebuah backup. Konsekuensinya:
            kalau nanti restore dari backup, data dummy ikut kembali (masih
            dalam keadaan tersembunyi selama togglenya mati).
          </p>
        }
      />

      <Catatan
        judul="Database sudah menyimpang dari folder migrasi"
        anak={
          <p>
            Kolom <code className="text-neutral-300">cash_ledger.urutan</code> dan
            definisi <code className="text-neutral-300">v_cash_ledger_running</code>{" "}
            yang berlaku di database tidak ada di file migrasi mana pun — pernah
            dijalankan manual lewat SQL Editor dan tidak ditulis balik. Kalau
            database dibangun ulang dari folder migrasi, halaman Kas langsung
            error karena <code className="text-neutral-300">urutan</code> tidak ada.
            Rekam dulu jadi migrasi sebelum rebuild atau restore.
          </p>
        }
      />

      <Catatan
        judul="Sembunyikan ≠ hapus"
        anak={
          <p>
            Toggle data dummy tidak pernah menghapus apa pun — aplikasi ini
            sengaja tidak bisa hard-delete data finansial. Baris dummy tetap ada
            di database selamanya dan bisa dimunculkan lagi kapan saja. Koreksi
            data selalu lewat baris baru dengan{" "}
            <code className="text-neutral-300">koreksi_dari_id</code>, bukan
            mengubah atau menghapus baris lama.
          </p>
        }
      />
    </div>
  );
}
