"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { UNIT_STATUS_KETERANGAN, UNIT_STATUS_LABEL } from "@/lib/unit-status";
import type { UnitStatus } from "@/types/database";
import { ubahStatusUnit, type FormState } from "../actions";

function Tombol({ status }: { status: UnitStatus }) {
  const { pending } = useFormStatus();
  const merah = status === "cancelled_forfeited";

  return (
    <button
      type="submit"
      name="status"
      value={status}
      disabled={pending}
      title={UNIT_STATUS_KETERANGAN[status]}
      className={`rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-60 ${
        merah
          ? "border border-red-900 bg-red-950/50 text-red-200 hover:bg-red-950"
          : "bg-emerald-500 text-neutral-950 hover:bg-emerald-400"
      }`}
    >
      {pending ? "Memproses…" : `→ ${UNIT_STATUS_LABEL[status]}`}
    </button>
  );
}

export default function StatusForm({
  unitId,
  pilihan,
}: {
  unitId: string;
  pilihan: UnitStatus[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(
    ubahStatusUnit,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={unitId} />

      <div className="flex flex-wrap gap-2">
        {pilihan.map((s) => (
          <Tombol key={s} status={s} />
        ))}
      </div>

      {state?.error && (
        <p className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          {state.error}
        </p>
      )}
    </form>
  );
}
