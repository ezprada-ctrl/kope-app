"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { ubahPorsiPemodal, type FormState } from "@/app/(app)/bagi-hasil/actions";
import { formatRupiah } from "@/lib/format";

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
      {pending ? "Menyimpan…" : "Terapkan"}
    </button>
  );
}

/** Contoh perhitungan supaya admin lihat dampaknya sebelum menyimpan. */
const CONTOH_MARGIN = 10_000_000;

export default function PorsiForm({ sekarang }: { sekarang: number }) {
  const [state, formAction] = useActionState<FormState, FormData>(
    ubahPorsiPemodal,
    null,
  );
  const [persen, setPersen] = useState(sekarang);

  const pemodal = Math.round((CONTOH_MARGIN * persen) / 100);
  const pool = CONTOH_MARGIN - pemodal;
  const admin = Math.round((pool * 20) / 100);
  const partner = pool - admin;

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="pemodal_percentage"
            className="mb-1.5 block text-sm text-neutral-300"
          >
            Porsi pemodal (%)
          </label>
          <input
            id="pemodal_percentage"
            name="pemodal_percentage"
            type="number"
            min={0}
            max={100}
            step="0.01"
            required
            value={persen}
            onChange={(e) => setPersen(Number(e.target.value || 0))}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="catatan" className="mb-1.5 block text-sm text-neutral-300">
            Alasan perubahan
          </label>
          <input
            id="catatan"
            name="catatan"
            placeholder="Opsional"
            className={inputClass}
          />
        </div>
      </div>

      <div className="rounded-xl border border-neutral-900 bg-neutral-900/40 p-4 text-sm">
        <p className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
          Simulasi margin {formatRupiah(CONTOH_MARGIN)}
        </p>
        <dl className="grid gap-2 sm:grid-cols-3">
          <div>
            <dt className="text-neutral-400">Pemodal ({persen}%)</dt>
            <dd className="tabular-nums">{formatRupiah(pemodal)}</dd>
          </div>
          <div>
            <dt className="text-neutral-400">Admin (20% dari sisa)</dt>
            <dd className="tabular-nums">{formatRupiah(admin)}</dd>
          </div>
          <div>
            <dt className="text-neutral-400">Partner (80% dari sisa)</dt>
            <dd className="tabular-nums">{formatRupiah(partner)}</dd>
          </div>
        </dl>
      </div>

      <p className="text-xs text-neutral-500">
        Perubahan berlaku langsung untuk unit yang di-settle setelah ini. Unit
        yang sudah settled tetap memakai setting yang berlaku saat itu.
      </p>

      {state?.error && (
        <p className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-lg border border-emerald-900 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-200">
          {state.ok}
        </p>
      )}

      <Tombol />
    </form>
  );
}
