"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  aturTampilanDataDummy,
  type FormState,
} from "@/app/(app)/data-dummy/actions";

function Tombol({ tampilkan }: { tampilkan: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="tampilkan"
      // Yang dikirim adalah state TUJUAN, bukan state sekarang. Dulu di sini
      // dikirim `tampilkan` apa adanya, jadi tombol berlabel "Sembunyikan"
      // mengirim tampilkan=true — server menyetel ulang nilai yang sudah
      // berlaku dan tidak ada yang berubah. Togglenya tidak pernah bisa
      // menyembunyikan apa pun.
      value={tampilkan ? "false" : "true"}
      disabled={pending}
      className={
        tampilkan
          ? "rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2.5 text-sm font-medium text-neutral-200 transition hover:border-neutral-700 disabled:opacity-60"
          : "rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-emerald-400 disabled:opacity-60"
      }
    >
      {pending
        ? "Memproses…"
        : tampilkan
          ? "Sembunyikan data dummy"
          : "Tampilkan lagi data dummy"}
    </button>
  );
}

export default function DataDummyForm({
  tampilkanSaatIni,
}: {
  tampilkanSaatIni: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    aturTampilanDataDummy,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <Tombol tampilkan={tampilkanSaatIni} />
      {state?.error && (
        <p className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          {state.error}
        </p>
      )}
    </form>
  );
}
