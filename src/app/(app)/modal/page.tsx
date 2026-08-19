import Link from "next/link";

import { bolehTulis, requireProfile } from "@/lib/auth";
import { formatRupiah, formatTanggal } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { LedgerTipe } from "@/types/database";

export const metadata = { title: "Modal pemodal" };

const TIPE_LABEL: Record<LedgerTipe, string> = {
  capital_call: "Capital call",
  return_of_capital: "Return of capital",
  profit_share: "Bagi hasil",
};

const TIPE_TONE: Record<LedgerTipe, string> = {
  capital_call: "border-amber-900 bg-amber-950/60 text-amber-300",
  return_of_capital: "border-emerald-900 bg-emerald-950/60 text-emerald-300",
  profit_share: "border-sky-900 bg-sky-950/60 text-sky-300",
};

function Bar({ terpakai, plafon }: { terpakai: number; plafon: number | null }) {
  if (!plafon || plafon <= 0) return null;
  const persen = Math.min(100, Math.round((terpakai / plafon) * 100));
  const penuh = persen >= 90;

  return (
    <div className="mt-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
        <div
          className={`h-full rounded-full ${penuh ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${persen}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-neutral-500">{persen}% plafon terpakai</p>
    </div>
  );
}

export default async function ModalPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  // RLS: pemodal cuma dapat barisnya sendiri di kedua query ini.
  const [{ data: ringkasan }, { data: ledger, error }] = await Promise.all([
    supabase.from("v_pemodal_outstanding").select("*").order("nama"),
    supabase
      .from("pemodal_ledger")
      .select("*")
      .order("tanggal", { ascending: false })
      .limit(100),
  ]);

  // Nama pemodal & model unit untuk label baris ledger.
  const [{ data: profiles }, { data: units }] = await Promise.all([
    supabase.from("profiles").select("id, nama"),
    supabase.from("units").select("id, model"),
  ]);

  const namaPemodal = new Map((profiles ?? []).map((p) => [p.id, p.nama]));
  const modelUnit = new Map((units ?? []).map((u) => [u.id, u.model]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Modal pemodal</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {profile.role === "pemodal"
              ? "Posisi modal dan riwayat transaksimu."
              : "Outstanding, plafon, dan riwayat pergerakan modal."}
          </p>
        </div>

        {bolehTulis(profile.role) && (
          <Link
            href="/modal/baru"
            className="rounded-lg bg-emerald-500 px-3.5 py-2 text-sm font-medium text-neutral-950 transition hover:bg-emerald-400"
          >
            + Catat modal
          </Link>
        )}
      </div>

      {/* Ringkasan per pemodal */}
      {ringkasan && ringkasan.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {ringkasan.map((r) => (
            <div
              key={r.pemodal_id}
              className="rounded-xl border border-neutral-900 bg-neutral-900/40 p-4"
            >
              <p className="font-medium">{r.nama}</p>

              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-neutral-400">Outstanding</dt>
                  <dd className="font-semibold tabular-nums">
                    {formatRupiah(r.outstanding)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-400">Plafon</dt>
                  <dd className="tabular-nums">{formatRupiah(r.plafon_aktif)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-400">Sisa plafon</dt>
                  <dd className="tabular-nums text-emerald-400">
                    {formatRupiah(r.sisa_plafon)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-neutral-800 pt-1.5">
                  <dt className="text-neutral-400">Total bagi hasil diterima</dt>
                  <dd className="tabular-nums">
                    {formatRupiah(r.total_profit_share)}
                  </dd>
                </div>
              </dl>

              <Bar terpakai={Number(r.outstanding)} plafon={r.plafon_aktif} />
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-neutral-900 bg-neutral-900/40 px-4 py-6 text-center text-sm text-neutral-400">
          Belum ada pemodal terdaftar. Tambahkan user dengan role{" "}
          <code className="text-neutral-300">pemodal</code> lebih dulu.
        </p>
      )}

      {/* Riwayat ledger */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-200">
          Riwayat pergerakan modal
        </h2>

        {error && (
          <p className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
            Gagal memuat ledger: {error.message}
          </p>
        )}

        {ledger && ledger.length === 0 && (
          <p className="rounded-xl border border-neutral-900 bg-neutral-900/40 px-4 py-8 text-center text-sm text-neutral-400">
            Belum ada transaksi modal.
          </p>
        )}

        {ledger && ledger.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-neutral-900">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Tanggal</th>
                  <th className="px-4 py-3 font-medium">Pemodal</th>
                  <th className="px-4 py-3 font-medium">Jenis</th>
                  <th className="px-4 py-3 font-medium">Unit</th>
                  <th className="px-4 py-3 text-right font-medium">Jumlah</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900">
                {ledger.map((l) => (
                  <tr key={l.id} className="transition hover:bg-neutral-900/40">
                    <td className="px-4 py-3 text-neutral-400">
                      {formatTanggal(l.tanggal)}
                    </td>
                    <td className="px-4 py-3">
                      {namaPemodal.get(l.pemodal_id) ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs ${TIPE_TONE[l.tipe]}`}
                      >
                        {TIPE_LABEL[l.tipe]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {l.unit_id ? (
                        <Link
                          href={`/unit/${l.unit_id}`}
                          className="text-neutral-300 hover:text-emerald-400"
                        >
                          {modelUnit.get(l.unit_id) ?? "Unit"}
                        </Link>
                      ) : (
                        <span className="text-neutral-500">Kas pool</span>
                      )}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums ${
                        l.tipe === "capital_call"
                          ? "text-amber-300"
                          : "text-emerald-300"
                      }`}
                    >
                      {l.tipe === "capital_call" ? "+" : "−"}
                      {formatRupiah(l.jumlah).replace("Rp", "Rp ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
