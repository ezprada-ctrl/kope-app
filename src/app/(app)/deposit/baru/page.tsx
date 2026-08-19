import Link from "next/link";

import { DepositForm } from "@/components/deposit-forms";
import { requirePenulis } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Deposit baru" };

export default async function DepositBaruPage() {
  await requirePenulis();

  const supabase = await createClient();
  const { data: units } = await supabase
    .from("units")
    .select("id, model, kode")
    .neq("status", "settled")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-5">
      <div>
        <Link href="/deposit" className="text-sm text-neutral-400 transition hover:text-neutral-200">
          ← Deposit
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Deposit baru</h1>
      </div>

      <DepositForm
        units={(units ?? []).map((u) => ({
          id: u.id,
          label: u.kode ? `${u.model} · ${u.kode}` : u.model,
        }))}
      />
    </div>
  );
}
