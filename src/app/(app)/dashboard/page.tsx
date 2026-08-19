import { requireProfile, ROLE_LABEL } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatPersen, formatRupiah } from "@/lib/format";

export const metadata = { title: "Dashboard" };

function Card({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-900 bg-neutral-900/40 p-4">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1.5 text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  // Semua query di bawah lewat RLS — pemodal otomatis cuma dapat datanya sendiri.
  const [{ count: totalUnit }, { data: setting }, { data: outstanding }] =
    await Promise.all([
      supabase.from("units").select("id", { count: "exact", head: true }),
      supabase
        .from("profit_share_settings")
        .select("*")
        .lte("effective_date", new Date().toISOString())
        .order("effective_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("v_pemodal_outstanding").select("*"),
    ]);

  const totalOutstanding = (outstanding ?? []).reduce(
    (sum, row) => sum + Number(row.outstanding ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Halo, {profile.nama}</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Kamu masuk sebagai {ROLE_LABEL[profile.role]}.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          label="Unit tercatat"
          value={String(totalUnit ?? 0)}
          hint={
            profile.role === "pemodal"
              ? "Unit yang kamu danai"
              : "Seluruh unit"
          }
        />
        <Card
          label="Outstanding modal"
          value={formatRupiah(totalOutstanding)}
          hint="capital call − return of capital"
        />
        <Card
          label="Porsi pemodal"
          value={formatPersen(setting?.pemodal_percentage ?? null)}
          hint={
            setting
              ? `Sisanya dibagi ${formatPersen(setting.owner_admin_percentage)} admin / ${formatPersen(setting.owner_partner_percentage)} partner`
              : undefined
          }
        />
      </div>

      <div className="rounded-xl border border-neutral-900 bg-neutral-900/40 p-4 text-sm text-neutral-400">
        <p className="font-medium text-neutral-200">Fase 1 selesai</p>
        <p className="mt-1">
          Skema database, RLS 3 role, dan audit log sudah aktif. Menu unit,
          capital call, profit split, kurir, dan rekonsiliasi bank menyusul di
          fase berikutnya.
        </p>
      </div>
    </div>
  );
}
