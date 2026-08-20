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

export type UserRole = "super_admin" | "admin" | "pemodal";

/** Jenis akad per unit. `mandiri_internal` tidak boleh terlihat pemodal. */
export type DealType = "mudharabah" | "mandiri_internal" | "konsinyasi_fee";

/** Menentukan kapan nisbah di-snapshot ke unit. */
export type FundingSource = "direct_capital_call" | "pool";

/**
 * Klasifikasi kerugian. Diisi manual per kejadian — definisi operasional
 * "kelalaian" belum ditetapkan di akad, jadi sengaja bukan aturan otomatis.
 */
export type LossClassification = "normal" | "kelalaian" | "fraud";

export type JenisUsaha = "perorangan" | "cv" | "pt";

export type JenisAkad = "mudharabah" | "musyarakah" | "wakalah" | "lainnya";

export type BasisPerhitungan =
  | "gross_margin"
  | "net_profit_after_direct_cost"
  | "net_profit_after_all_cost";

export type SchemeStatus = "draft" | "active" | "archived";

/**
 * Pihak penerima bagi hasil. Sengaja terpisah dari role login: role bisa
 * berubah, dan mengikat uang ke role membuat perubahan akses diam-diam
 * mengubah siapa yang dibayar.
 */
export type Party = {
  id: string;
  kode: string;
  nama: string;
  profile_id: string | null;
  aktif: boolean;
  urutan: number;
  catatan: string | null;
  created_at: string;
  updated_at: string;
};

export type Contract = {
  id: string;
  nomor: string | null;
  jenis_akad: JenisAkad;
  nama: string;
  pihak_pertama: string | null;
  pihak_kedua: string | null;
  tanggal_mulai: string;
  tanggal_akhir: string | null;
  dokumen_url: string | null;
  catatan: string | null;
  dicatat_oleh: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfitScheme = {
  id: string;
  nama_skema: string;
  keterangan: string | null;
  basis_perhitungan: BasisPerhitungan;
  deal_type_target: DealType;
  status: SchemeStatus;
  berlaku_dari: string;
  berlaku_sampai: string | null;
  contract_id: string | null;
  /** Daftar nama kolom biaya di `units` yang boleh dipotong sebelum bagi hasil. */
  whitelist_biaya: string[];
  dibuat_oleh: string | null;
  disetujui_oleh: string | null;
  disetujui_pada: string | null;
  dokumen_persetujuan_url: string | null;
  created_at: string;
  updated_at: string;
  locked_at: string | null;
};

export type ProfitSchemeTier = {
  id: string;
  scheme_id: string;
  /** 1 = pembagian pertama, 2 = dari sisa level 1, dst. */
  level: number;
  pihak_id: string;
  persentase: number;
  urutan: number;
  created_at: string;
  updated_at: string;
};

/** Satu baris tier di dalam `snapshot_json`. */
export type SnapshotTier = {
  level: number;
  pihak_id: string;
  pihak_kode: string;
  pihak_nama: string;
  persentase: number;
  urutan: number;
};

/**
 * Nisbah yang dikunci ke unit. Perhitungan profit WAJIB baca dari sini —
 * join live ke `profit_scheme_tiers` di luar preview/simulator adalah bug,
 * karena skema induknya bisa diarsipkan atau diganti.
 */
export type UnitProfitSnapshot = {
  unit_id: string;
  scheme_id: string;
  snapshot_json: SnapshotTier[];
  basis_perhitungan_snapshot: BasisPerhitungan;
  whitelist_biaya_snapshot: string[];
  funding_source_at_snapshot: FundingSource;
  dikunci_pada: string;
};

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
  | "cancellation_refund_out"
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
  pemodal_id: string | null;
  deal_type: DealType;
  funding_source: FundingSource | null;
  custody_holder: string | null;
  risk_bearer: string | null;
  handover_document: string | null;
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
  /** Kerugian riil. Diisi settle_unit() saat margin negatif. */
  realized_loss: number;
  loss_classification: LossClassification | null;
  loss_justifikasi: string | null;
  /** Penanggung untuk kelalaian/fraud. NULL untuk rugi normal. */
  loss_bearer_id: string | null;
  tanggal_beli: string | null;
  tanggal_jual: string | null;
  tanggal_settle: string | null;
  catatan: string | null;
  dicatat_oleh: string | null;
  created_at: string;
  updated_at: string;
};

