import Link from "next/link";
import { notFound } from "next/navigation";

import StatusBadge from "@/components/status-badge";
import { bolehTulis, requireProfile } from "@/lib/auth";
import { formatPersen, formatRupiah, formatTanggal } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
  ALUR_UTAMA,
  statusFinal,
  transisiBerikutnya,
  UNIT_STATUS_KETERANGAN,
  UNIT_STATUS_LABEL,
} from "@/lib/unit-status";
import StatusForm from "./status-form";

export const metadata = { title: "Detail unit" };

function Baris({
  label,
  value,
  tebal,
  merah,
}: {
  label: string;
  value: string;
  tebal?: boolean;
  merah?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-2 ${
        tebal ? "border-t border-neutral-800 font-semibold" : ""
      }`}
    >
      <span className={tebal ? "text-neutral-200" : "text-neutral-400"}>
        {label}
      </span>
      <span
        className={`tabular-nums ${merah ? "text-red-400" : "text-neutral-100"}`}
      >
        {value}
      </span>
    </div>
  );
}

export default async function UnitDetailPage(props: PageProps<"/unit/[id]">) {
  const { id } = await props.params;

  const profile = await requireProfile();
  const supabase = await createClient();

  // RLS: pemodal otomatis dapat 0 baris untuk unit yang bukan dia danai.
  const { data: unit } = await supabase
    .from("units")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!unit) notFound();

  const [{ data: pemodal }, { data: modalTertahan }, { data: split }] =
    await Promise.all([
      unit.pemodal_id
        ? supabase
            .from("profiles")
            .select("nama")
            .eq("id", unit.pemodal_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.rpc("modal_tertahan_unit", { p_unit_id: unit.id }),
      supabase
        .from("v_profit_ringkasan")
        .select("*")
        .eq("unit_id", unit.id)
        .maybeSingle(),
    ]);

  const lanjutan = transisiBerikutnya(unit.status);
  const indexAlur = ALUR_UTAMA.indexOf(unit.status);
  const isAdmin = bolehTulis(profile.role);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/unit"
          className="text-sm text-neutral-400 transition hover:text-neutral-200"
        >
          ← Unit
        </Link>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{unit.model}</h1>
            <p className="mt-1 text-sm text-neutral-400">
              {unit.tipe === "baru" ? "Baru" : "Bekas"}
              {unit.kondisi && ` · ${unit.kondisi}`}
              {unit.kode && ` · ${unit.kode}`}
              {unit.imei && ` · IMEI ${unit.imei}`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <StatusBadge status={unit.status} />
            {isAdmin && (
              <Link
                href={`/unit/${unit.id}/edit`}
                className="rounded-lg border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 transition hover:border-neutral-700 hover:text-neutral-100"
              >
                Edit
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Stepper alur utama */}
      {indexAlur >= 0 && (
        <ol className="flex flex-wrap gap-x-2 gap-y-1 text-xs">
          {ALUR_UTAMA.map((s, i) => (
            <li
              key={s}
              className={
                i < indexAlur
                  ? "text-emerald-500"
                  : i === indexAlur
                    ? "font-medium text-neutral-100"
                    : "text-neutral-600"
              }
            >
              {UNIT_STATUS_LABEL[s]}
              {i < ALUR_UTAMA.length - 1 && (
                <span className="ml-2 text-neutral-700">→</span>
              )}
            </li>
          ))}
        </ol>
      )}

      <p className="rounded-lg border border-neutral-900 bg-neutral-900/40 px-3 py-2 text-sm text-neutral-400">
        {UNIT_STATUS_KETERANGAN[unit.status]}
      </p>

      {/* Transisi status — admin only */}
      {isAdmin &&
        (lanjutan.length > 0 ? (
          <section className="space-y-3 rounded-xl border border-neutral-900 bg-neutral-900/40 p-4">
            <h2 className="text-sm font-medium text-neutral-200">
              Pindahkan status
            </h2>
            <StatusForm unitId={unit.id} pilihan={lanjutan} />
          </section>
        ) : (
          statusFinal(unit.status) && (
            <p className="rounded-xl border border-neutral-900 bg-neutral-900/40 px-4 py-3 text-sm text-neutral-400">
              Status ini final — tidak ada transisi lanjutan.
            </p>
          )
        ))}

      {/* Breakdown biaya */}
      <section className="rounded-xl border border-neutral-900 bg-neutral-900/40 p-4">
        <h2 className="mb-2 text-sm font-medium text-neutral-200">
          Breakdown biaya
        </h2>

        <div className="grid gap-x-8 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-neutral-500">
              Sisi beli
            </p>
            <Baris label="Harga beli" value={formatRupiah(unit.harga_beli)} />
            <Baris
              label="Kurir ambil"
              value={formatRupiah(unit.biaya_kurir_ambil)}
            />
            <Baris label="Refurbish" value={formatRupiah(unit.biaya_refurbish)} />
            <Baris label="HPP total" value={formatRupiah(unit.hpp_total)} tebal />
          </div>

          <div>
            <p className="mb-1 mt-4 text-xs uppercase tracking-wide text-neutral-500 sm:mt-0">
              Sisi jual
            </p>
            <Baris label="Harga jual" value={formatRupiah(unit.harga_jual)} />
            <Baris
              label="Kurir antar"
              value={formatRupiah(unit.biaya_kurir_antar)}
            />
            <Baris
              label="Admin / packing"
              value={formatRupiah(unit.biaya_admin_packing)}
            />
            <Baris
              label="Margin"
              value={formatRupiah(unit.margin)}
              tebal
              merah={unit.margin !== null && unit.margin < 0}
            />
          </div>
        </div>

        <p className="mt-3 border-t border-neutral-800 pt-3 text-xs text-neutral-500">
          HPP dan margin dihitung otomatis oleh database (kolom generated), jadi
          nilainya tidak bisa berbeda dari komponen biayanya.
        </p>
      </section>

      {/* Bagi hasil — hanya ada setelah unit di-settle */}
      {split && (
        <section className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-4">
          <h2 className="mb-2 text-sm font-medium text-neutral-200">
            Bagi hasil
          </h2>
          <Baris label="Margin bruto" value={formatRupiah(split.margin_bruto)} />
          <Baris
            label={`Pemodal (${formatPersen(split.pemodal_percentage)})`}
            value={formatRupiah(split.pemodal_profit)}
          />
          <Baris
            label={`Admin (${formatPersen(split.owner_admin_percentage)} dari sisa)`}
            value={formatRupiah(split.admin_final_profit)}
          />
          <Baris
            label={`Partner (${formatPersen(split.owner_partner_percentage)} dari sisa)`}
            value={formatRupiah(split.partner_final_profit)}
          />
          <p className="mt-3 border-t border-neutral-800 pt-3 text-xs text-neutral-500">
            Dihitung sekali saat unit di-settle memakai skema yang berlaku saat
            itu. Perubahan skema setelahnya tidak mengubah angka ini.
          </p>
        </section>
      )}

      {/* Meta */}
      <section className="rounded-xl border border-neutral-900 bg-neutral-900/40 p-4">
        <h2 className="mb-2 text-sm font-medium text-neutral-200">Informasi</h2>
        <Baris
          label="Sumber dana"
          value={pemodal?.nama ?? "Modal sendiri / kas pool"}
        />
        <Baris
          label="Modal pemodal tertahan"
          value={formatRupiah(modalTertahan ?? 0)}
        />
        <Baris label="Tanggal beli" value={formatTanggal(unit.tanggal_beli)} />
        <Baris label="Tanggal jual" value={formatTanggal(unit.tanggal_jual)} />
        <Baris label="Settled" value={formatTanggal(unit.tanggal_settle)} />
        {unit.catatan && (
          <div className="mt-3 border-t border-neutral-800 pt-3">
            <p className="text-xs uppercase tracking-wide text-neutral-500">
              Catatan
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-300">
              {unit.catatan}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
