"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { bukaCatatanDev, type FormState } from "@/app/(app)/dev/actions";

function Tombol() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-emerald-400 disabled:opacity-60"
    >
      {pending ? "Memeriksa…" : "Buka"}
    </button>
  );
}

export default function DevGateForm() {
  const [state, formAction] = useActionState<FormState, FormData>(
    bukaCatatanDev,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-sm text-neutral-400"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="off"
          autoFocus
          className="w-full max-w-xs rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
        />
      </div>

      <Tombol />

      {state?.error && (
        <p className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          {state.error}
        </p>
      )}
    </form>
  );
}
