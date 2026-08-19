import Link from "next/link";

import { bolehTulis, requireProfile } from "@/lib/auth";
import { formatRupiah, formatTanggal } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Rekonsiliasi bank" };

export default async function RekonsiliasiPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const isAdmin = bolehTulis(profile.role);

  const { data: entries, error } = await supabase
    .from("v_bank_reconciliation")
    .select("*")
    .order("tanggal", { ascending: false })
    .limit(50);

  const jumlahSelisih = (entries ?? []).filter((e) => e.flagged).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Rekonsiliasi bank</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Saldo Bank Jago dibandingkan terhadap kas yang tercatat di app.
          </p>
        </div>

        {isAdmin && (
          <Link
            href="/rekonsiliasi/baru"
            className="rounded-lg bg-emerald-500 px-3.5 py-2 text-sm font-medium text-neutral-950 transition hover:bg-emerald-400"
          >
            + Catat rekonsiliasi
          </Link>
        )}
      </div>

      {jumlahSelisih > 0 && (
        <p className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          {jumlahSelisih} entri punya selisih antara saldo Bank Jago dan yang
          tercatat di app. Cek baris yang ditandai merah di bawah.
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          Gagal memuat rekonsiliasi: {error.message}
        </p>
      )}

      {entries && entries.length === 0 ? (
        <p className="rounded-xl border border-neutral-900 bg-neutral-900/40 px-4 py-8 text-center text-sm text-neutral-400">
          Belum ada rekonsiliasi tercatat.
        </p>
      ) : (
        entries && (
          <div className="overflow-x-auto rounded-xl border border-neutral-900">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Tanggal</th>
                  <th className="px-4 py-3 text-right font-medium">Bank Jago</th>
                  <th className="px-4 py-3 text-right font-medium">Tercatat di app</th>
                  <th className="px-4 py-3 text-right font-medium">Selisih</th>
                  <th className="px-4 py-3 font-medium">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900">
                {entries.map((e) => (
                  <tr
                    key={e.id}
                    className={`transition hover:bg-neutral-900/40 ${
                      e.flagged ? "bg-red-950/20" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-neutral-400">
                      {formatTanggal(e.tanggal)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatRupiah(e.mutasi_bank_jago)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-400">
                      {formatRupiah(e.mutasi_tercatat_di_app)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium tabular-nums ${
                        e.flagged ? "text-red-400" : "text-emerald-400"
                      }`}
                    >
                      {e.flagged ? formatRupiah(e.selisih) : "Cocok"}
                    </td>
                    <td className="px-4 py-3 text-neutral-400">
                      {e.catatan ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
