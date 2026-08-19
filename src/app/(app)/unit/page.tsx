import Link from "next/link";

import StatusBadge from "@/components/status-badge";
import { requireProfile } from "@/lib/auth";
import { formatRupiah, formatTanggal } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { ALUR_UTAMA, UNIT_STATUS_LABEL } from "@/lib/unit-status";
import type { UnitStatus } from "@/types/database";

export const metadata = { title: "Unit" };

const FILTER: { value: string; label: string }[] = [
  { value: "semua", label: "Semua" },
  ...ALUR_UTAMA.map((s) => ({ value: s, label: UNIT_STATUS_LABEL[s] })),
  { value: "cancelled_forfeited", label: UNIT_STATUS_LABEL.cancelled_forfeited },
];

export default async function UnitListPage(props: PageProps<"/unit">) {
  const params = await props.searchParams;
  const status = typeof params.status === "string" ? params.status : "semua";

  const profile = await requireProfile();
  const supabase = await createClient();

  // Tanpa filter investor_id — RLS yang membatasi baris mana yang kelihatan.
  let query = supabase
    .from("units")
    .select("*")
    .order("created_at", { ascending: false });

  if (status !== "semua") query = query.eq("status", status as UnitStatus);

  const { data: units, error } = await query;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Unit</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {profile.role === "investor"
              ? "Unit yang kamu danai."
              : "Seluruh unit beserta HPP dan margin."}
          </p>
        </div>

        {profile.role === "admin" && (
          <Link
            href="/unit/baru"
            className="rounded-lg bg-emerald-500 px-3.5 py-2 text-sm font-medium text-neutral-950 transition hover:bg-emerald-400"
          >
            + Unit baru
          </Link>
        )}
      </div>

      <nav className="flex flex-wrap gap-2">
        {FILTER.map((f) => (
          <Link
            key={f.value}
            href={f.value === "semua" ? "/unit" : `/unit?status=${f.value}`}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              status === f.value
                ? "border-neutral-600 bg-neutral-800 text-neutral-100"
                : "border-neutral-900 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {error && (
        <p className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          Gagal memuat unit: {error.message}
        </p>
      )}

      {units && units.length === 0 && (
        <p className="rounded-xl border border-neutral-900 bg-neutral-900/40 px-4 py-8 text-center text-sm text-neutral-400">
          Belum ada unit
          {status !== "semua" && " dengan status ini"}.
        </p>
      )}

      {units && units.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-neutral-900">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Model</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">HPP</th>
                <th className="px-4 py-3 text-right font-medium">Harga jual</th>
                <th className="px-4 py-3 text-right font-medium">Margin</th>
                <th className="px-4 py-3 font-medium">Dibeli</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-900">
              {units.map((u) => (
                <tr key={u.id} className="transition hover:bg-neutral-900/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/unit/${u.id}`}
                      className="font-medium text-neutral-100 hover:text-emerald-400"
                    >
                      {u.model}
                    </Link>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {u.tipe === "baru" ? "Baru" : "Bekas"}
                      {u.kode && ` · ${u.kode}`}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={u.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatRupiah(u.hpp_total)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatRupiah(u.harga_jual)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${
                      u.margin !== null && u.margin < 0 ? "text-red-400" : ""
                    }`}
                  >
                    {formatRupiah(u.margin)}
                  </td>
                  <td className="px-4 py-3 text-neutral-400">
                    {formatTanggal(u.tanggal_beli)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
