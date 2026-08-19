"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { catatRekonsiliasi, type FormState } from "@/app/(app)/rekonsiliasi/actions";

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
      {pending ? "Menyimpan…" : "Catat rekonsiliasi"}
    </button>
  );
}

export default function RekonsiliasiForm() {
  const [state, formAction] = useActionState<FormState, FormData>(
    catatRekonsiliasi,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="tanggal" className="mb-1.5 block text-sm text-neutral-300">
            Tanggal saldo
          </label>
          <input
            id="tanggal"
            name="tanggal"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className={inputClass}
          />
        </div>

        <div>
          <label
            htmlFor="mutasi_bank_jago"
            className="mb-1.5 block text-sm text-neutral-300"
          >
            Saldo di layar Bank Jago
          </label>
          <input
            id="mutasi_bank_jago"
            name="mutasi_bank_jago"
            type="number"
            step={1}
            required
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="bukti_url" className="mb-1.5 block text-sm text-neutral-300">
            Link screenshot mutasi
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
          <textarea id="catatan" name="catatan" rows={2} className={inputClass} />
        </div>
      </div>

      <p className="rounded-lg border border-neutral-900 bg-neutral-900/40 px-3 py-2 text-xs text-neutral-400">
        Saldo &ldquo;tercatat di app&rdquo; dihitung otomatis dari kas bisnis
        pada tanggal ini — bukan diketik manual. Kalau beda dari saldo Bank
        Jago, sistem langsung menandainya dan mengirim notifikasi ke admin.
      </p>

      {state?.error && (
        <p className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Tombol />
        <Link
          href="/rekonsiliasi"
          className="text-sm text-neutral-400 transition hover:text-neutral-200"
        >
          Batal
        </Link>
      </div>
    </form>
  );
}
