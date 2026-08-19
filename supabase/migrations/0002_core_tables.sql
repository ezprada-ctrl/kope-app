-- =====================================================================
-- 0002 — Tabel inti bisnis
-- Semua nominal uang pakai numeric(18,2) — TIDAK PERNAH float/real.
-- Semua persentase pakai numeric(5,2), 60.00 artinya 60%.
-- =====================================================================

-- ---------------------------------------------------------------------
-- plafon_settings — batas atas outstanding investor (default 300jt)
-- ---------------------------------------------------------------------
create table public.plafon_settings (
  id             uuid primary key default gen_random_uuid(),
  investor_id    uuid references public.profiles (id) on delete restrict,
  plafon         numeric(18,2) not null check (plafon >= 0),
  effective_date timestamptz not null default now(),
  catatan        text,
  changed_by     uuid references public.profiles (id) default auth.uid(),
  created_at     timestamptz not null default now()
);

comment on column public.plafon_settings.investor_id is
  'NULL = plafon global default. Diisi = plafon khusus investor tersebut.';

create index plafon_settings_lookup_idx
  on public.plafon_settings (investor_id, effective_date desc);

-- ---------------------------------------------------------------------
-- units — siklus hidup 1 unit iPhone
-- ---------------------------------------------------------------------
create table public.units (
  id                   uuid primary key default gen_random_uuid(),
  kode                 text unique,
  tipe                 public.unit_tipe not null,
  model                text not null,
  kondisi              text,
  imei                 text,

  -- sumber dana: NULL artinya modal sendiri / kas pool tanpa investor
  investor_id          uuid references public.profiles (id) on delete restrict,

  -- sisi beli
  harga_beli           numeric(18,2) not null default 0 check (harga_beli >= 0),
  biaya_kurir_ambil    numeric(18,2) not null default 0 check (biaya_kurir_ambil >= 0),
  biaya_refurbish      numeric(18,2) not null default 0 check (biaya_refurbish >= 0),

  hpp_total            numeric(18,2)
                         generated always as
                         (harga_beli + biaya_kurir_ambil + biaya_refurbish) stored,

  -- sisi jual
  harga_jual           numeric(18,2) check (harga_jual >= 0),
  biaya_kurir_antar    numeric(18,2) not null default 0 check (biaya_kurir_antar >= 0),
  biaya_admin_packing  numeric(18,2) not null default 0 check (biaya_admin_packing >= 0),

  -- margin NULL selama harga_jual belum diisi
  margin               numeric(18,2)
                         generated always as (
                           harga_jual
                           - (harga_beli + biaya_kurir_ambil + biaya_refurbish)
                           - biaya_kurir_antar
                           - biaya_admin_packing
                         ) stored,

  status               public.unit_status not null default 'sourced',
  tanggal_beli         date,
  tanggal_jual         date,
  tanggal_settle       timestamptz,
  catatan              text,

  dicatat_oleh         uuid references public.profiles (id) default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index units_investor_idx on public.units (investor_id);
create index units_status_idx   on public.units (status);

create trigger trg_units_touch
  before update on public.units
  for each row execute function public.touch_updated_at();

-- Helper RLS yang bergantung ke tabel units (harus dibuat setelah units ada).
create or replace function public.funds_unit(p_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.units u
    where u.id = p_unit_id
      and u.investor_id = (select auth.uid())
  );
$$;

revoke all on function public.funds_unit(uuid) from public;
grant execute on function public.funds_unit(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- investor_ledger — capital call / return of capital / profit share
-- ---------------------------------------------------------------------
create table public.investor_ledger (
  id                 uuid primary key default gen_random_uuid(),
  investor_id        uuid not null references public.profiles (id) on delete restrict,
  tipe               public.ledger_tipe not null,
  jumlah             numeric(18,2) not null check (jumlah > 0),
  unit_id            uuid references public.units (id) on delete restrict,
  tanggal            timestamptz not null default now(),
  bukti_transfer_url text,
  catatan            text,

  -- koreksi: entry baru yang menunjuk entry asal, BUKAN overwrite/delete
  koreksi_dari_id    uuid references public.investor_ledger (id) on delete restrict,

  dicatat_oleh       uuid references public.profiles (id) default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on column public.investor_ledger.unit_id is
  'NULL = dana masuk kas pool umum, tidak 1:1 ke unit tertentu.';

create index investor_ledger_investor_idx on public.investor_ledger (investor_id, tanggal);
create index investor_ledger_unit_idx     on public.investor_ledger (unit_id);

create trigger trg_investor_ledger_touch
  before update on public.investor_ledger
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- courier_master
-- ---------------------------------------------------------------------
create table public.courier_master (
  id                uuid primary key default gen_random_uuid(),
  nama              text not null,
  kontak            text,
  aktif             boolean not null default true,
  tanggal_bergabung date not null default current_date,
  catatan           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger trg_courier_master_touch
  before update on public.courier_master
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- courier_transactions
-- ---------------------------------------------------------------------
create table public.courier_transactions (
  id                    uuid primary key default gen_random_uuid(),
  courier_id            uuid not null references public.courier_master (id) on delete restrict,
  unit_id               uuid references public.units (id) on delete restrict,
  tipe                  public.courier_tx_tipe not null,

  fee_gross             numeric(18,2) not null default 0 check (fee_gross >= 0),
  reimbursement_bensin  numeric(18,2) not null default 0 check (reimbursement_bensin >= 0),
  fee_net_kurir         numeric(18,2)
                          generated always as (fee_gross + reimbursement_bensin) stored,

  status                public.courier_tx_status not null default 'pending',

  -- dipakai saat status = batal_forfeited
  charge_ke_pihak_lain  numeric(18,2) not null default 0 check (charge_ke_pihak_lain >= 0),
  revenue_bersih_bisnis numeric(18,2)
                          generated always as
                          (charge_ke_pihak_lain - (fee_gross + reimbursement_bensin)) stored,

  tanggal               timestamptz not null default now(),
  catatan               text,
  koreksi_dari_id       uuid references public.courier_transactions (id) on delete restrict,

  dicatat_oleh          uuid references public.profiles (id) default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on column public.courier_transactions.fee_net_kurir is
  'Total yang benar-benar diterima kurir = fee_gross + reimbursement bensin.';
comment on column public.courier_transactions.charge_ke_pihak_lain is
  'Nominal yang di-charge ke buyer/seller (mis. deposit 75k) saat transaksi batal.';

create index courier_tx_unit_idx    on public.courier_transactions (unit_id);
create index courier_tx_courier_idx on public.courier_transactions (courier_id, tanggal);

create trigger trg_courier_tx_touch
  before update on public.courier_transactions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- cancellation_deposits — charge 75k di depan (nominal variable)
-- ---------------------------------------------------------------------
create table public.cancellation_deposits (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null references public.units (id) on delete restrict,
  dibayar_oleh    public.cancellation_payer not null,
  nama_pembayar   text,
  jumlah          numeric(18,2) not null default 75000 check (jumlah > 0),
  status          public.cancellation_status not null default 'pending',
  tanggal         timestamptz not null default now(),
  tanggal_resolve timestamptz,
  bukti_url       text,
  catatan         text,
  koreksi_dari_id uuid references public.cancellation_deposits (id) on delete restrict,

  dicatat_oleh    uuid references public.profiles (id) default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index cancellation_deposits_unit_idx on public.cancellation_deposits (unit_id);

create trigger trg_cancellation_deposits_touch
  before update on public.cancellation_deposits
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- refunds — infra disiapkan, belum aktif dipakai (Fase 7)
-- ---------------------------------------------------------------------
create table public.refunds (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null references public.units (id) on delete restrict,
  tipe            public.refund_tipe not null,
  jumlah          numeric(18,2) not null check (jumlah > 0),
  alasan          text,
  tanggal         timestamptz not null default now(),
  status          public.refund_status not null default 'pending',
  koreksi_dari_id uuid references public.refunds (id) on delete restrict,

  dicatat_oleh    uuid references public.profiles (id) default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index refunds_unit_idx on public.refunds (unit_id);

create trigger trg_refunds_touch
  before update on public.refunds
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- profit_share_settings — global config, admin bisa ubah kapanpun
-- ---------------------------------------------------------------------
create table public.profit_share_settings (
  id                       uuid primary key default gen_random_uuid(),
  investor_percentage      numeric(5,2) not null
                             check (investor_percentage >= 0 and investor_percentage <= 100),
  admin_percentage         numeric(5,2)
                             generated always as (100 - investor_percentage) stored,
  owner_admin_percentage   numeric(5,2) not null default 20
                             check (owner_admin_percentage >= 0 and owner_admin_percentage <= 100),
  owner_partner_percentage numeric(5,2) not null default 80
                             check (owner_partner_percentage >= 0 and owner_partner_percentage <= 100),
  effective_date           timestamptz not null default now(),
  catatan                  text,
  changed_by               uuid references public.profiles (id) default auth.uid(),
  created_at               timestamptz not null default now(),

  constraint owner_split_must_total_100
    check (owner_admin_percentage + owner_partner_percentage = 100)
);

comment on table public.profit_share_settings is
  'Append-only. Ubah setting = insert baris baru dengan effective_date baru, bukan update baris lama.';

create index profit_share_settings_effective_idx
  on public.profit_share_settings (effective_date desc);

-- ---------------------------------------------------------------------
-- profit_split — per unit, dihitung saat unit di-mark settled
-- ---------------------------------------------------------------------
create table public.profit_split (
  id                      uuid primary key default gen_random_uuid(),
  unit_id                 uuid not null unique references public.units (id) on delete restrict,
  tanggal_settle          timestamptz not null default now(),
  margin_bruto            numeric(18,2) not null,
  profit_share_setting_id uuid not null references public.profit_share_settings (id) on delete restrict,

  investor_id             uuid references public.profiles (id) on delete restrict,
  investor_profit         numeric(18,2) not null,
  admin_pool_profit       numeric(18,2) not null,
  admin_final_profit      numeric(18,2) not null,
  partner_final_profit    numeric(18,2) not null,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on column public.profit_split.margin_bruto is
  'Snapshot margin unit saat settle. Margin negatif (rugi) ditanggung proporsional oleh semua pihak.';

create index profit_split_investor_idx on public.profit_split (investor_id);

create trigger trg_profit_split_touch
  before update on public.profit_split
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- loss_allocation — infra multi-investor pool (aktif kalau >1 investor)
-- ---------------------------------------------------------------------
create table public.loss_allocation (
  id                       uuid primary key default gen_random_uuid(),
  periode                  text not null,
  unit_id                  uuid references public.units (id) on delete restrict,
  total_pool_saat_kejadian numeric(18,2) not null default 0,
  total_rugi               numeric(18,2) not null default 0,
  catatan                  text,
  dicatat_oleh             uuid references public.profiles (id) default auth.uid(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table public.loss_allocation_items (
  id                     uuid primary key default gen_random_uuid(),
  loss_allocation_id     uuid not null references public.loss_allocation (id) on delete restrict,
  investor_id            uuid not null references public.profiles (id) on delete restrict,
  kontribusi             numeric(18,2) not null default 0,
  proporsi               numeric(9,6) not null default 0,
  jumlah_rugi_ditanggung numeric(18,2) not null default 0,
  created_at             timestamptz not null default now(),
  unique (loss_allocation_id, investor_id)
);

create trigger trg_loss_allocation_touch
  before update on public.loss_allocation
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- bank_reconciliation — mutasi Bank Jago vs pencatatan app
-- ---------------------------------------------------------------------
create table public.bank_reconciliation (
  id                     uuid primary key default gen_random_uuid(),
  tanggal                date not null,
  periode_mulai          date,
  periode_selesai        date,
  mutasi_bank_jago       numeric(18,2) not null default 0,
  mutasi_tercatat_di_app numeric(18,2) not null default 0,
  selisih                numeric(18,2)
                           generated always as
                           (mutasi_bank_jago - mutasi_tercatat_di_app) stored,
  flagged                boolean
                           generated always as
                           (mutasi_bank_jago - mutasi_tercatat_di_app <> 0) stored,
  bukti_url              text,
  catatan                text,
  koreksi_dari_id        uuid references public.bank_reconciliation (id) on delete restrict,

  dicatat_oleh           uuid references public.profiles (id) default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index bank_reconciliation_flag_idx on public.bank_reconciliation (flagged, tanggal desc);

create trigger trg_bank_reconciliation_touch
  before update on public.bank_reconciliation
  for each row execute function public.touch_updated_at();
