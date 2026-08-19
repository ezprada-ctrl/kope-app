"use client";

import { useTransition } from "react";

import { tandaiSemuaDibaca } from "@/app/(app)/notifikasi/actions";

export default function MarkAllReadButton({ disabled }: { disabled: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={() => startTransition(() => tandaiSemuaDibaca())}
      className="rounded-lg border border-neutral-800 px-3.5 py-2 text-sm text-neutral-200 transition hover:border-neutral-700 disabled:opacity-50"
    >
      {pending ? "Memproses…" : "Tandai semua dibaca"}
    </button>
  );
}
