"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  catatRekonsiliasi,
  ekstrakSaldoDariPdf,
  type FormState,
} from "@/app/(app)/rekonsiliasi/actions";
import { tanggalLokalISO } from "@/lib/format";

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

type PdfStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "info"; pesan: string }
  | { kind: "error"; pesan: string };

export default function RekonsiliasiForm() {
  const [state, formAction] = useActionState<FormState, FormData>(
    catatRekonsiliasi,
    null,
  );

  const tanggalRef = useRef<HTMLInputElement>(null);
  const saldoRef = useRef<HTMLInputElement>(null);
  const [pdfStatus, setPdfStatus] = useState<PdfStatus>({ kind: "idle" });

  async function handlePdfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // biar bisa upload file yang sama lagi kalau perlu
    if (!file) return;

    const tanggal = tanggalRef.current?.value;
    if (!tanggal) {
      setPdfStatus({ kind: "error", pesan: "Pilih tanggal saldo dulu sebelum upload PDF." });
      return;
    }

    setPdfStatus({ kind: "loading" });
    const fd = new FormData();
    fd.set("tanggal", tanggal);
    fd.set("pdf", file);

    const hasil = await ekstrakSaldoDariPdf(null, fd);

    if (hasil?.status === "ok") {
      if (saldoRef.current) saldoRef.current.value = String(hasil.saldo);
      setPdfStatus({
        kind: "info",
        pesan: `Saldo diambil dari transaksi terakhir di PDF: ${hasil.tanggalLabel}${
          hasil.waktuLabel ? ", " + hasil.waktuLabel : ""
        }. Cek dulu sebelum simpan — kalau ada transaksi sesudahnya yang belum masuk PDF, sesuaikan manual.`,
      });
    } else {
      setPdfStatus({
        kind: "error",
        pesan: hasil?.status === "error" ? hasil.error : "Gagal memproses PDF.",
      });
    }
  }

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
            ref={tanggalRef}
            defaultValue={tanggalLokalISO()}
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
            ref={saldoRef}
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="pdf_mutasi" className="mb-1.5 block text-sm text-neutral-300">
            Atau isi otomatis dari PDF mutasi Jago
          </label>
          <input
            id="pdf_mutasi"
            type="file"
            accept="application/pdf"
            onChange={handlePdfChange}
            className="block w-full text-sm text-neutral-400 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-800 file:px-3 file:py-2 file:text-sm file:text-neutral-200 hover:file:bg-neutral-700"
          />
          {pdfStatus.kind === "loading" && (
            <p className="mt-1.5 text-xs text-neutral-500">Membaca PDF…</p>
          )}
          {pdfStatus.kind === "info" && (
            <p className="mt-1.5 text-xs text-emerald-400">{pdfStatus.pesan}</p>
          )}
          {pdfStatus.kind === "error" && (
            <p className="mt-1.5 text-xs text-red-400">{pdfStatus.pesan}</p>
          )}
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
