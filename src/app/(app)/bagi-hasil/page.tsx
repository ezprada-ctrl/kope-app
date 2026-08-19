import Link from "next/link";

import PorsiForm from "@/components/porsi-form";
import { bolehTulis, requireProfile } from "@/lib/auth";
import { formatPersen, formatRupiah, formatTanggal } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Bagi hasil" };

export default async function BagiHasilPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: settings }, { data: splits }] = await Promise.all([
    supabase
      .from("profit_share_settings")
      .select("*")
      .order("effective_date", { ascending: false })
      .limit(20),
    // RLS: pemodal hanya melihat baris untuk unit yang dia danai.
    supabase
      .from("v_profit_ringkasan")
      .select("*")
      .order("tanggal_settle", { ascending: false })
      .limit(100),
  ]);

  const aktif = settings?.[0] ?? null;
  const riwayat = splits ?? [];

  // Total keuntungan sesuai role yang sedang login.
  const totalSaya = riwayat.reduce((sum, r) => {
    if (profile.role === "pemodal") return sum + Number(r.pemodal_profit ?? 0);
    if (profile.role === "owner_partner")
      return sum + Number(r.partner_final_profit ?? 0);
    return sum + Number(r.admin_final_profit ?? 0);
  }, 0);

  const totalMargin = riwayat.reduce(
    (sum, r) => sum + Number(r.margin_bruto ?? 0),
    0,
  );

  const labelSaya =
    profile.role === "pemodal"
      ? "Keuntungan pemodal"
      : profile.role === "owner_partner"
        ? "Keuntungan partner"
        : "Keuntungan admin";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Bagi hasil</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Skema pembagian margin dan riwayat keuntungan per unit yang sudah
          settled.
        </p>
      </div>

      {/* Skema aktif */}
      <section className="rounded-xl border border-neutral-900 bg-neutral-900/40 p-4">
        <h2 className="mb-3 text-sm font-medium text-neutral-200">
          Skema yang berlaku
        </h2>

        {aktif ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-neutral-500">
                Pemodal
              </p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums">
                {formatPersen(aktif.pemodal_percentage)}
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">dari margin bruto</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-neutral-500">
                Admin
              </p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums">
                {formatPersen(aktif.owner_admin_percentage)}
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">dari sisa margin</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-neutral-500">
                Partner
              </p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums">
                {formatPersen(aktif.owner_partner_percentage)}
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">dari sisa margin</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-neutral-400">Belum ada setting.</p>
        )}
      </section>

      {/* Ubah porsi — admin only */}
      {bolehTulis(profile.role) && aktif && (
        <section className="space-y-4 rounded-xl border border-neutral-900 bg-neutral-900/40 p-4">
          <h2 className="text-sm font-medium text-neutral-200">
            Ubah porsi pemodal
          </h2>
          <PorsiForm sekarang={Number(aktif.pemodal_percentage)} />
        </section>
      )}

      {/* Ringkasan keuntungan */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-900 bg-neutral-900/40 p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Unit settled
          </p>
          <p className="mt-1.5 text-xl font-semibold tabular-nums">
            {riwayat.length}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-900 bg-neutral-900/40 p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Total margin
          </p>
          <p
            className={`mt-1.5 text-xl font-semibold tabular-nums ${totalMargin < 0 ? "text-red-400" : ""}`}
          >
            {formatRupiah(totalMargin)}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-900 bg-neutral-900/40 p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            {labelSaya}
          </p>
          <p
            className={`mt-1.5 text-xl font-semibold tabular-nums ${totalSaya < 0 ? "text-red-400" : "text-emerald-400"}`}
          >
            {formatRupiah(totalSaya)}
          </p>
        </div>
      </div>

      {/* Riwayat per unit */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-200">
          Riwayat per unit
        </h2>

        {riwayat.length === 0 ? (
          <p className="rounded-xl border border-neutral-900 bg-neutral-900/40 px-4 py-8 text-center text-sm text-neutral-400">
            Belum ada unit yang di-settle.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-neutral-900">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Unit</th>
                  <th className="px-4 py-3 font-medium">Settled</th>
                  <th className="px-4 py-3 text-right font-medium">Margin</th>
                  <th className="px-4 py-3 text-right font-medium">Pemodal</th>
                  <th className="px-4 py-3 text-right font-medium">Admin</th>
                  <th className="px-4 py-3 text-right font-medium">Partner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900">
                {riwayat.map((r) => (
                  <tr key={r.unit_id} className="transition hover:bg-neutral-900/40">
                    <td className="px-4 py-3">
                      <Link
                        href={`/unit/${r.unit_id}`}
                        className="font-medium text-neutral-100 hover:text-emerald-400"
                      >
                        {r.model}
                      </Link>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        porsi pemodal {formatPersen(r.pemodal_percentage)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-neutral-400">
                      {formatTanggal(r.tanggal_settle)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums ${Number(r.margin_bruto) < 0 ? "text-red-400" : ""}`}
                    >
                      {formatRupiah(r.margin_bruto)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatRupiah(r.pemodal_profit)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatRupiah(r.admin_final_profit)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatRupiah(r.partner_final_profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Riwayat perubahan setting */}
      {settings && settings.length > 1 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-neutral-200">
            Riwayat perubahan skema
          </h2>
          <ul className="divide-y divide-neutral-900 rounded-xl border border-neutral-900">
            {settings.map((s, i) => (
              <li
                key={s.id}
                className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm"
              >
                <span>
                  Pemodal {formatPersen(s.pemodal_percentage)}
                  {i === 0 && (
                    <span className="ml-2 rounded-full border border-emerald-900 bg-emerald-950/60 px-2 py-0.5 text-xs text-emerald-300">
                      aktif
                    </span>
                  )}
                  {s.catatan && (
                    <span className="ml-2 text-neutral-500">· {s.catatan}</span>
                  )}
                </span>
                <span className="text-neutral-500">
                  {formatTanggal(s.effective_date)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
