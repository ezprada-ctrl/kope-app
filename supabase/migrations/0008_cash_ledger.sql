-- =====================================================================
-- 0008 — Kas bisnis terpusat (Fase 3.5)
--
-- Sebelum ini, uang bisnis cuma bisa direkonstruksi dengan menjumlahkan
-- beberapa tabel. `cash_ledger` jadi single source of truth: setiap rupiah
-- yang masuk/keluar dompet Bank Jago tercatat di SATU tempat, diisi otomatis
-- oleh trigger dari tabel sumbernya — bukan dicatat ulang manual.
--
-- CATATAN DESAIN — `saldo_running` tidak disimpan sebagai kolom fisik.
-- Kolom running balance yang disimpan akan diam-diam salah begitu ada entry
-- backdated atau koreksi: semua baris sesudahnya jadi basi tanpa ada yang
-- tahu. Di sini saldo dihitung window function di `v_cash_ledger_running`,
-- konsisten dengan `v_investor_ledger_running` dari Fase 1.
-- =====================================================================

create type public.cash_tipe as enum ('in', 'out');

create type public.cash_kategori as enum (
  'saldo_awal',
  'capital_call_in',
  'unit_purchase_out',
  'unit_sale_in',
  'courier_fee_out',
  'operational_expense_out',
  'profit_payout_out',
  'return_of_capital_out',
  'cancellation_deposit_in'
);

create type public.expense_kategori as enum (
  'admin_fee',
  'platform_fee',
  'marketing',
  'lain_lain'
);

create type public.payout_status as enum ('belum_ditarik', 'sudah_ditarik');

