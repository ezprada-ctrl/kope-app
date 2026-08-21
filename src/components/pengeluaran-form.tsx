"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { catatPengeluaran, catatSaldoAwal, type FormState } from "@/app/(app)/kas/actions";
import { tanggalLokalISO } from "@/lib/format";
import { EXPENSE_KATEGORI_LABEL } from "@/lib/kas";
import type { ExpenseKategori } from "@/types/database";

const inputClass =
  "w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-sm outline-none focus:border-emerald-500";

const KATEGORI = Object.keys(EXPENSE_KATEGORI_LABEL) as ExpenseKategori[];

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

function Pesan({ state }: { state: FormState }) {
  if (!state?.error) return null;
  return (
    <p className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
      {state.error}
    </p>
  );
}

export function PengeluaranForm() {
  const [state, formAction] = useActionState<FormState, FormData>(
    catatPengeluaran,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="kategori" className="mb-1.5 block text-sm text-neutral-300">
            Kategori
          </label>
          <select id="kategori" name="kategori" className={inputClass}>
            {KATEGORI.map((k) => (
              <option key={k} value={k}>
                {EXPENSE_KATEGORI_LABEL[k]}
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
            inputMode="numeric"
            required
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

        <div>
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
          <label htmlFor="deskripsi" className="mb-1.5 block text-sm text-neutral-300">
            Deskripsi
          </label>
          <input id="deskripsi" name="deskripsi" className={inputClass} />
        </div>
      </div>

      <p className="text-xs text-neutral-500">
        Entry kas keluar dibuat otomatis oleh database — tidak perlu dicatat
        terpisah di halaman kas.
      </p>

      <Pesan state={state} />

      <div className="flex items-center gap-3">
        <Tombol label="Catat pengeluaran" />
        <Link
          href="/kas"
          className="text-sm text-neutral-400 transition hover:text-neutral-200"
        >
          Batal
        </Link>
      </div>
    </form>
  );
}

export function SaldoAwalForm() {
  const [state, formAction] = useActionState<FormState, FormData>(
    catatSaldoAwal,
    null,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="jumlah" className="mb-1.5 block text-sm text-neutral-300">
            Saldo dompet Bank Jago
          </label>
          <input
            id="jumlah"
            name="jumlah"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            required
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="tanggal" className="mb-1.5 block text-sm text-neutral-300">
            Per tanggal
          </label>
          <input
            id="tanggal"
            name="tanggal"
            type="date"
            defaultValue={tanggalLokalISO()}
            className={inputClass}
          />
        </div>
      </div>

      <p className="rounded-lg border border-amber-900 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
        Isi dengan saldo asli dompet Bank Jago pada tanggal tersebut. Angka ini
        jadi titik awal semua perhitungan kas — kalau salah, seluruh rekonsiliasi
        ikut meleset. Hanya bisa dicatat sekali.
      </p>

      <Pesan state={state} />

      <div className="flex items-center gap-3">
        <Tombol label="Simpan saldo awal" />
        <Link
          href="/kas"
          className="text-sm text-neutral-400 transition hover:text-neutral-200"
        >
          Batal
        </Link>
      </div>
    </form>
  );
}
