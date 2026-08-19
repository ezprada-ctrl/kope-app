/**
 * Tipe skema database KOPE.
 *
 * Ditulis manual supaya query Supabase type-safe. Kalau skema berubah,
 * update file ini bareng migration-nya.
 *
 * Catatan: semua kolom uang di Postgres bertipe numeric(18,2). supabase-js
 * mengembalikannya sebagai `number` di runtime (JSON), tapi presisi
 * sesungguhnya dijaga di database — jangan pernah menghitung ulang nilai
 * finansial di client lalu menimpanya ke DB.
 */

export type UserRole = "admin" | "owner_partner" | "investor";

export type UnitTipe = "baru" | "bekas";

export type UnitStatus =
  | "sourced"
  | "paid_to_seller"
  | "in_stock"
  | "sold_pending_delivery"
  | "delivered_paid"
  | "settled"
  | "refunded"
  | "partial_refund"
  | "cancelled_forfeited";

export type LedgerTipe = "capital_call" | "return_of_capital" | "profit_share";

export type CourierTxTipe = "ambil_barang" | "antar_barang";
export type CourierTxStatus = "pending" | "selesai" | "batal_forfeited";

export type CancellationStatus =
  | "pending"
  | "applied_to_transaction"
  | "forfeited_as_revenue";
export type CancellationPayer = "buyer" | "seller";

export type RefundTipe = "refund_full" | "partial_refund";
export type RefundStatus = "pending" | "approved" | "completed";

export type AuditAction = "create" | "update";

export type CashTipe = "in" | "out";

export type CashKategori =
  | "saldo_awal"
  | "capital_call_in"
  | "unit_purchase_out"
  | "unit_sale_in"
  | "courier_fee_out"
  | "operational_expense_out"
  | "profit_payout_out"
  | "return_of_capital_out"
  | "cancellation_deposit_in"
  | "refund_out";

export type ExpenseKategori =
  | "admin_fee"
  | "platform_fee"
  | "marketing"
  | "lain_lain";

export type PayoutStatus = "belum_ditarik" | "sudah_ditarik";

export type NotifTipe = "kas_masuk" | "kas_keluar" | "rekonsiliasi_selisih";

export type Profile = {
  id: string;
  nama: string;
  email: string;
  role: UserRole;
  aktif: boolean;
  created_at: string;
  updated_at: string;
};

export type Unit = {
  id: string;
  kode: string | null;
  tipe: UnitTipe;
  model: string;
  kondisi: string | null;
  imei: string | null;
  investor_id: string | null;
  harga_beli: number;
  biaya_kurir_ambil: number;
  biaya_refurbish: number;
  /** generated: harga_beli + biaya_kurir_ambil + biaya_refurbish */
  hpp_total: number;
  harga_jual: number | null;
  biaya_kurir_antar: number;
  biaya_admin_packing: number;
  /** generated: harga_jual - hpp_total - biaya_kurir_antar - biaya_admin_packing */
  margin: number | null;
  status: UnitStatus;
  tanggal_beli: string | null;
  tanggal_jual: string | null;
  tanggal_settle: string | null;
  catatan: string | null;
  dicatat_oleh: string | null;
  created_at: string;
  updated_at: string;
};

export type InvestorLedger = {
  id: string;
  investor_id: string;
  tipe: LedgerTipe;
  jumlah: number;
  unit_id: string | null;
  tanggal: string;
  bukti_transfer_url: string | null;
  catatan: string | null;
  koreksi_dari_id: string | null;
  dicatat_oleh: string | null;
  created_at: string;
  updated_at: string;
};

export type CourierMaster = {
  id: string;
  nama: string;
  kontak: string | null;
  aktif: boolean;
  tanggal_bergabung: string;
  catatan: string | null;
  created_at: string;
  updated_at: string;
};

export type CourierTransaction = {
  id: string;
  courier_id: string;
  unit_id: string | null;
  tipe: CourierTxTipe;
  fee_gross: number;
  reimbursement_bensin: number;
  /** generated: fee_gross + reimbursement_bensin */
  fee_net_kurir: number;
  status: CourierTxStatus;
  charge_ke_pihak_lain: number;
  /** generated: charge_ke_pihak_lain - fee_net_kurir */
  revenue_bersih_bisnis: number;
  tanggal: string;
  catatan: string | null;
  koreksi_dari_id: string | null;
  dicatat_oleh: string | null;
  created_at: string;
  updated_at: string;
};

export type CancellationDeposit = {
  id: string;
  unit_id: string;
  dibayar_oleh: CancellationPayer;
  nama_pembayar: string | null;
  jumlah: number;
  status: CancellationStatus;
  tanggal: string;
  tanggal_resolve: string | null;
  bukti_url: string | null;
  catatan: string | null;
  koreksi_dari_id: string | null;
  dicatat_oleh: string | null;
  created_at: string;
  updated_at: string;
};

