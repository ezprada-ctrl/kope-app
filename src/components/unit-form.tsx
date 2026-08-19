"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { formatRupiah } from "@/lib/format";
import type { FormState } from "@/app/(app)/unit/actions";
import type { Unit } from "@/types/database";

type PemodalOpsi = { id: string; nama: string };

const inputClass =
  "w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-sm outline-none focus:border-emerald-500";

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm text-neutral-300">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}

function Uang({
  name,
  defaultValue,
  onChange,
}: {
  name: string;
  defaultValue?: number | null;
  onChange?: (v: number) => void;
}) {
  return (
    <input
      id={name}
      name={name}
      type="number"
      min={0}
      step={1}
      inputMode="numeric"
      defaultValue={defaultValue ?? ""}
      onChange={(e) => onChange?.(Number(e.target.value || 0))}
      className={inputClass}
    />
  );
}

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

export default function UnitForm({
  action,
  unit,
  daftarPemodal,
  labelTombol,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  unit?: Unit;
  daftarPemodal: PemodalOpsi[];
  labelTombol: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);

  // Pratinjau HPP & margin. Nilai final tetap dihitung DB (kolom GENERATED) —
  // ini murni bantuan visual supaya admin tahu angkanya sebelum menyimpan.
  const [hargaBeli, setHargaBeli] = useState(unit?.harga_beli ?? 0);
  const [kurirAmbil, setKurirAmbil] = useState(unit?.biaya_kurir_ambil ?? 0);
  const [refurbish, setRefurbish] = useState(unit?.biaya_refurbish ?? 0);
  const [hargaJual, setHargaJual] = useState(unit?.harga_jual ?? 0);
  const [kurirAntar, setKurirAntar] = useState(unit?.biaya_kurir_antar ?? 0);
  const [adminPacking, setAdminPacking] = useState(
    unit?.biaya_admin_packing ?? 0,
  );

  const hpp = hargaBeli + kurirAmbil + refurbish;
  const margin = hargaJual > 0 ? hargaJual - hpp - kurirAntar - adminPacking : null;

  return (
    <form action={formAction} className="space-y-6">
      {unit && <input type="hidden" name="id" value={unit.id} />}

      <section className="space-y-4 rounded-xl border border-neutral-900 bg-neutral-900/40 p-4">
        <h2 className="text-sm font-medium text-neutral-200">Identitas unit</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipe" htmlFor="tipe">
            <select
              id="tipe"
              name="tipe"
              defaultValue={unit?.tipe ?? "bekas"}
              className={inputClass}
            >
              <option value="bekas">Bekas</option>
              <option value="baru">Baru</option>
            </select>
          </Field>

          <Field label="Model" htmlFor="model" hint="Contoh: iPhone 13 Pro 256GB">
            <input
              id="model"
              name="model"
              required
              defaultValue={unit?.model ?? ""}
              className={inputClass}
            />
          </Field>

          <Field label="Kondisi" htmlFor="kondisi" hint="Opsional. Contoh: mulus 95%, batt 89%">
            <input
              id="kondisi"
              name="kondisi"
              defaultValue={unit?.kondisi ?? ""}
              className={inputClass}
            />
          </Field>

          <Field label="IMEI" htmlFor="imei" hint="Opsional">
            <input
              id="imei"
              name="imei"
              defaultValue={unit?.imei ?? ""}
              className={inputClass}
            />
          </Field>

          <Field label="Kode unit" htmlFor="kode" hint="Opsional, harus unik">
            <input
              id="kode"
              name="kode"
              defaultValue={unit?.kode ?? ""}
              className={inputClass}
            />
          </Field>

          <Field
            label="Sumber dana"
            htmlFor="pemodal_id"
            hint="Kosongkan kalau pakai modal sendiri / kas pool"
          >
            <select
              id="pemodal_id"
              name="pemodal_id"
              defaultValue={unit?.pemodal_id ?? ""}
              className={inputClass}
            >
              <option value="">Modal sendiri / kas pool</option>
              {daftarPemodal.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.nama}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-neutral-900 bg-neutral-900/40 p-4">
        <h2 className="text-sm font-medium text-neutral-200">Sisi beli</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Harga beli" htmlFor="harga_beli">
            <Uang name="harga_beli" defaultValue={unit?.harga_beli} onChange={setHargaBeli} />
          </Field>
          <Field label="Kurir ambil" htmlFor="biaya_kurir_ambil">
            <Uang
              name="biaya_kurir_ambil"
              defaultValue={unit?.biaya_kurir_ambil}
              onChange={setKurirAmbil}
            />
          </Field>
          <Field label="Refurbish" htmlFor="biaya_refurbish">
            <Uang
              name="biaya_refurbish"
              defaultValue={unit?.biaya_refurbish}
              onChange={setRefurbish}
            />
          </Field>
        </div>

        <Field label="Tanggal beli" htmlFor="tanggal_beli">
          <input
            id="tanggal_beli"
            name="tanggal_beli"
            type="date"
            defaultValue={unit?.tanggal_beli ?? ""}
            className={inputClass}
          />
        </Field>
      </section>

      <section className="space-y-4 rounded-xl border border-neutral-900 bg-neutral-900/40 p-4">
        <h2 className="text-sm font-medium text-neutral-200">Sisi jual</h2>
        <p className="text-xs text-neutral-500">
          Boleh dikosongkan dulu kalau unit belum terjual. Harga jual wajib
          terisi sebelum status bisa naik ke &ldquo;Terkirim &amp; dibayar&rdquo;.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Harga jual" htmlFor="harga_jual">
            <Uang name="harga_jual" defaultValue={unit?.harga_jual} onChange={setHargaJual} />
          </Field>
          <Field label="Kurir antar" htmlFor="biaya_kurir_antar">
            <Uang
              name="biaya_kurir_antar"
              defaultValue={unit?.biaya_kurir_antar}
              onChange={setKurirAntar}
            />
          </Field>
          <Field label="Admin / packing" htmlFor="biaya_admin_packing">
            <Uang
              name="biaya_admin_packing"
              defaultValue={unit?.biaya_admin_packing}
              onChange={setAdminPacking}
            />
          </Field>
        </div>

        <Field label="Tanggal jual" htmlFor="tanggal_jual">
          <input
            id="tanggal_jual"
            name="tanggal_jual"
            type="date"
            defaultValue={unit?.tanggal_jual ?? ""}
            className={inputClass}
          />
        </Field>
      </section>

      <section className="rounded-xl border border-neutral-900 bg-neutral-900/40 p-4">
        <h2 className="mb-3 text-sm font-medium text-neutral-200">
          Pratinjau perhitungan
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">
              HPP total
            </dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">
              {formatRupiah(hpp)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">
              Margin
            </dt>
            <dd
              className={`mt-0.5 text-lg font-semibold tabular-nums ${
                margin !== null && margin < 0 ? "text-red-400" : ""
              }`}
            >
              {margin === null ? "—" : formatRupiah(margin)}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-neutral-500">
          Angka final dihitung ulang oleh database saat disimpan.
        </p>
      </section>

      <Field label="Catatan" htmlFor="catatan">
        <textarea
          id="catatan"
          name="catatan"
          rows={3}
          defaultValue={unit?.catatan ?? ""}
          className={inputClass}
        />
      </Field>

      {state?.error && (
        <p className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Tombol label={labelTombol} />
        <Link
          href={unit ? `/unit/${unit.id}` : "/unit"}
          className="text-sm text-neutral-400 transition hover:text-neutral-200"
        >
          Batal
        </Link>
      </div>
    </form>
  );
}
