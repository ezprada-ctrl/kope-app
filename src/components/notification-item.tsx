"use client";

import { useTransition } from "react";

import { tandaiSudahDibaca } from "@/app/(app)/notifikasi/actions";
import { formatRupiah } from "@/lib/format";
import { labelKategoriNotif, NOTIF_TIPE_LABEL, NOTIF_TIPE_TONE } from "@/lib/notifikasi";
import type { Notification } from "@/types/database";

function waktuRelatif(iso: string) {
  const detik = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (detik < 60) return "baru saja";
  const menit = Math.floor(detik / 60);
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  if (hari < 7) return `${hari} hari lalu`;
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(
    new Date(iso),
  );
}

export default function NotificationItem({ n }: { n: Notification }) {
  const [pending, startTransition] = useTransition();
  const belumDibaca = !n.dibaca_pada;
  const kategori = labelKategoriNotif(n.kategori);

  return (
    <li
      className={`flex items-start gap-3 px-4 py-3 transition ${
        belumDibaca ? "bg-emerald-950/10" : ""
      }`}
    >
      {belumDibaca && (
        <span className="mt-1.5 size-1.5 flex-none rounded-full bg-emerald-400" />
      )}
      {!belumDibaca && <span className="mt-1.5 size-1.5 flex-none" />}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${NOTIF_TIPE_TONE[n.tipe]}`}
          >
            {NOTIF_TIPE_LABEL[n.tipe]}
          </span>
          {n.jumlah !== null && (
            <span className="text-sm font-medium tabular-nums">
              {formatRupiah(n.jumlah)}
            </span>
          )}
          <span className="text-xs text-neutral-500">{waktuRelatif(n.created_at)}</span>
        </div>

        <p className="mt-1 text-sm text-neutral-300">
          {kategori && <span className="text-neutral-400">{kategori} · </span>}
          {n.deskripsi ?? "—"}
        </p>
      </div>

      {belumDibaca && (
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => tandaiSudahDibaca(n.id))}
          className="flex-none text-xs text-neutral-500 transition hover:text-emerald-400 disabled:opacity-50"
        >
          Tandai dibaca
        </button>
      )}
    </li>
  );
}
