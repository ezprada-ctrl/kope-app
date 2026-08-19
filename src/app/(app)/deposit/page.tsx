import Link from "next/link";

import { ResolveForm } from "@/components/deposit-forms";
import { bolehTulis, requireProfile } from "@/lib/auth";
import { formatRupiah, formatTanggal } from "@/lib/format";
import {
  DEPOSIT_STATUS_LABEL,
  DEPOSIT_STATUS_TONE,
  PAYER_LABEL,
} from "@/lib/kurir";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Deposit pembatalan" };

export default async function DepositPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const isAdmin = bolehTulis(profile.role);

  const { data: deposits, error } = await supabase
    .from("v_cancellation_deposits")
    .select("*")
    .order("tanggal", { ascending: false })
    .limit(100);

  const pending = (deposits ?? []).filter((d) => d.status === "pending");
  // Yang jadi revenue cuma bagian yang benar-benar hangus (sebesar kerugian
  // riil), bukan seluruh deposit — sisanya wajib dikembalikan ke customer.
  const totalHangus = (deposits ?? [])
    .filter((d) => d.status === "forfeited_as_revenue")
    .reduce((s, d) => s + Number(d.jumlah_ditahan), 0);
  const totalDikembalikan = (deposits ?? [])
    .filter((d) => d.status === "forfeited_as_revenue")
    .reduce((s, d) => s + Number(d.jumlah_dikembalikan), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Deposit pembatalan</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Uang muka yang ditahan sebelum COD, buat nutup risiko batal.
          </p>
        </div>

        {isAdmin && (
          <Link
            href="/deposit/baru"
            className="rounded-lg bg-emerald-500 px-3.5 py-2 text-sm font-medium text-neutral-950 transition hover:bg-emerald-400"
          >
            + Deposit
          </Link>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-900 bg-neutral-900/40 p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Menunggu keputusan
          </p>
          <p className="mt-1.5 text-xl font-semibold tabular-nums">
            {pending.length}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-900 bg-neutral-900/40 p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Nilai ditahan
          </p>
          <p className="mt-1.5 text-xl font-semibold tabular-nums">
            {formatRupiah(pending.reduce((s, d) => s + Number(d.jumlah), 0))}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-900 bg-neutral-900/40 p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Total hangus jadi revenue
          </p>
          <p className="mt-1.5 text-xl font-semibold tabular-nums text-emerald-400">
            {formatRupiah(totalHangus)}
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          Gagal memuat deposit: {error.message}
        </p>
      )}

      {deposits && deposits.length === 0 ? (
        <p className="rounded-xl border border-neutral-900 bg-neutral-900/40 px-4 py-8 text-center text-sm text-neutral-400">
          Belum ada deposit tercatat.
        </p>
      ) : (
        deposits && (
          <div className="overflow-x-auto rounded-xl border border-neutral-900">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Tanggal</th>
                  <th className="px-4 py-3 font-medium">Unit</th>
                  <th className="px-4 py-3 font-medium">Pembayar</th>
                  <th className="px-4 py-3 text-right font-medium">Jumlah</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  {isAdmin && <th className="px-4 py-3 font-medium">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900">
                {deposits.map((d) => (
                  <tr key={d.id} className="transition hover:bg-neutral-900/40">
                    <td className="px-4 py-3 text-neutral-400">
                      {formatTanggal(d.tanggal)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/unit/${d.unit_id}`}
                        className="text-neutral-200 hover:text-emerald-400"
                      >
                        {d.unit_model}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-neutral-400">
                      {PAYER_LABEL[d.dibayar_oleh]}
                      {d.nama_pembayar && ` · ${d.nama_pembayar}`}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatRupiah(d.jumlah)}
                      {d.kerugian_riil_total > 0 && (
                        <p className="mt-0.5 text-xs text-neutral-500">
                          hangus {formatRupiah(d.jumlah_ditahan)} · kembali{" "}
                          {formatRupiah(d.jumlah_dikembalikan)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs ${DEPOSIT_STATUS_TONE[d.status]}`}
                      >
                        {DEPOSIT_STATUS_LABEL[d.status]}
                      </span>
                      {d.tanggal_resolve && (
                        <p className="mt-0.5 text-xs text-neutral-600">
                          {formatTanggal(d.tanggal_resolve)}
                        </p>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        {d.status === "pending" ? (
                          <ResolveForm depositId={d.id} />
                        ) : (
                          <span className="text-xs text-neutral-600">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <p className="rounded-xl border border-neutral-900 bg-neutral-900/40 px-4 py-3 text-xs text-neutral-500">
        <strong className="text-neutral-300">Deal jadi</strong> — deposit
        diperhitungkan sebagai cicilan harga, jadi saat unit ditandai
        &ldquo;Terkirim &amp; dibayar&rdquo; kas masuk hanya sebesar sisanya.{" "}
        <strong className="text-neutral-300">Batal, hangus</strong> — yang hangus
        hanya sebesar kerugian riil (bensin + upah kurir); sisanya wajib
        dikembalikan ke customer dan otomatis tercatat sebagai kas keluar.
        Rincian kerugian wajib diisi dulu, kalau tidak deposit tidak bisa
        dinyatakan hangus.
        {totalDikembalikan > 0 && (
          <>
            {" "}
            Sudah dikembalikan:{" "}
            <strong className="text-neutral-300">
              {formatRupiah(totalDikembalikan)}
            </strong>
            .
          </>
        )}
      </p>
    </div>
  );
}
