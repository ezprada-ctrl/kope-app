import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "backups";
const RETENSI_JUMLAH = 30; // ~30 hari untuk cron harian

const TABEL_DICADANGKAN: (keyof Database["public"]["Tables"])[] = [
  "profiles",
  "plafon_settings",
  "units",
  "pemodal_ledger",
  "courier_master",
  "courier_transactions",
  "cancellation_deposits",
  "loss_components",
  "business_entity_config",
  "parties",
  "contracts",
  "profit_schemes",
  "profit_scheme_tiers",
  "unit_profit_snapshot",
  "cancellation_loss_items",
  "refunds",
  "profit_share_settings",
  "profit_split",
  "loss_allocation",
  "loss_allocation_items",
  "bank_reconciliation",
  "audit_log",
  "cash_ledger",
  "operational_expenses",
  "notifications",
];

async function bersihkanBackupLama(
  supabase: ReturnType<typeof createServiceClient>,
) {
  const { data } = await supabase.storage.from(BUCKET).list("", {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (!data) return;

  const berlebih = data.length - RETENSI_JUMLAH;
  if (berlebih <= 0) return;

  const hapus = data.slice(0, berlebih).map((f) => f.name);
  await supabase.storage.from(BUCKET).remove(hapus);
}

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const hasil: Record<string, unknown[]> = {};
  const errors: string[] = [];

  for (const tabel of TABEL_DICADANGKAN) {
    const { data, error } = await supabase.from(tabel).select("*");
    if (error) {
      errors.push(`${tabel}: ${error.message}`);
      continue;
    }
    hasil[tabel] = data ?? [];
  }

  if (Object.keys(hasil).length === 0) {
    // Semua tabel gagal dibaca — jangan upload backup kosong yang menyesatkan.
    return Response.json(
      { error: "Semua tabel gagal dibaca, backup dibatalkan", detail: errors },
      { status: 500 },
    );
  }

  const dibuatPada = new Date().toISOString();
  const namaFile = `${dibuatPada.replace(/[:.]/g, "-")}.json`;
  const payload = JSON.stringify(
    { dibuat_pada: dibuatPada, tabel: hasil, errors },
    null,
    2,
  );

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(namaFile, payload, { contentType: "application/json" });

  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  await bersihkanBackupLama(supabase);

  return Response.json({
    ok: true,
    file: namaFile,
    tabel_berhasil: Object.keys(hasil).length,
    tabel_gagal: errors,
  });
}