export type Refund = {
  id: string;
  unit_id: string;
  tipe: RefundTipe;
  jumlah: number;
  alasan: string | null;
  tanggal: string;
  status: RefundStatus;
  bukti_url: string | null;
  tanggal_approved: string | null;
  tanggal_completed: string | null;
  koreksi_dari_id: string | null;
  dicatat_oleh: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfitShareSetting = {
  id: string;
  investor_percentage: number;
  /** generated: 100 - investor_percentage */
  admin_percentage: number;
  owner_admin_percentage: number;
  owner_partner_percentage: number;
  effective_date: string;
  catatan: string | null;
  changed_by: string | null;
  created_at: string;
};

export type ProfitSplit = {
  id: string;
  unit_id: string;
  tanggal_settle: string;
  margin_bruto: number;
  profit_share_setting_id: string;
  investor_id: string | null;
  investor_profit: number;
  admin_pool_profit: number;
  admin_final_profit: number;
  partner_final_profit: number;
  payout_status: PayoutStatus;
  tanggal_payout: string | null;
  created_at: string;
  updated_at: string;
};

export type LossAllocation = {
  id: string;
  periode: string;
  unit_id: string | null;
  total_pool_saat_kejadian: number;
  total_rugi: number;
  catatan: string | null;
  dicatat_oleh: string | null;
  created_at: string;
  updated_at: string;
};

export type LossAllocationItem = {
  id: string;
  loss_allocation_id: string;
  investor_id: string;
  kontribusi: number;
  proporsi: number;
  jumlah_rugi_ditanggung: number;
  created_at: string;
};

export type BankReconciliation = {
  id: string;
  tanggal: string;
  periode_mulai: string | null;
  periode_selesai: string | null;
  mutasi_bank_jago: number;
  mutasi_tercatat_di_app: number;
  /** generated: mutasi_bank_jago - mutasi_tercatat_di_app */
  selisih: number;
  /** generated: selisih <> 0 */
  flagged: boolean;
  bukti_url: string | null;
  catatan: string | null;
  koreksi_dari_id: string | null;
  dicatat_oleh: string | null;
  created_at: string;
  updated_at: string;
};

export type PlafonSetting = {
  id: string;
  investor_id: string | null;
  plafon: number;
  effective_date: string;
  catatan: string | null;
  changed_by: string | null;
  created_at: string;
};

export type AuditLog = {
  id: number;
  tabel_terdampak: string;
  record_id: string;
  aksi: AuditAction;
  data_sebelum: Record<string, unknown> | null;
  data_sesudah: Record<string, unknown> | null;
  perubahan: Record<string, unknown> | null;
  dilakukan_oleh: string | null;
  dilakukan_oleh_email: string | null;
  timestamp: string;
};

export type InvestorOutstanding = {
  investor_id: string;
  nama: string;
  total_capital_call: number;
  total_return_of_capital: number;
  total_profit_share: number;
  outstanding: number;
  plafon_aktif: number | null;
  sisa_plafon: number | null;
};

export type CashLedger = {
  id: string;
  urutan: number;
  tanggal: string;
  tipe: CashTipe;
  kategori: CashKategori;
  jumlah: number;
  /** generated: +jumlah kalau masuk, -jumlah kalau keluar */
  delta: number;
  ref_table: string | null;
  ref_id: string | null;
  deskripsi: string | null;
  dicatat_oleh: string | null;
  created_at: string;
  updated_at: string;
};

export type OperationalExpense = {
  id: string;
  tanggal: string;
  kategori: ExpenseKategori;
  deskripsi: string | null;
  jumlah: number;
  bukti_url: string | null;
  koreksi_dari_id: string | null;
  dicatat_oleh: string | null;
  created_at: string;
  updated_at: string;
};

export type FinancialSummary = {
  saldo_kas_bisnis_saat_ini: number;
  total_outstanding_investor: number;
  total_ekuitas_admin_partner_belum_ditarik: number;
  ekuitas_admin_belum_ditarik: number;
  ekuitas_partner_belum_ditarik: number;
};

export type LabaRugiPeriode = {
  total_margin_settled: number;
  total_biaya_operasional: number;
  laba_bersih: number;
  jumlah_unit_settled: number;
};

export type Notification = {
  id: string;
  profile_id: string;
  tipe: NotifTipe;
  kategori: string | null;
  jumlah: number | null;
  deskripsi: string | null;
  ref_table: string | null;
  ref_id: string | null;
  dibaca_pada: string | null;
  created_at: string;
};

export type ProfitRingkasan = {
  unit_id: string;
  model: string;
  kode: string | null;
  tanggal_settle: string;
  margin_bruto: number;
  investor_id: string | null;
  investor_profit: number;
  admin_pool_profit: number;
  admin_final_profit: number;
  partner_final_profit: number;
  investor_percentage: number;
  owner_admin_percentage: number;
  owner_partner_percentage: number;
};

export type PlafonAktif = {
  investor_id: string;
  nama: string;
  plafon_aktif: number | null;
  effective_date: string | null;
  pakai_plafon_khusus: boolean;
};

/**
 * Kolom yang tidak wajib diisi saat insert: hasil GENERATED di Postgres,
 * atau punya DEFAULT di level tabel.
 */
type Generated =
  | "id"
  | "created_at"
  | "updated_at"
  | "hpp_total"
  | "margin"
  | "fee_net_kurir"
  | "revenue_bersih_bisnis"
  | "selisih"
  | "flagged"
  | "admin_percentage"
  | "urutan"
  | "delta"
  // punya DEFAULT di DB
  | "status"
  | "aktif"
  | "tanggal"
  | "tanggal_bergabung"
  | "tanggal_settle"
  | "payout_status"
  | "effective_date"
  | "owner_admin_percentage"
  | "owner_partner_percentage"
  // dipaksa trigger, tidak boleh diisi client
  | "mutasi_tercatat_di_app";

/** Kolom nullable di Postgres boleh dilewat saat insert. */
type NullableKeys<T> = {
  [K in keyof T]-?: null extends T[K] ? K : never;
}[keyof T];

type Opsional<T> = Extract<keyof T, Generated> | NullableKeys<T>;

type Insertable<T> = Omit<T, Opsional<T>> & Partial<Pick<T, Opsional<T>>>;

type Table<Row, Insert = Insertable<Row>, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type View<Row> = {
  Row: Row;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile>;
      plafon_settings: Table<PlafonSetting>;
      units: Table<Unit>;
      investor_ledger: Table<InvestorLedger>;
      courier_master: Table<CourierMaster>;
      courier_transactions: Table<CourierTransaction>;
      cancellation_deposits: Table<CancellationDeposit>;
      refunds: Table<Refund>;
      profit_share_settings: Table<ProfitShareSetting>;
      profit_split: Table<ProfitSplit>;
      loss_allocation: Table<LossAllocation>;
      loss_allocation_items: Table<LossAllocationItem>;
      bank_reconciliation: Table<BankReconciliation>;
      audit_log: Table<AuditLog>;
      cash_ledger: Table<CashLedger>;
      operational_expenses: Table<OperationalExpense>;
      notifications: Table<Notification>;
    };
    Views: {
      v_investor_outstanding: View<InvestorOutstanding>;
      v_plafon_aktif: View<PlafonAktif>;
      v_profit_ringkasan: View<ProfitRingkasan>;
      v_financial_summary: View<FinancialSummary>;
      v_cash_ledger_running: View<CashLedger & { saldo_running: number }>;
      v_courier_transactions: View<
        CourierTransaction & {
          courier_nama: string;
          unit_model: string | null;
          unit_kode: string | null;
        }
      >;
      v_cancellation_deposits: View<
        CancellationDeposit & {
          unit_model: string;
          unit_kode: string | null;
          unit_status: UnitStatus;
        }
      >;
      v_bank_reconciliation: View<
        BankReconciliation & {
          saldo_kas_app: number;
          selisih_vs_kas_app: number;
          flagged_vs_kas_app: boolean;
        }
      >;
      v_investor_ledger_running: View<
        InvestorLedger & {
          delta_outstanding: number;
          outstanding_running_balance: number;
        }
      >;
    };
    Functions: {
      settle_unit: {
        Args: { p_unit_id: string };
        Returns: Unit;
      };
      plafon_investor: {
        Args: { p_investor_id: string };
        Returns: number;
      };
      outstanding_investor: {
        Args: { p_investor_id: string };
        Returns: number;
      };
      modal_tertahan_unit: {
        Args: { p_unit_id: string };
        Returns: number;
      };
      saldo_kas_sekarang: {
        Args: Record<string, never>;
        Returns: number;
      };
      saldo_kas_per_tanggal: {
        Args: { p_tanggal: string };
        Returns: number;
      };
      laba_rugi_periode: {
        Args: { p_mulai: string; p_selesai: string };
        Returns: LabaRugiPeriode[];
      };
      deposit_diterima_unit: {
        Args: { p_unit_id: string };
        Returns: number;
      };
      resolve_deposit: {
        Args: { p_deposit_id: string; p_status: CancellationStatus };
        Returns: CancellationDeposit;
      };
      jumlah_notif_belum_dibaca: {
        Args: Record<string, never>;
        Returns: number;
      };
    };
    Enums: {
      user_role: UserRole;
      unit_tipe: UnitTipe;
      unit_status: UnitStatus;
      ledger_tipe: LedgerTipe;
      courier_tx_tipe: CourierTxTipe;
      courier_tx_status: CourierTxStatus;
      cancellation_status: CancellationStatus;
      cancellation_payer: CancellationPayer;
      refund_tipe: RefundTipe;
      refund_status: RefundStatus;
      audit_action: AuditAction;
    };
    CompositeTypes: { [_ in never]: never };
  };
}
