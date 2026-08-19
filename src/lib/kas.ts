import type { CashKategori, ExpenseKategori } from "@/types/database";

export const KAS_KATEGORI_LABEL: Record<CashKategori, string> = {
  saldo_awal: "Saldo awal",
  capital_call_in: "Modal masuk",
  unit_purchase_out: "Beli unit",
  unit_sale_in: "Jual unit",
  courier_fee_out: "Fee kurir",
  operational_expense_out: "Biaya operasional",
  profit_payout_out: "Pencairan bagi hasil",
  return_of_capital_out: "Pengembalian modal",
  cancellation_deposit_in: "Deposit pembatalan",
  refund_out: "Refund ke pembeli",
};

export const EXPENSE_KATEGORI_LABEL: Record<ExpenseKategori, string> = {
  admin_fee: "Biaya admin",
  platform_fee: "Fee platform",
  marketing: "Marketing",
  lain_lain: "Lain-lain",
};

/** Tabel sumber → rute detail, supaya tiap baris kas bisa ditelusuri. */
export function tautanSumber(
  refTable: string | null,
  refId: string | null,
): string | null {
  if (!refTable || !refId) return null;
  if (refTable === "units") return `/unit/${refId}`;
  if (refTable === "investor_ledger") return "/modal";
  return null;
}