-- ---------------------------------------------------------------------
-- cash_ledger
-- ---------------------------------------------------------------------
create table public.cash_ledger (
  id           uuid primary key default gen_random_uuid(),
  tanggal      timestamptz not null default now(),
  tipe         public.cash_tipe not null,
  kategori     public.cash_kategori not null,
  jumlah       numeric(18,2) not null check (jumlah > 0),

  -- Arah uang sebagai angka bertanda, supaya saldo tinggal SUM.
  delta        numeric(18,2)
                 generated always as
                 (case when tipe = 'in' then jumlah else -jumlah end) stored,

  ref_table    text,
  ref_id       uuid,
  deskripsi    text,

  dicatat_oleh uuid references public.profiles (id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.cash_ledger is
  'Single source of truth kas bisnis (dompet Bank Jago). Diisi otomatis lewat trigger dari tabel sumber.';

-- Idempotensi: satu record sumber hanya boleh menghasilkan satu entry kas
-- per kategori. Ini yang bikin trigger & script backfill aman dijalankan ulang.
create unique index cash_ledger_sumber_unik_idx
  on public.cash_ledger (ref_table, ref_id, kategori)
  where ref_table is not null and ref_id is not null;

create index cash_ledger_tanggal_idx on public.cash_ledger (tanggal, created_at, id);
create index cash_ledger_kategori_idx on public.cash_ledger (kategori, tanggal desc);

create trigger trg_cash_ledger_touch
  before update on public.cash_ledger
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- operational_expenses
-- ---------------------------------------------------------------------
create table public.operational_expenses (
  id           uuid primary key default gen_random_uuid(),
  tanggal      date not null default current_date,
  kategori     public.expense_kategori not null,
  deskripsi    text,
  jumlah       numeric(18,2) not null check (jumlah > 0),
  bukti_url    text,
  koreksi_dari_id uuid references public.operational_expenses (id) on delete restrict,
  dicatat_oleh uuid references public.profiles (id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index operational_expenses_tanggal_idx
  on public.operational_expenses (tanggal desc);

create trigger trg_operational_expenses_touch
  before update on public.operational_expenses
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- profit_split: status penarikan (untuk ekuitas yang belum ditarik)
-- ---------------------------------------------------------------------
alter table public.profit_split
  add column if not exists payout_status public.payout_status
    not null default 'belum_ditarik',
  add column if not exists tanggal_payout timestamptz;

-- ---------------------------------------------------------------------
-- Helper: catat entry kas, lewati kalau sumbernya sudah pernah dicatat.
-- ---------------------------------------------------------------------
create or replace function public.catat_kas(
  p_tanggal   timestamptz,
  p_tipe      public.cash_tipe,
  p_kategori  public.cash_kategori,
  p_jumlah    numeric,
  p_ref_table text,
  p_ref_id    uuid,
  p_deskripsi text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_jumlah is null or p_jumlah <= 0 then
    return null;  -- nol/negatif bukan pergerakan kas
  end if;

  insert into public.cash_ledger
    (tanggal, tipe, kategori, jumlah, ref_table, ref_id, deskripsi)
  values
    (coalesce(p_tanggal, now()), p_tipe, p_kategori, p_jumlah,
     p_ref_table, p_ref_id, p_deskripsi)
  on conflict (ref_table, ref_id, kategori) where ref_table is not null and ref_id is not null
  do nothing
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.catat_kas(
  timestamptz, public.cash_tipe, public.cash_kategori, numeric, text, uuid, text
) to authenticated;

-- ---------------------------------------------------------------------
-- Trigger: investor_ledger → kas
-- ---------------------------------------------------------------------
create or replace function public.kas_dari_investor_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tipe = 'capital_call' then
    perform public.catat_kas(new.tanggal, 'in', 'capital_call_in', new.jumlah,
      'investor_ledger', new.id, 'Dana masuk dari investor');
  elsif new.tipe = 'return_of_capital' then
    perform public.catat_kas(new.tanggal, 'out', 'return_of_capital_out', new.jumlah,
      'investor_ledger', new.id, 'Pengembalian modal ke investor');
  end if;
  -- profit_share TIDAK menyentuh kas di sini; pencairannya dicatat terpisah
  -- sebagai profit_payout_out saat uang benar-benar ditransfer.
  return new;
end;
$$;

create trigger trg_investor_ledger_kas
  after insert on public.investor_ledger
  for each row execute function public.kas_dari_investor_ledger();

-- ---------------------------------------------------------------------
-- Trigger: units → kas (saat status pindah)
-- ---------------------------------------------------------------------
create or replace function public.kas_dari_units()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'paid_to_seller' then
    perform public.catat_kas(now(), 'out', 'unit_purchase_out', new.harga_beli,
      'units', new.id, 'Pembayaran ke penjual: ' || new.model);
  elsif new.status = 'delivered_paid' then
    perform public.catat_kas(now(), 'in', 'unit_sale_in', new.harga_jual,
      'units', new.id, 'Pembayaran dari buyer: ' || new.model);
  end if;

  return new;
end;
$$;

create trigger trg_units_kas
  after update on public.units
  for each row execute function public.kas_dari_units();

-- ---------------------------------------------------------------------
-- Trigger: courier_transactions → kas
--
-- CATATAN: memakai fee_gross + reimbursement_bensin (= fee_net_kurir), yaitu
-- uang yang BENAR-BENAR keluar ke kurir. Kalau hanya fee_gross yang dicatat,
-- rekonsiliasi terhadap Bank Jago akan meleset sebesar reimbursement bensin
-- di setiap perjalanan — persis jenis selisih diam yang sistem ini dibuat
-- untuk mencegahnya.
-- ---------------------------------------------------------------------
create or replace function public.kas_dari_courier_tx()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.catat_kas(new.tanggal, 'out', 'courier_fee_out',
    new.fee_gross + new.reimbursement_bensin,
    'courier_transactions', new.id, 'Fee kurir');
  return new;
end;
$$;

create trigger trg_courier_tx_kas
  after insert on public.courier_transactions
  for each row execute function public.kas_dari_courier_tx();

-- ---------------------------------------------------------------------
-- Trigger: cancellation_deposits → kas
-- ---------------------------------------------------------------------
create or replace function public.kas_dari_cancellation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.catat_kas(new.tanggal, 'in', 'cancellation_deposit_in',
    new.jumlah, 'cancellation_deposits', new.id, 'Deposit pembatalan');
  return new;
end;
$$;

create trigger trg_cancellation_kas
  after insert on public.cancellation_deposits
  for each row execute function public.kas_dari_cancellation();

-- ---------------------------------------------------------------------
-- Trigger: operational_expenses → kas
-- ---------------------------------------------------------------------
create or replace function public.kas_dari_operational_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.catat_kas(new.tanggal::timestamptz, 'out',
    'operational_expense_out', new.jumlah,
    'operational_expenses', new.id,
    coalesce(new.deskripsi, new.kategori::text));
  return new;
end;
$$;

create trigger trg_operational_expenses_kas
  after insert on public.operational_expenses
  for each row execute function public.kas_dari_operational_expense();

-- ---------------------------------------------------------------------
-- View: kas dengan saldo berjalan
-- ---------------------------------------------------------------------
create or replace view public.v_cash_ledger_running
with (security_invoker = true) as
select
  c.*,
  sum(c.delta) over (
    order by c.tanggal, c.created_at, c.id
    rows between unbounded preceding and current row
  ) as saldo_running
from public.cash_ledger c;

-- Saldo kas per tanggal tertentu — dipakai rekonsiliasi bank.
create or replace function public.saldo_kas_per_tanggal(p_tanggal timestamptz)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(delta), 0)
  from public.cash_ledger
  where tanggal <= p_tanggal;
$$;

grant execute on function public.saldo_kas_per_tanggal(timestamptz) to authenticated;

create or replace function public.saldo_kas_sekarang()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(delta), 0) from public.cash_ledger;
$$;

grant execute on function public.saldo_kas_sekarang() to authenticated;

-- ---------------------------------------------------------------------
-- View agregat keuangan
-- ---------------------------------------------------------------------
create or replace view public.v_financial_summary
with (security_invoker = true) as
select
  public.saldo_kas_sekarang() as saldo_kas_bisnis_saat_ini,
  (select coalesce(sum(
     case l.tipe
       when 'capital_call' then l.jumlah
       when 'return_of_capital' then -l.jumlah
       else 0
     end), 0)
   from public.investor_ledger l) as total_outstanding_investor,
  (select coalesce(sum(ps.admin_final_profit + ps.partner_final_profit), 0)
   from public.profit_split ps
   where ps.payout_status = 'belum_ditarik')
    as total_ekuitas_admin_partner_belum_ditarik,
  (select coalesce(sum(ps.admin_final_profit), 0)
   from public.profit_split ps
   where ps.payout_status = 'belum_ditarik') as ekuitas_admin_belum_ditarik,
  (select coalesce(sum(ps.partner_final_profit), 0)
   from public.profit_split ps
   where ps.payout_status = 'belum_ditarik') as ekuitas_partner_belum_ditarik;

grant select on public.v_financial_summary, public.v_cash_ledger_running
  to authenticated;

-- ---------------------------------------------------------------------
-- Laba rugi periode
-- ---------------------------------------------------------------------
create or replace function public.laba_rugi_periode(
  p_mulai   date,
  p_selesai date
)
returns table (
  total_margin_settled     numeric,
  total_biaya_operasional  numeric,
  laba_bersih              numeric,
  jumlah_unit_settled      bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with margin as (
    select
      coalesce(sum(ps.margin_bruto), 0) as total,
      count(*) as unit
    from public.profit_split ps
    where ps.tanggal_settle::date between p_mulai and p_selesai
  ),
  opex as (
    select coalesce(sum(oe.jumlah), 0) as total
    from public.operational_expenses oe
    where oe.tanggal between p_mulai and p_selesai
  )
  select
    margin.total,
    opex.total,
    margin.total - opex.total,
    margin.unit
  from margin, opex;
$$;

grant execute on function public.laba_rugi_periode(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- Rekonsiliasi: bandingkan mutasi bank vs saldo kas app pada tanggal itu.
-- Tabel bank_reconciliation TIDAK diubah strukturnya (tidak ada breaking
-- change); angka app-nya disediakan lewat view turunan ini.
-- ---------------------------------------------------------------------
create or replace view public.v_bank_reconciliation
with (security_invoker = true) as
select
  br.*,
  public.saldo_kas_per_tanggal(br.tanggal::timestamptz) as saldo_kas_app,
  br.mutasi_bank_jago - public.saldo_kas_per_tanggal(br.tanggal::timestamptz)
    as selisih_vs_kas_app,
  (br.mutasi_bank_jago - public.saldo_kas_per_tanggal(br.tanggal::timestamptz)) <> 0
    as flagged_vs_kas_app
from public.bank_reconciliation br;

grant select on public.v_bank_reconciliation to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.cash_ledger          enable row level security;
alter table public.operational_expenses enable row level security;

create policy kas_admin_all on public.cash_ledger
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy kas_read_all_roles on public.cash_ledger
  for select to authenticated
  using (public.is_partner() or public.is_investor());

create policy opex_admin_all on public.operational_expenses
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy opex_read_all_roles on public.operational_expenses
  for select to authenticated
  using (public.is_partner() or public.is_investor());

-- ---------------------------------------------------------------------
-- Audit + larangan hard-delete untuk tabel baru
-- ---------------------------------------------------------------------
create trigger trg_cash_ledger_audit
  after insert or update on public.cash_ledger
  for each row execute function public.log_audit();

create trigger trg_cash_ledger_no_delete
  before delete on public.cash_ledger
  for each row execute function public.block_hard_delete();

create trigger trg_operational_expenses_audit
  after insert or update on public.operational_expenses
  for each row execute function public.log_audit();

create trigger trg_operational_expenses_no_delete
  before delete on public.operational_expenses
  for each row execute function public.block_hard_delete();
