-- =====================================================================
-- 0015 — Urbun: deposit hangus dibatasi kerugian riil
--
-- Kebijakan final (19 Agustus 2026): uang muka yang hangus HANYA sebesar
-- kerugian riil yang benar-benar terjadi; sisanya wajib dikembalikan ke
-- customer. Sebelumnya seluruh deposit langsung jadi revenue.
--
-- Contoh yang sudah dikonfirmasi benar:
--   Deposit 75.000, bensin 10.000, upah kurir 50.000
--   -> kerugian_riil_total 60.000, jumlah_ditahan 60.000,
--      jumlah_dikembalikan 15.000
--
-- CATATAN AKUNTANSI PENTING:
-- Komponen kerugian (bensin, upah kurir) SUDAH tercatat sebagai kas keluar
-- lewat courier_transactions. Rincian di sini murni justifikasi audit dan
-- SENGAJA tidak melahirkan entri kas sendiri — kalau tidak, biayanya
-- terhitung dua kali.
--
-- URUTAN: nilai enum 'cancellation_refund_out' ditambahkan di run TERPISAH
-- sebelum file ini.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Whitelist komponen kerugian — KONFIGURASI, bukan hardcode
--
--    Dua komponen awal cuma seed. Menambah komponen = insert baris baru
--    lewat UI, bukan migrasi baru.
-- ---------------------------------------------------------------------
create table if not exists public.loss_components (
  id         uuid primary key default gen_random_uuid(),
  kode       text not null unique,
  nama       text not null,
  aktif      boolean not null default true,
  urutan     integer not null default 0,
  catatan    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.loss_components is
  'Whitelist komponen yang boleh dihitung sebagai kerugian riil saat deposit '
  'pembatalan hangus. Bisa ditambah lewat UI — jangan hardcode di kode.';

drop trigger if exists trg_loss_components_touch on public.loss_components;
create trigger trg_loss_components_touch
  before update on public.loss_components
  for each row execute function public.touch_updated_at();

insert into public.loss_components (kode, nama, urutan, catatan)
values
  ('bensin_kurir', 'Biaya bensin / bahan bakar kurir', 1,
   'Seed awal sesuai kebijakan urbun.'),
  ('upah_kurir',   'Upah kurir', 2,
   'Seed awal sesuai kebijakan urbun.')
on conflict (kode) do nothing;

-- ---------------------------------------------------------------------
-- 2. Rincian kerugian per deposit — item per item supaya bisa diaudit
-- ---------------------------------------------------------------------
create table if not exists public.cancellation_loss_items (
  id                      uuid primary key default gen_random_uuid(),
  cancellation_deposit_id uuid not null
                            references public.cancellation_deposits (id) on delete restrict,
  component_id            uuid not null
                            references public.loss_components (id) on delete restrict,
  jumlah                  numeric(18,2) not null check (jumlah > 0),
  catatan                 text,
  dicatat_oleh            uuid references public.profiles (id) default auth.uid(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- Satu baris per komponen supaya rincian tetap terbaca item per item.
  unique (cancellation_deposit_id, component_id)
);

create index if not exists cli_deposit_idx
  on public.cancellation_loss_items (cancellation_deposit_id);

drop trigger if exists trg_cli_touch on public.cancellation_loss_items;
create trigger trg_cli_touch
  before update on public.cancellation_loss_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 3. Kolom di cancellation_deposits
--
--    jumlah_ditahan & jumlah_dikembalikan GENERATED di database, jadi
--    aritmetikanya mustahil melenceng dari kerugian_riil_total. LEAST()
--    dipakai karena kalau kerugian riil melebihi deposit, yang bisa
--    ditahan tetap maksimal sebesar deposit — sisanya nol, bukan negatif.
-- ---------------------------------------------------------------------
alter table public.cancellation_deposits
  add column if not exists kerugian_riil_total numeric(18,2) not null default 0
    check (kerugian_riil_total >= 0);

alter table public.cancellation_deposits
  add column if not exists jumlah_ditahan numeric(18,2)
    generated always as (least(kerugian_riil_total, jumlah)) stored;

alter table public.cancellation_deposits
  add column if not exists jumlah_dikembalikan numeric(18,2)
    generated always as (jumlah - least(kerugian_riil_total, jumlah)) stored;

comment on column public.cancellation_deposits.kerugian_riil_total is
  'SUM rincian di cancellation_loss_items. Dipaksa trigger — tidak boleh '
  'diisi manual, supaya tidak bisa berbeda dari rinciannya.';
comment on column public.cancellation_deposits.jumlah_ditahan is
  'GENERATED least(kerugian_riil_total, jumlah). Yang benar-benar hangus.';
comment on column public.cancellation_deposits.jumlah_dikembalikan is
  'GENERATED jumlah - jumlah_ditahan. Wajib dikembalikan ke customer.';

-- ---------------------------------------------------------------------
-- 4. kerugian_riil_total dipaksa sama dengan SUM rincian
--
--    Diminta eksplisit: kalau diisi manual berbeda dari SUM komponen,
--    TOLAK simpan. Bukan diam-diam ditimpa — supaya salah input berbunyi.
-- ---------------------------------------------------------------------
create or replace function public.cek_kerugian_riil_total()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_sum numeric(18,2);
begin
  select coalesce(sum(li.jumlah), 0) into v_sum
  from public.cancellation_loss_items li
  where li.cancellation_deposit_id = new.id;

  if new.kerugian_riil_total is distinct from v_sum then
    raise exception
      'kerugian_riil_total (%) tidak cocok dengan total rincian kerugian (%). '
      'Kolom ini tidak boleh diisi manual — ubah rinciannya di cancellation_loss_items.',
      new.kerugian_riil_total, v_sum
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cd_cek_kerugian on public.cancellation_deposits;
create trigger trg_cd_cek_kerugian
  before insert or update on public.cancellation_deposits
  for each row execute function public.cek_kerugian_riil_total();

-- Rincian berubah -> total di induknya ikut dihitung ulang.
create or replace function public.hitung_ulang_kerugian_riil()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_deposit uuid := coalesce(new.cancellation_deposit_id, old.cancellation_deposit_id);
  v_sum     numeric(18,2);
begin
  select coalesce(sum(li.jumlah), 0) into v_sum
  from public.cancellation_loss_items li
  where li.cancellation_deposit_id = v_deposit;

  update public.cancellation_deposits
     set kerugian_riil_total = v_sum
   where id = v_deposit;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_cli_hitung on public.cancellation_loss_items;
create trigger trg_cli_hitung
  after insert or update or delete on public.cancellation_loss_items
  for each row execute function public.hitung_ulang_kerugian_riil();

-- ---------------------------------------------------------------------
-- 5. resolve_deposit: hangus wajib berdasar rincian, sisanya dikembalikan
-- ---------------------------------------------------------------------
create or replace function public.resolve_deposit(
  p_deposit_id uuid,
  p_status     public.cancellation_status
)
returns public.cancellation_deposits
language plpgsql
set search_path = public
as $$
declare
  v_deposit public.cancellation_deposits;
begin
  if p_status not in ('applied_to_transaction', 'forfeited_as_revenue') then
    raise exception 'Status resolve tidak valid: %.', p_status
      using errcode = 'check_violation';
  end if;

  select * into v_deposit
    from public.cancellation_deposits
   where id = p_deposit_id
   for update;

  if not found then
    raise exception 'Deposit tidak ditemukan.' using errcode = 'no_data_found';
  end if;

  if v_deposit.status <> 'pending' then
    raise exception 'Deposit ini sudah diselesaikan (status: %).', v_deposit.status
      using errcode = 'check_violation';
  end if;

  -- Deposit tidak boleh dinyatakan hangus tanpa bukti kerugian riil.
  if p_status = 'forfeited_as_revenue'
     and not exists (select 1 from public.cancellation_loss_items li
                     where li.cancellation_deposit_id = p_deposit_id) then
    raise exception
      'Rincian kerugian riil wajib diisi sebelum deposit dinyatakan hangus. '
      'Tanpa rincian, seluruh deposit akan hangus — itu yang mau dicegah.'
      using errcode = 'check_violation';
  end if;

  update public.cancellation_deposits
     set status = p_status,
         tanggal_resolve = now()
   where id = p_deposit_id
  returning * into v_deposit;

  -- Sisa yang bukan kerugian riil WAJIB kembali ke customer -> kas keluar.
  -- Kas masuk sebesar deposit penuh sudah dicatat saat deposit diterima,
  -- jadi net revenue = jumlah_ditahan. Komponen kerugiannya sendiri tidak
  -- dicatat di sini karena sudah keluar lewat courier_transactions.
  if p_status = 'forfeited_as_revenue' and v_deposit.jumlah_dikembalikan > 0 then
    perform public.catat_kas(
      now(), 'out', 'cancellation_refund_out', v_deposit.jumlah_dikembalikan,
      'cancellation_deposits', v_deposit.id,
      'Pengembalian sisa deposit (deposit ' || v_deposit.jumlah ||
      ' dikurangi kerugian riil ' || v_deposit.jumlah_ditahan || ')');
  end if;

  return v_deposit;
end;
$$;

grant execute on function public.resolve_deposit(uuid, public.cancellation_status)
  to authenticated;

-- ---------------------------------------------------------------------
-- 6. Audit + larangan hard delete untuk tabel baru
-- ---------------------------------------------------------------------
drop trigger if exists trg_cancellation_loss_items_audit on public.cancellation_loss_items;
create trigger trg_cancellation_loss_items_audit
  after insert or update on public.cancellation_loss_items
  for each row execute function public.log_audit();

drop trigger if exists trg_cancellation_loss_items_no_delete on public.cancellation_loss_items;
create trigger trg_cancellation_loss_items_no_delete
  before delete on public.cancellation_loss_items
  for each row execute function public.block_hard_delete();

drop trigger if exists trg_loss_components_audit on public.loss_components;
create trigger trg_loss_components_audit
  after insert or update on public.loss_components
  for each row execute function public.log_audit();

-- ---------------------------------------------------------------------
-- 7. RLS — wajib sejak tabel dibuat
-- ---------------------------------------------------------------------
alter table public.loss_components          enable row level security;
alter table public.cancellation_loss_items  enable row level security;

create policy komponen_rugi_baca on public.loss_components
  for select to authenticated
  using (public.orang_dalam() or public.is_pemodal());
create policy komponen_rugi_tulis on public.loss_components
  for all to authenticated
  using (public.bisa_tulis()) with check (public.bisa_tulis());

create policy rincian_rugi_baca_orang_dalam on public.cancellation_loss_items
  for select to authenticated using (public.orang_dalam());
create policy rincian_rugi_baca_pemodal on public.cancellation_loss_items
  for select to authenticated
  using (public.is_pemodal() and exists (
    select 1 from public.cancellation_deposits cd
    where cd.id = cancellation_deposit_id
      and public.funds_unit(cd.unit_id)
      and not public.unit_internal(cd.unit_id)));
create policy rincian_rugi_tulis on public.cancellation_loss_items
  for all to authenticated
  using (public.bisa_tulis()) with check (public.bisa_tulis());

-- ---------------------------------------------------------------------
-- 8. View deposit diperluas dengan angka urbun
--
--    DROP dulu, bukan CREATE OR REPLACE: `cd.*` menyisipkan 3 kolom baru
--    di tengah, sedangkan REPLACE hanya boleh menambah kolom di akhir
--    (Postgres 42P16).
-- ---------------------------------------------------------------------
drop view if exists public.v_cancellation_deposits;

create view public.v_cancellation_deposits
with (security_invoker = true) as
select
  cd.*,
  u.model  as unit_model,
  u.kode   as unit_kode,
  u.status as unit_status
from public.cancellation_deposits cd
join public.units u on u.id = cd.unit_id;

grant select on public.v_cancellation_deposits to authenticated;
