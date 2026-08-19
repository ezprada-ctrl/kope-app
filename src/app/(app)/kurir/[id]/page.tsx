import Link from "next/link";
import { notFound } from "next/navigation";

import { KurirForm } from "@/components/kurir-forms";
import { requireOrangDalam } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Edit kurir" };

export default async function KurirEditPage(props: PageProps<"/kurir/[id]">) {
  const { id } = await props.params;
  await requireOrangDalam();

  const supabase = await createClient();
  const { data: kurir } = await supabase
    .from("courier_master")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!kurir) notFound();

  return (
    <div className="space-y-5">
      <div>
        <Link href="/kurir" className="text-sm text-neutral-400 transition hover:text-neutral-200">
          ← Kurir
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Edit {kurir.nama}</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Kurir tidak bisa dihapus — nonaktifkan saja supaya riwayat transaksinya tetap utuh.
        </p>
      </div>

      <KurirForm kurir={kurir} />
    </div>
  );
}
