import Link from "next/link";

import RekonsiliasiForm from "@/components/rekonsiliasi-form";
import { requireRole } from "@/lib/auth";

export const metadata = { title: "Rekonsiliasi baru" };

export default async function RekonsiliasiBaruPage() {
  await requireRole("admin");

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/rekonsiliasi"
          className="text-sm text-neutral-400 transition hover:text-neutral-200"
        >
          ← Rekonsiliasi
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Catat rekonsiliasi</h1>
      </div>

      <RekonsiliasiForm />
    </div>
  );
}
