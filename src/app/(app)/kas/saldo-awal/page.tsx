import Link from "next/link";
import { redirect } from "next/navigation";

import { SaldoAwalForm } from "@/components/pengeluaran-form";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Saldo awal kas" };

export default async function SaldoAwalPage() {
  await requireRole("admin");

  const supabase = await createClient();
  const { count } = await supabase
    .from("cash_ledger")
    .select("id", { count: "exact", head: true })
    .eq("kategori", "saldo_awal");

  if ((count ?? 0) > 0) redirect("/kas");

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/kas"
          className="text-sm text-neutral-400 transition hover:text-neutral-200"
        >
          ← Kas bisnis
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Saldo awal kas</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Uang yang sudah ada di dompet Bank Jago sebelum sistem ini dipakai.
        </p>
      </div>

      <SaldoAwalForm />
    </div>
  );
}
