import Link from "next/link";

import { KurirForm } from "@/components/kurir-forms";
import { requirePenulis } from "@/lib/auth";

export const metadata = { title: "Kurir baru" };

export default async function KurirBaruPage() {
  await requirePenulis();

  return (
    <div className="space-y-5">
      <div>
        <Link href="/kurir" className="text-sm text-neutral-400 transition hover:text-neutral-200">
          ← Kurir
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Kurir baru</h1>
      </div>

      <KurirForm />
    </div>
  );
}
