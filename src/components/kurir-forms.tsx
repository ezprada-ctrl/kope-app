"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  simpanKurir,
  simpanTransaksiKurir,
  type FormState,
} from "@/app/(app)/kurir/actions";
import { formatRupiah, tanggalLokalISO } from "@/lib/format";
import { COURIER_STATUS_LABEL, COURIER_TIPE_LABEL } from "@/lib/kurir";
import type {
  CourierMaster,
  CourierTxStatus,
  CourierTxTipe,
} from "@/types/database";

const inputClass =
  "w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-sm outline-none focus:border-emerald-500";

function Tombol({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-emerald-400 disabled:opacity-60"
    >
      {pending ? "Menyimpan…" : label}
    </button>
  );
}

function Error({ state }: { state: FormState }) {
  if (!state?.error) return null;
  return (
    <p className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
      {state.error}
    </p>
  );
}

export function KurirForm({ kurir }: { kurir?: CourierMaster }) {
  const [state, formAction] = useActionState<FormState, FormData>(
    simpanKurir,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      {kurir && <input type="hidden" name="id" value={kurir.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="nama" className="mb-1.5 block text-sm text-neutral-300">
            Nama
          </label>
          <input
            id="nama"
            name="nama"
            required
            defaultValue={kurir?.nama ?? ""}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="kontak" className="mb-1.5 block text-sm text-neutral-300">
            Kontak
          </label>
          <input
            id="kontak"
            name="kontak"
            defaultValue={kurir?.kontak ?? ""}
            placeholder="No. HP / WA"
            className={inputClass}
          />
        </div>

        {!kurir && (
          <div>
            <label
              htmlFor="tanggal_bergabung"
              className="mb-1.5 block text-sm text-neutral-300"
            >
              Tanggal bergabung
            </label>
            <input
              id="tanggal_bergabung"
              name="tanggal_bergabung"
              type="date"
              defaultValue={tanggalLokalISO()}
              className={inputClass}
            />
          </div>
        )}

        <div className="sm:col-span-2">
          <label htmlFor="catatan" className="mb-1.5 block text-sm text-neutral-300">
            Catatan
          </label>
          <input
            id="catatan"
            name="catatan"
            defaultValue={kurir?.catatan ?? ""}
            className={inputClass}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-300">
        <input
          type="checkbox"
          name="aktif"
          defaultChecked={kurir?.aktif ?? true}
          className="size-4 rounded border-neutral-700 bg-neutral-900"
        />
        Kurir aktif
      </label>

      <Error state={state} />

      <div className="flex items-center gap-3">
        <Tombol label={kurir ? "Simpan perubahan" : "Tambah kurir"} />
        <Link
          href="/kurir"
          className="text-sm text-neutral-400 transition hover:text-neutral-200"
        >
          Batal
        </Link>
      </div>
    </form>
  );
}

export function TransaksiKurirForm({
  kurirs,
  units,
}: {
  kurirs: { id: string; nama: string }[];
  units: { id: string; label: string }[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    simpanTransaksiKurir,
    null,
  );

  const [fee, setFee] = useState(75000);
  const [bensin, setBensin] = useState(25000);
  const [charge, setCharge] = useState(0);
  const [status, setStatus] = useState<CourierTxStatus>("selesai");

  const netKurir = fee + bensin;
  const revenue = charge - netKurir;

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="courier_id" className="mb-1.5 block text-sm text-neutral-300">
            Kurir
          </label>
          <select id="courier_id" name="courier_id" required className={inputClass}>
            {kurirs.length === 0 && <option value="">Belum ada kurir aktif</option>}
            {kurirs.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tipe" className="mb-1.5 block text-sm text-neutral-300">
            Jenis
          </label>
          <select id="tipe" name="tipe" className={inputClass}>
            {(Object.keys(COURIER_TIPE_LABEL) as CourierTxTipe[]).map((t) => (
              <option key={t} value={t}>
                {COURIER_TIPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="fee_gross" className="mb-1.5 block text-sm text-neutral-300">
            Fee kurir
          </label>
          <input
            id="fee_gross"
            name="fee_gross"
            type="number"
            min={0}
            step={1}
            defaultValue={75000}
            onChange={(e) => setFee(Number(e.target.value || 0))}
            className={inputClass}
          />
        </div>

        <div>
          <label
            htmlFor="reimbursement_bensin"
            className="mb-1.5 block text-sm text-neutral-300"
          >
            Reimbursement bensin
          </label>
          <input
            id="reimbursement_bensin"
            name="reimbursement_bensin"
            type="number"
            min={0}
            step={1}
            defaultValue={25000}
            onChange={(e) => setBensin(Number(e.target.value || 0))}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="status" className="mb-1.5 block text-sm text-neutral-300">
            Status
          </label>
          <select
            id="status"
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as CourierTxStatus)}
            className={inputClass}
          >
            {(Object.keys(COURIER_STATUS_LABEL) as CourierTxStatus[]).map((s) => (
              <option key={s} value={s}>
                {COURIER_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tanggal" className="mb-1.5 block text-sm text-neutral-300">
            Tanggal
          </label>
          <input
            id="tanggal"
            name="tanggal"
            type="date"
            defaultValue={tanggalLokalISO()}
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="unit_id" className="mb-1.5 block text-sm text-neutral-300">
            Unit terkait
          </label>
          <select id="unit_id" name="unit_id" defaultValue="" className={inputClass}>
            <option value="">Tidak terkait unit tertentu</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>

        {status === "batal_forfeited" && (
          <div className="sm:col-span-2">
            <label
              htmlFor="charge_ke_pihak_lain"
              className="mb-1.5 block text-sm text-neutral-300"
            >
              Nominal di-charge ke buyer/penjual
            </label>
            <input
              id="charge_ke_pihak_lain"
              name="charge_ke_pihak_lain"
              type="number"
              min={0}
              step={1}
              defaultValue={0}
              onChange={(e) => setCharge(Number(e.target.value || 0))}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-neutral-500">
              Biasanya diambil dari deposit pembatalan yang hangus.
            </p>
          </div>
        )}

        <div className="sm:col-span-2">
          <label htmlFor="catatan" className="mb-1.5 block text-sm text-neutral-300">
            Catatan
          </label>
          <input id="catatan" name="catatan" className={inputClass} />
        </div>
      </div>

      <div className="rounded-xl border border-neutral-900 bg-neutral-900/40 p-4 text-sm">
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-neutral-400">Diterima kurir</dt>
            <dd className="tabular-nums">{formatRupiah(netKurir)}</dd>
          </div>
          {status === "batal_forfeited" && (
            <div>
              <dt className="text-neutral-400">Revenue bersih bisnis</dt>
              <dd
                className={`tabular-nums ${revenue < 0 ? "text-red-400" : "text-emerald-400"}`}
              >
                {formatRupiah(revenue)}
              </dd>
            </div>
          )}
        </dl>
        <p className="mt-3 text-xs text-neutral-500">
          Kas keluar dicatat otomatis sebesar {formatRupiah(netKurir)} — fee
          ditambah bensin, karena itu yang benar-benar keluar dari dompet Jago.
        </p>
      </div>

      <Error state={state} />

      <div className="flex items-center gap-3">
        <Tombol label="Catat transaksi" />
        <Link
          href="/kurir"
          className="text-sm text-neutral-400 transition hover:text-neutral-200"
        >
          Batal
        </Link>
      </div>
    </form>
  );
}
