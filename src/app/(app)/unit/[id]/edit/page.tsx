import Link from "next/link";
import { notFound } from "next/navigation";

import UnitForm from "@/components/unit-form";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ubahUnit } from "../../actions";

export const metadata = { title: "Edit unit" };

export default async function UnitEditPage(
  props: PageProps<"/unit/[id]/edit">,
) {
  const { id } = await props.params;
  await requireRole("admin");

  const supabase = await createClient();

  const [{ data: unit }, { data: daftarPemodal }] = await Promise.all([
    supabase.from("units").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("profiles")
      .select("id, nama")
      .eq("role", "pemodal")
      .eq("aktif", true)
      .order("nama"),
  ]);

  if (!unit) notFound();

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/unit/${unit.id}`}
          className="text-sm text-neutral-400 transition hover:text-neutral-200"
        >
          ← {unit.model}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Edit unit</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Setiap perubahan tercatat di audit log beserta nilai sebelum dan
          sesudahnya.
        </p>
      </div>

      <UnitForm
        action={ubahUnit}
        unit={unit}
        daftarPemodal={daftarPemodal ?? []}
        labelTombol="Simpan perubahan"
      />
    </div>
  );
}