/** Badan usaha yang berlaku pada suatu periode. Append-only. */
export type BusinessEntityConfig = {
  id: string;
  jenis_usaha: JenisUsaha;
  berlaku_dari: string;
  berlaku_sampai: string | null;
  npwp: string | null;
  nama_resmi_usaha: string | null;
  catatan: string | null;
  dicatat_oleh: string | null;
  created_at: string;
  updated_at: string;
};

export type PemodalLedger = {
  id: string;
  pemodal_id: string;
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
  /** SUM rincian kerugian. Dipaksa trigger — jangan pernah dikirim dari client. */
  kerugian_riil_total: number;
  /** generated: least(kerugian_riil_total, jumlah) */
  jumlah_ditahan: number;
  /** generated: jumlah - jumlah_ditahan */
  jumlah_dikembalikan: number;
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

/** Whitelist komponen kerugian riil — konfigurasi, bukan hardcode. */
export type LossComponent = {
  id: string;
  kode: string;
  nama: string;
  aktif: boolean;
  urutan: number;
  catatan: string | null;
  created_at: string;
  updated_at: string;
};

/** Rincian kerugian riil per deposit, item per item supaya bisa diaudit. */
export type CancellationLossItem = {
  id: string;
  cancellation_deposit_id: string;
  component_id: string;
  jumlah: number;
  catatan: string | null;
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
  pemodal_percentage: number;
  /** generated: 100 - pemodal_percentage */
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
  /** NULL kalau nisbah berasal dari unit_profit_snapshot, bukan setting lama. */
  profit_share_setting_id: string | null;
  pemodal_id: string | null;
  pemodal_profit: number;
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
  pemodal_id: string;
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
  pemodal_id: string | null;
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

export type PemodalOutstanding = {
  pemodal_id: string;
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
  total_outstanding_pemodal: number;
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
  pemodal_id: string | null;
  pemodal_profit: number;
  admin_pool_profit: number;
  admin_final_profit: number;
  partner_final_profit: number;
  pemodal_percentage: number;
  owner_admin_percentage: number;
  owner_partner_percentage: number;
};

export type PlafonAktif = {
  pemodal_id: string;
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
  | "kerugian_riil_total"
  | "jumlah_ditahan"
  | "jumlah_dikembalikan"
  | "deal_type"
  | "realized_loss"
  | "whitelist_biaya"
  | "dikunci_pada"
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
      pemodal_ledger: Table<PemodalLedger>;
      courier_master: Table<CourierMaster>;
      courier_transactions: Table<CourierTransaction>;
      cancellation_deposits: Table<CancellationDeposit>;
      loss_components: Table<LossComponent>;
      business_entity_config: Table<BusinessEntityConfig>;
      parties: Table<Party>;
      contracts: Table<Contract>;
      profit_schemes: Table<ProfitScheme>;
      profit_scheme_tiers: Table<ProfitSchemeTier>;
      unit_profit_snapshot: Table<UnitProfitSnapshot>;
      cancellation_loss_items: Table<CancellationLossItem>;
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
      v_pemodal_outstanding: View<PemodalOutstanding>;
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
      v_pemodal_ledger_running: View<
        PemodalLedger & {
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
      plafon_pemodal: {
        Args: { p_pemodal_id: string };
        Returns: number;
      };
      outstanding_pemodal: {
        Args: { p_pemodal_id: string };
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
      deal_type: DealType;
      funding_source: FundingSource;
      loss_classification: LossClassification;
      jenis_usaha: JenisUsaha;
      jenis_akad: JenisAkad;
      basis_perhitungan: BasisPerhitungan;
      scheme_status: SchemeStatus;
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
