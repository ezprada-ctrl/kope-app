import DataDummyForm from "@/components/data-dummy-form";
import { requirePenulis } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Data dummy" };

export default async function DataDummyPage() {
  await requirePenulis();
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("app_settings")
    .select("tampilkan_data_dummy")
    .single();

  const tampilkan = settings?.tampilkan_data_dummy ?? true;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Data dummy</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Data contoh buat latihan dan demo, terpisah dari data asli.
        </p>
      </div>

      <div className="rounded-xl border border-neutral-900 bg-neutral-900/40 p-4">
        <p className="text-sm text-neutral-300">
          Status sekarang:{" "}
          <span
            className={
              tampilkan
                ? "font-medium text-emerald-400"
                : "font-medium text-neutral-500"
            }
          >
            {tampilkan ? "Ditampilkan" : "Disembunyikan"}
          </span>
        </p>
        <p className="mt-2 text-sm text-neutral-400">
          {tampilkan
            ? "Unit, transaksi, dan angka contoh muncul di semua halaman (dashboard, laporan, daftar) — cocok buat latihan sendiri atau didemoin ke orang lain sebelum data asli mulai masuk."
            : "Data contoh disembunyikan dari semua halaman. Angka yang tampil sekarang murni dari data asli."}
        </p>
      </div>

      <DataDummyForm tampilkanSaatIni={tampilkan} />

      <p className="rounded-xl border border-neutral-900 bg-neutral-900/40 px-4 py-3 text-xs text-neutral-500">
        Tombol ini menyembunyikan, <strong className="text-neutral-300">bukan menghapus</strong>.
        Aplikasi ini sengaja tidak bisa hard-delete data finansial — jadi baris
        dummy tetap ada di database selamanya, cuma tidak lagi muncul di mana
        pun begitu disembunyikan. Bisa ditampilkan lagi kapan saja tanpa
        kehilangan apa pun, dan data asli tidak pernah tersentuh oleh tombol
        ini.
      </p>
    </div>
  );
}
