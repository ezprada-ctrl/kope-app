"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { catatLedger, type FormState } from "@/app/(app)/modal/actions";
import { formatRupiah, tanggalLokalISO } from "@/lib/format";

type Opsi = { id: string; label: string };

type PemodalInfo = {
  id: string;
  nama: string;
  outstanding: number;
  plafon: number | null;
  sisa: number | null;
};

const inputClass =
  "w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-sm outline-none focus:border-emerald-500";

function Tombol() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-emerald-400 disabled:opacity-60"
    >
      {pending ? "Menyimpan…" : "Catat"}
    </button>
  );
}

export default function LedgerForm({
  daftarPemodal,
  units,
}: {
  daftarPemodal: PemodalInfo[];
  units: Opsi[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    catatLedger,
    null,
  );

  const [pemodalId, setPemodalId] = useState(daftarPemodal[0]?.id ?? "");
  const [tipe, setTipe] = useState<"capital_call" | "return_of_capital">(
    "capital_call",
  );
  const [jumlah, setJumlah] = useState(0);

  const pemodal = daftarPemodal.find((i) => i.id === pemodalId);
  const sisa = pemodal?.sisa ?? null;
  const lewatPlafon =
    tipe === "capital_call" && sisa !== null && jumlah > sisa;

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="pemodal_id" className="mb-1.5 block text-sm text-neutral-300">
            Pemodal
          </label>
          <select
            id="pemodal_id"
            name="pemodal_id"
            required
            value={pemodalId}
            onChange={(e) => setPemodalId(e.target.value)}
            className={inputClass}
          >
            {daftarPemodal.length === 0 && <option value="">Belum ada pemodal</option>}
            {daftarPemodal.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nama}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tipe" className="mb-1.5 block text-sm text-neutral-300">
            Jenis
          </label>
          <select
            id="tipe"
            name="tipe"
            value={tipe}
            onChange={(e) =>
              setTipe(e.target.value as "capital_call" | "return_of_capital")
            }
            className={inputClass}
          >
            <option value="capital_call">Capital call (dana masuk)</option>
            <option value="return_of_capital">
              Return of capital (modal balik)
            </option>
          </select>
        </div>

        <div>
          <label htmlFor="jumlah" className="mb-1.5 block text-sm text-neutral-300">
            Jumlah
          </label>
          <input
            id="jumlah"
            name="jumlah"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            required
            onChange={(e) => setJumlah(Number(e.target.value || 0))}
            className={inputClass}
          />
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
            <option value="">Kas pool umum (tidak terikat unit)</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-neutral-500">
            Kalau diikat ke unit, modalnya otomatis dikembalikan saat unit
            di-settle.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="bukti_transfer_url"
            className="mb-1.5 block text-sm text-neutral-300"
          >
            Link bukti transfer
          </label>
          <input
            id="bukti_transfer_url"
            name="bukti_transfer_url"
            type="url"
            placeholder="https://…"
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="catatan" className="mb-1.5 block text-sm text-neutral-300">
            Catatan
          </label>
          <textarea id="catatan" name="catatan" rows={2} className={inputClass} />
        </div>
      </div>

      {pemodal && (
        <div className="rounded-xl border border-neutral-900 bg-neutral-900/40 p-4 text-sm">
          <p className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
            Posisi {pemodal.nama}
          </p>
          <dl className="grid gap-2 sm:grid-cols-3">
            <div>
              <dt className="text-neutral-400">Outstanding</dt>
              <dd className="tabular-nums">{formatRupiah(pemodal.outstanding)}</dd>
            </div>
            <div>
              <dt className="text-neutral-400">Plafon</dt>
              <dd className="tabular-nums">{formatRupiah(pemodal.plafon)}</dd>
            </div>
            <div>
              <dt className="text-neutral-400">Sisa plafon</dt>
              <dd className="tabular-nums">{formatRupiah(sisa)}</dd>
            </div>
          </dl>
        </div>
      )}

      {lewatPlafon && (
        <p className="rounded-lg border border-amber-900 bg-amber-950/50 px-3 py-2 text-sm text-amber-200">
          Jumlah ini melebihi sisa plafon ({formatRupiah(sisa)}). Database akan
          menolaknya.
        </p>
      )}

      {state?.error && (
        <p className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Tombol />
        <Link
          href="/modal"
          className="text-sm text-neutral-400 transition hover:text-neutral-200"
        >
          Batal
        </Link>
      </div>
    </form>
  );
}
