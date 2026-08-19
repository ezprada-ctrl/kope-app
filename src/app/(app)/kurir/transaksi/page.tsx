import Link from "next/link";

import { TransaksiKurirForm } from "@/components/kurir-forms";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Transaksi kurir" };

export default async function TransaksiKurirPage() {
  await requireRole("admin");

  const supabase = await createClient();
  const [{ data: kurirs }, { data: units }] = await Promise.all([
    supabase.from("courier_master").select("id, nama").eq("aktif", true).order("nama"),
    supabase
      .from("units")
      .select("id, model, kode")
      .neq("status", "settled")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/kurir" className="text-sm text-neutral-400 transition hover:text-neutral-200">
          ← Kurir
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Transaksi kurir</h1>
      </div>

      <TransaksiKurirForm
        kurirs={kurirs ?? []}
        units={(units ?? []).map((u) => ({
          id: u.id,
          label: u.kode ? `${u.model} · ${u.kode}` : u.model,
        }))}
      />
    </div>
  );
}
