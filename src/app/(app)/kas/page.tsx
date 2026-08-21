import Link from "next/link";

import { bolehTulis, requireProfile } from "@/lib/auth";
import { formatRupiah, formatTanggal } from "@/lib/format";
import { KAS_KATEGORI_LABEL, tautanSumber } from "@/lib/kas";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Kas bisnis" };

export default async function KasPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: kas, error }, { data: saldo }] = await Promise.all([
    // Urutan HARUS sama persis dengan window `order by tanggal, urutan` yang
    // dipakai v_cash_ledger_running untuk menghitung saldo_running — cuma
    // dibalik. Mengurutkan pakai `urutan` saja bikin baris teracak relatif
    // terhadap deret saldonya, dan kolom Saldo jadi lompat-lompat.
    supabase
      .from("v_cash_ledger_running")
      .select("*")
      .order("tanggal", { ascending: false })
      .order("urutan", { ascending: false })
      .limit(200),
    supabase.rpc("saldo_kas_sekarang"),
  ]);

  const adaSaldoAwal = (kas ?? []).some((k) => k.kategori === "saldo_awal");
  const isAdmin = bolehTulis(profile.role);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Kas bisnis</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Semua uang masuk/keluar dompet Bank Jago dalam satu catatan.
          </p>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            {!adaSaldoAwal && (
              <Link
                href="/kas/saldo-awal"
                className="rounded-lg border border-amber-800 bg-amber-950/40 px-3.5 py-2 text-sm text-amber-200 transition hover:bg-amber-950"
              >
                Set saldo awal
              </Link>
            )}
            <Link
              href="/kas/pengeluaran"
              className="rounded-lg bg-emerald-500 px-3.5 py-2 text-sm font-medium text-neutral-950 transition hover:bg-emerald-400"
            >
              + Biaya operasional
            </Link>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-neutral-900 bg-neutral-900/40 p-4">
        <p className="text-xs uppercase tracking-wide text-neutral-500">
          Saldo kas saat ini
        </p>
        <p
          className={`mt-1.5 text-2xl font-semibold tabular-nums ${
            Number(saldo ?? 0) < 0 ? "text-red-400" : ""
          }`}
        >
          {formatRupiah(saldo ?? 0)}
        </p>
        {Number(saldo ?? 0) < 0 && (
          <p className="mt-1 text-xs text-red-400">
            Saldo negatif — kemungkinan saldo awal belum dicatat.
          </p>
        )}
      </div>

      {isAdmin && !adaSaldoAwal && (kas ?? []).length > 0 && (
        <p className="rounded-lg border border-amber-900 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
          Saldo awal belum dicatat, jadi angka di atas baru menghitung mutasi
          sejak sistem ini dipakai — belum termasuk uang yang sudah ada di
          dompet Jago sebelumnya.
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          Gagal memuat kas: {error.message}
        </p>
      )}

      {kas && kas.length === 0 ? (
        <p className="rounded-xl border border-neutral-900 bg-neutral-900/40 px-4 py-8 text-center text-sm text-neutral-400">
          Belum ada pergerakan kas.
        </p>
      ) : (
        kas && (
          <div className="overflow-x-auto rounded-xl border border-neutral-900">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Tanggal</th>
                  <th className="px-4 py-3 font-medium">Kategori</th>
                  <th className="px-4 py-3 font-medium">Keterangan</th>
                  <th className="px-4 py-3 text-right font-medium">Jumlah</th>
                  <th className="px-4 py-3 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900">
                {kas.map((k) => {
                  const href = tautanSumber(k.ref_table, k.ref_id);
                  return (
                    <tr key={k.id} className="transition hover:bg-neutral-900/40">
                      <td className="px-4 py-3 text-neutral-400">
                        {formatTanggal(k.tanggal)}
                      </td>
                      <td className="px-4 py-3">
                        {KAS_KATEGORI_LABEL[k.kategori]}
                      </td>
                      <td className="px-4 py-3 text-neutral-400">
                        {href ? (
                          <Link href={href} className="hover:text-emerald-400">
                            {k.deskripsi ?? "—"}
                          </Link>
                        ) : (
                          (k.deskripsi ?? "—")
                        )}
                      </td>
                      <td
                        className={`px-4 py-3 text-right tabular-nums ${
                          k.tipe === "in" ? "text-emerald-300" : "text-amber-300"
                        }`}
                      >
                        {k.tipe === "in" ? "+" : "−"}
                        {formatRupiah(k.jumlah).replace("Rp", "Rp ")}
                      </td>
                      <td
                        className={`px-4 py-3 text-right tabular-nums ${
                          Number(k.saldo_running) < 0 ? "text-red-400" : ""
                        }`}
                      >
                        {formatRupiah(k.saldo_running)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
