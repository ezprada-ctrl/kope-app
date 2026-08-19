"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  catatDeposit,
  resolveDeposit,
  type FormState,
} from "@/app/(app)/deposit/actions";
import { DEPOSIT_DEFAULT, PAYER_LABEL } from "@/lib/kurir";
import type { CancellationPayer } from "@/types/database";

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

export function DepositForm({
  units,
}: {
  units: { id: string; label: string }[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    catatDeposit,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="unit_id" className="mb-1.5 block text-sm text-neutral-300">
            Unit
          </label>
          <select id="unit_id" name="unit_id" required className={inputClass}>
            {units.length === 0 && <option value="">Belum ada unit</option>}
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="dibayar_oleh"
            className="mb-1.5 block text-sm text-neutral-300"
          >
            Dibayar oleh
          </label>
          <select id="dibayar_oleh" name="dibayar_oleh" className={inputClass}>
            {(Object.keys(PAYER_LABEL) as CancellationPayer[]).map((p) => (
              <option key={p} value={p}>
                {PAYER_LABEL[p]}
              </option>
            ))}
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
            defaultValue={DEPOSIT_DEFAULT}
            required
            className={inputClass}
          />
        </div>

        <div>
          <label
            htmlFor="nama_pembayar"
            className="mb-1.5 block text-sm text-neutral-300"
          >
            Nama pembayar
          </label>
          <input id="nama_pembayar" name="nama_pembayar" className={inputClass} />
        </div>

        <div>
          <label htmlFor="tanggal" className="mb-1.5 block text-sm text-neutral-300">
            Tanggal
          </label>
          <input
            id="tanggal"
            name="tanggal"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="bukti_url" className="mb-1.5 block text-sm text-neutral-300">
            Link bukti
          </label>
          <input
            id="bukti_url"
            name="bukti_url"
            type="url"
            placeholder="https://…"
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="catatan" className="mb-1.5 block text-sm text-neutral-300">
            Catatan
          </label>
          <input id="catatan" name="catatan" className={inputClass} />
        </div>
      </div>

      <p className="rounded-lg border border-neutral-900 bg-neutral-900/40 px-3 py-2 text-xs text-neutral-400">
        Deposit langsung tercatat sebagai kas masuk. Kalau nanti deal jadi,
        nilainya otomatis dipotong dari pelunasan saat unit ditandai
        &ldquo;Terkirim &amp; dibayar&rdquo; — jadi tidak terhitung dua kali.
      </p>

      {state?.error && (
        <p className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Tombol label="Catat deposit" />
        <Link
          href="/deposit"
          className="text-sm text-neutral-400 transition hover:text-neutral-200"
        >
          Batal
        </Link>
      </div>
    </form>
  );
}

export function ResolveForm({ depositId }: { depositId: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(
    resolveDeposit,
    null,
  );

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={depositId} />

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="status"
          value="applied_to_transaction"
          className="rounded-lg border border-emerald-900 bg-emerald-950/50 px-3 py-1.5 text-xs text-emerald-200 transition hover:bg-emerald-950"
        >
          Deal jadi
        </button>
        <button
          type="submit"
          name="status"
          value="forfeited_as_revenue"
          className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-1.5 text-xs text-red-200 transition hover:bg-red-950"
        >
          Batal, hangus
        </button>
      </div>

      {state?.error && (
        <p className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-xs text-red-200">
          {state.error}
        </p>
      )}
    </form>
  );
}
