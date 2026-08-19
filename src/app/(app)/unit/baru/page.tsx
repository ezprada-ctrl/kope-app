import Link from "next/link";

import UnitForm from "@/components/unit-form";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { tambahUnit } from "../actions";

export const metadata = { title: "Unit baru" };

export default async function UnitBaruPage() {
  await requireRole("admin");

  const supabase = await createClient();
  const { data: daftarPemodal } = await supabase
    .from("profiles")
    .select("id, nama")
    .eq("role", "pemodal")
    .eq("aktif", true)
    .order("nama");

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/unit"
          className="text-sm text-neutral-400 transition hover:text-neutral-200"
        >
          ← Unit
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Unit baru</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Unit baru otomatis masuk status <em>Sourced</em>.
        </p>
      </div>

      <UnitForm
        action={tambahUnit}
        daftarPemodal={daftarPemodal ?? []}
        labelTombol="Simpan unit"
      />
    </div>
  );
}
