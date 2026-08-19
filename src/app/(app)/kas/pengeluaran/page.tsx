import Link from "next/link";

import { PengeluaranForm } from "@/components/pengeluaran-form";
import { requireRole } from "@/lib/auth";

export const metadata = { title: "Biaya operasional" };

export default async function PengeluaranPage() {
  await requireRole("admin");

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/kas"
          className="text-sm text-neutral-400 transition hover:text-neutral-200"
        >
          ← Kas bisnis
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Biaya operasional</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Pengeluaran di luar pembelian unit dan fee kurir.
        </p>
      </div>

      <PengeluaranForm />
    </div>
  );
}
