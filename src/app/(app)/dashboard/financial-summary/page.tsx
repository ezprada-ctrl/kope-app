import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { formatRupiah } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Ringkasan finansial" };

function awalBulanIni() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function hariIni() {
  return new Date().toISOString().slice(0, 10);
}

function Kartu({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "netral" | "baik" | "buruk";
}) {
  const warna =
    tone === "baik"
      ? "text-emerald-400"
      : tone === "buruk"
        ? "text-red-400"
        : "";

  return (
    <div className="rounded-xl border border-neutral-900 bg-neutral-900/40 p-4">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1.5 text-xl font-semibold tabular-nums ${warna}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}

export default async function FinancialSummaryPage(
  props: PageProps<"/dashboard/financial-summary">,
) {
  await requireRole("admin");

  const params = await props.searchParams;
  const mulai = typeof params.mulai === "string" ? params.mulai : awalBulanIni();
  const selesai = typeof params.selesai === "string" ? params.selesai : hariIni();

  const supabase = await createClient();

  const [{ data: ringkasan }, { data: labaRugi }] = await Promise.all([
    supabase.from("v_financial_summary").select("*").maybeSingle(),
    supabase.rpc("laba_rugi_periode", { p_mulai: mulai, p_selesai: selesai }),
  ]);

  const lr = Array.isArray(labaRugi) ? labaRugi[0] : labaRugi;

  const saldoKas = Number(ringkasan?.saldo_kas_bisnis_saat_ini ?? 0);
  const outstanding = Number(ringkasan?.total_outstanding_pemodal ?? 0);
  const ekuitas = Number(
    ringkasan?.total_ekuitas_admin_partner_belum_ditarik ?? 0,
  );

  // Kas yang belum "punya pemilik": setelah modal pemodal dan hak
  // admin/partner dikeluarkan, sisanya baru benar-benar bebas.
  const kasBebas = saldoKas - outstanding - ekuitas;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-neutral-400 transition hover:text-neutral-200"
        >
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Ringkasan finansial</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Posisi kas bisnis dan klaim atas kas tersebut.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kartu
          label="Saldo kas bisnis"
          value={formatRupiah(saldoKas)}
          hint="Dompet Bank Jago menurut app"
          tone={saldoKas < 0 ? "buruk" : "netral"}
        />
        <Kartu
          label="Outstanding pemodal"
          value={formatRupiah(outstanding)}
          hint="Modal yang belum dikembalikan"
        />
        <Kartu
          label="Ekuitas belum ditarik"
          value={formatRupiah(ekuitas)}
          hint={`Admin ${formatRupiah(ringkasan?.ekuitas_admin_belum_ditarik ?? 0)} · Partner ${formatRupiah(ringkasan?.ekuitas_partner_belum_ditarik ?? 0)}`}
        />
        <Kartu
          label="Kas bebas"
          value={formatRupiah(kasBebas)}
          hint="Saldo − outstanding − ekuitas"
          tone={kasBebas < 0 ? "buruk" : "baik"}
        />
      </div>

      {kasBebas < 0 && (
        <p className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          Kas bebas negatif: klaim atas kas (modal pemodal + hak admin/partner)
          melebihi uang yang benar-benar ada. Cek saldo awal dan rekonsiliasi
          bank.
        </p>
      )}

      {/* Laba rugi periode */}
      <section className="space-y-4 rounded-xl border border-neutral-900 bg-neutral-900/40 p-4">
        <h2 className="text-sm font-medium text-neutral-200">Laba rugi periode</h2>

        <form className="flex flex-wrap items-end gap-3" method="get">
          <div>
            <label htmlFor="mulai" className="mb-1.5 block text-xs text-neutral-400">
              Dari
            </label>
            <input
              id="mulai"
              name="mulai"
              type="date"
              defaultValue={mulai}
              className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label htmlFor="selesai" className="mb-1.5 block text-xs text-neutral-400">
              Sampai
            </label>
            <input
              id="selesai"
              name="selesai"
              type="date"
              defaultValue={selesai}
              className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg border border-neutral-800 px-3.5 py-2 text-sm text-neutral-200 transition hover:border-neutral-700"
          >
            Hitung
          </button>
        </form>

        <div className="grid gap-3 sm:grid-cols-4">
          <Kartu
            label="Unit settled"
            value={String(lr?.jumlah_unit_settled ?? 0)}
          />
          <Kartu
            label="Total margin"
            value={formatRupiah(lr?.total_margin_settled ?? 0)}
          />
          <Kartu
            label="Biaya operasional"
            value={formatRupiah(lr?.total_biaya_operasional ?? 0)}
          />
          <Kartu
            label="Laba bersih"
            value={formatRupiah(lr?.laba_bersih ?? 0)}
            tone={Number(lr?.laba_bersih ?? 0) < 0 ? "buruk" : "baik"}
          />
        </div>

        <p className="text-xs text-neutral-500">
          Margin dihitung dari unit yang di-settle dalam rentang tanggal,
          dikurangi biaya operasional pada rentang yang sama.
        </p>
      </section>

      <Link
        href="/kas"
        className="inline-block text-sm text-neutral-400 transition hover:text-neutral-200"
      >
        Lihat rincian kas →
      </Link>
    </div>
  );
}
