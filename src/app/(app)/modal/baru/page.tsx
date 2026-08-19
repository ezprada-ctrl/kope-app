import Link from "next/link";

import LedgerForm from "@/components/ledger-form";
import { requirePenulis } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Catat modal" };

export default async function ModalBaruPage() {
  await requirePenulis();

  const supabase = await createClient();

  const [{ data: ringkasan }, { data: units }] = await Promise.all([
    supabase.from("v_pemodal_outstanding").select("*").order("nama"),
    supabase
      .from("units")
      .select("id, model, kode, status")
      .neq("status", "settled")
      .order("created_at", { ascending: false }),
  ]);

  const daftarPemodal = (ringkasan ?? []).map((r) => ({
    id: r.pemodal_id,
    nama: r.nama,
    outstanding: Number(r.outstanding ?? 0),
    plafon: r.plafon_aktif === null ? null : Number(r.plafon_aktif),
    sisa: r.sisa_plafon === null ? null : Number(r.sisa_plafon),
  }));

  const opsiUnit = (units ?? []).map((u) => ({
    id: u.id,
    label: u.kode ? `${u.model} · ${u.kode}` : u.model,
  }));

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/modal"
          className="text-sm text-neutral-400 transition hover:text-neutral-200"
        >
          ← Modal pemodal
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Catat pergerakan modal</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Capital call dicek terhadap plafon di level database — permintaan yang
          melebihi plafon ditolak, bukan sekadar diperingatkan.
        </p>
      </div>

      <LedgerForm daftarPemodal={daftarPemodal} units={opsiUnit} />
    </div>
  );
}
