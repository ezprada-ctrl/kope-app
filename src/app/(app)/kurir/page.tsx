import Link from "next/link";

import { bolehTulis, requireProfile } from "@/lib/auth";
import { formatRupiah, formatTanggal } from "@/lib/format";
import {
  COURIER_STATUS_LABEL,
  COURIER_STATUS_TONE,
  COURIER_TIPE_LABEL,
} from "@/lib/kurir";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Kurir" };

export default async function KurirPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const isAdmin = bolehTulis(profile.role);

  const [{ data: kurirs }, { data: transaksi, error }] = await Promise.all([
    supabase.from("courier_master").select("*").order("aktif", { ascending: false }).order("nama"),
    supabase
      .from("v_courier_transactions")
      .select("*")
      .order("tanggal", { ascending: false })
      .limit(100),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Kurir</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Daftar kurir dan riwayat fee yang dibayarkan.
          </p>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Link
              href="/kurir/baru"
              className="rounded-lg border border-neutral-800 px-3.5 py-2 text-sm text-neutral-200 transition hover:border-neutral-700"
            >
              + Kurir
            </Link>
            <Link
              href="/kurir/transaksi"
              className="rounded-lg bg-emerald-500 px-3.5 py-2 text-sm font-medium text-neutral-950 transition hover:bg-emerald-400"
            >
              + Transaksi
            </Link>
          </div>
        )}
      </div>

      {/* Daftar kurir */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-200">Daftar kurir</h2>

        {!kurirs || kurirs.length === 0 ? (
          <p className="rounded-xl border border-neutral-900 bg-neutral-900/40 px-4 py-8 text-center text-sm text-neutral-400">
            Belum ada kurir terdaftar.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-900 rounded-xl border border-neutral-900">
            {kurirs.map((k) => (
              <li
                key={k.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <div>
                  <span className="font-medium">{k.nama}</span>
                  {!k.aktif && (
                    <span className="ml-2 rounded-full border border-neutral-800 px-2 py-0.5 text-xs text-neutral-500">
                      nonaktif
                    </span>
                  )}
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {k.kontak ?? "tanpa kontak"} · bergabung{" "}
                    {formatTanggal(k.tanggal_bergabung)}
                  </p>
                </div>

                {isAdmin && (
                  <Link
                    href={`/kurir/${k.id}`}
                    className="text-xs text-neutral-400 transition hover:text-neutral-100"
                  >
                    Edit
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Riwayat transaksi */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-200">Riwayat transaksi</h2>

        {error && (
          <p className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
            Gagal memuat transaksi: {error.message}
          </p>
        )}

        {transaksi && transaksi.length === 0 ? (
          <p className="rounded-xl border border-neutral-900 bg-neutral-900/40 px-4 py-8 text-center text-sm text-neutral-400">
            Belum ada transaksi kurir.
          </p>
        ) : (
          transaksi && (
            <div className="overflow-x-auto rounded-xl border border-neutral-900">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Tanggal</th>
                    <th className="px-4 py-3 font-medium">Kurir</th>
                    <th className="px-4 py-3 font-medium">Jenis</th>
                    <th className="px-4 py-3 font-medium">Unit</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Fee</th>
                    <th className="px-4 py-3 text-right font-medium">Bensin</th>
                    <th className="px-4 py-3 text-right font-medium">Diterima</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-900">
                  {transaksi.map((t) => (
                    <tr key={t.id} className="transition hover:bg-neutral-900/40">
                      <td className="px-4 py-3 text-neutral-400">
                        {formatTanggal(t.tanggal)}
                      </td>
                      <td className="px-4 py-3">{t.courier_nama}</td>
                      <td className="px-4 py-3 text-neutral-400">
                        {COURIER_TIPE_LABEL[t.tipe]}
                      </td>
                      <td className="px-4 py-3">
                        {t.unit_id ? (
                          <Link
                            href={`/unit/${t.unit_id}`}
                            className="text-neutral-300 hover:text-emerald-400"
                          >
                            {t.unit_model}
                          </Link>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs ${COURIER_STATUS_TONE[t.status]}`}
                        >
                          {COURIER_STATUS_LABEL[t.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatRupiah(t.fee_gross)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-neutral-400">
                        {formatRupiah(t.reimbursement_bensin)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {formatRupiah(t.fee_net_kurir)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>
    </div>
  );
}
