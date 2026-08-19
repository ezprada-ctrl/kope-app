-- =====================================================================
-- 0018 — Engine profit sharing: konfigurasi bebas, penerapan terkunci
--
-- Menggantikan mekanisme lama (profit_share_settings tunggal + nisbah
-- diambil saat settle) dengan skema bertingkat yang di-SNAPSHOT ke unit
-- pada saat dana dialokasikan definitif.
--
-- Cacat J2 yang diperbaiki di sini:
--   settle_unit() lama mengambil nisbah yang berlaku pada waktu SETTLE.
--   Akibatnya unit yang capital call-nya disetujui Januari dengan nisbah
--   60:40, kalau baru di-settle Maret setelah nisbah diubah, dibagi pakai
--   nisbah Maret. Pemodal terikat angka yang belum ada saat menyerahkan
--   uang. Sekarang nisbah dikunci pada satu momen tunggal: saat dana
--   dialokasikan definitif ke unit.
--
-- Dua skenario penguncian, prinsip sama:
--   direct_capital_call — saat capital call untuk unit itu diterima.
--   pool               — saat unit dibeli memakai dana pool (status pindah
--                        ke paid_to_seller). Skema yang berlaku pada
--                        TANGGAL PEMBELIAN, bukan saat dana masuk pool.
--
-- profit_share_settings TIDAK dihapus; masih dipakai settle_unit sampai
-- engine ini dipasang ke perhitungan. Migrasi ini membangun fondasinya.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. parties — penerima bagi hasil
--
--    SENGAJA bukan enum role. Penerima bagi hasil adalah identitas bisnis
--    yang berumur panjang; role login bisa berubah, dan mengikat uang ke
--    role membuat perubahan akses diam-diam mengubah siapa dibayar.
-- ---------------------------------------------------------------------
create table if not exists public.parties (
  id         uuid primary key default gen_random_uuid(),
  kode       text not null unique,
  nama       text not null,
  profile_id uuid references public.profiles (id),
  aktif      boolean not null default true,
  urutan     integer not null default 0,
  catatan    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.parties enable row level security;

comment on table public.parties is
  'Pihak penerima bagi hasil. Dipisahkan dari role login supaya perubahan '
  'akses tidak diam-diam mengubah siapa yang dibayar.';

drop trigger if exists trg_parties_touch on public.parties;
create trigger trg_parties_touch before update on public.parties
  for each row execute function public.touch_updated_at();

insert into public.parties (kode, nama, urutan, catatan)
values
  ('pemodal_us', 'Pemodal — Untung Store', 1, 'Shahibul mal.'),
  ('owner_1',    'Owner 1 (KOPE)',        2, 'Pemegang mekanisme keuangan.'),
  ('owner_2',    'Owner 2 (KOPE)',        3, 'Owner kedua KOPE.')
on conflict (kode) do nothing;

-- Tautkan Owner 1 ke akun super_admin yang ada, kalau ada.
update public.parties p
   set profile_id = (select id from public.profiles where role = 'super_admin' limit 1)
 where p.kode = 'owner_1' and p.profile_id is null;

-- ---------------------------------------------------------------------
-- 2. contracts — entitas akad (J1)
-- ---------------------------------------------------------------------
do $$ begin
  create type public.jenis_akad as enum ('mudharabah', 'musyarakah', 'wakalah', 'lainnya');
exception when duplicate_object then null; end $$;

create table if not exists public.contracts (
  id             uuid primary key default gen_random_uuid(),
  nomor          text unique,
  jenis_akad     public.jenis_akad not null,
  nama           text not null,
  pihak_pertama  uuid references public.parties (id),
  pihak_kedua    uuid references public.parties (id),
  tanggal_mulai  date not null,
  tanggal_akhir  date,
  dokumen_url    text,
  catatan        text,
  dicatat_oleh   uuid references public.profiles (id) default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint periode_akad_masuk_akal
    check (tanggal_akhir is null or tanggal_akhir >= tanggal_mulai)
);
alter table public.contracts enable row level security;

drop trigger if exists trg_contracts_touch on public.contracts;
create trigger trg_contracts_touch before update on public.contracts
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_contracts_audit on public.contracts;
create trigger trg_contracts_audit after insert or update on public.contracts
  for each row execute function public.log_audit();

-- ---------------------------------------------------------------------
-- 3. profit_schemes
-- ---------------------------------------------------------------------
do $$ begin
  create type public.basis_perhitungan as enum
    ('gross_margin', 'net_profit_after_direct_cost', 'net_profit_after_all_cost');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.scheme_status as enum ('draft', 'active', 'archived');
exception when duplicate_object then null; end $$;

create table if not exists public.profit_schemes (
  id                     uuid primary key default gen_random_uuid(),
  nama_skema             text not null,
  keterangan             text,
  basis_perhitungan      public.basis_perhitungan not null default 'gross_margin',
  deal_type_target       public.deal_type not null,
  status                 public.scheme_status not null default 'draft',
  berlaku_dari           date not null,
  berlaku_sampai         date,
  contract_id            uuid references public.contracts (id),

  -- Biaya yang boleh dipotong sebelum bagi hasil (D3). Konfigurasi, bukan
  -- hardcode: daftar nama kolom biaya di units.
  whitelist_biaya        jsonb not null default '[]'::jsonb,

  dibuat_oleh            uuid references public.profiles (id) default auth.uid(),
  disetujui_oleh         uuid references public.profiles (id),
  disetujui_pada         timestamptz,
  dokumen_persetujuan_url text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  locked_at              timestamptz,

  constraint periode_skema_masuk_akal
    check (berlaku_sampai is null or berlaku_sampai >= berlaku_dari),

  -- Skema mudharabah wajib menunjuk akad. mandiri_internal tidak.
  constraint akad_wajib_untuk_mudharabah
    check (deal_type_target <> 'mudharabah' or contract_id is not null),

  -- Tidak boleh aktif tanpa persetujuan tercatat.
  constraint aktif_wajib_disetujui
    check (status <> 'active' or (disetujui_oleh is not null and disetujui_pada is not null))
);
alter table public.profit_schemes enable row level security;

create index if not exists profit_schemes_lookup_idx
  on public.profit_schemes (deal_type_target, status, berlaku_dari desc);

drop trigger if exists trg_profit_schemes_touch on public.profit_schemes;
create trigger trg_profit_schemes_touch before update on public.profit_schemes
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_profit_schemes_audit on public.profit_schemes;
create trigger trg_profit_schemes_audit after insert or update on public.profit_schemes
  for each row execute function public.log_audit();

-- ---------------------------------------------------------------------
-- 4. profit_scheme_tiers — pembagian bertingkat
--
--    level 1 = pembagian pertama dari basis, level 2 = dari sisa level 1,
--    dan seterusnya.
-- ---------------------------------------------------------------------
create table if not exists public.profit_scheme_tiers (
  id         uuid primary key default gen_random_uuid(),
  scheme_id  uuid not null references public.profit_schemes (id) on delete restrict,
  level      integer not null check (level >= 1),
  pihak_id   uuid not null references public.parties (id) on delete restrict,
  persentase numeric(7,4) not null check (persentase >= 0 and persentase <= 100),
  urutan     integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (scheme_id, level, pihak_id)
);
alter table public.profit_scheme_tiers enable row level security;

create index if not exists tiers_scheme_idx
  on public.profit_scheme_tiers (scheme_id, level, urutan);

drop trigger if exists trg_tiers_touch on public.profit_scheme_tiers;
create trigger trg_tiers_touch before update on public.profit_scheme_tiers
  for each row execute function public.touch_updated_at();

-- Total persentase per level WAJIB 100. Ditegakkan database, bukan aplikasi.
-- Constraint trigger DEFERRABLE supaya beberapa baris bisa dimasukkan dalam
-- satu transaksi dan totalnya baru diperiksa saat commit.
create or replace function public.cek_total_tier()
returns trigger language plpgsql set search_path = public
as $$
declare
  v_scheme uuid := coalesce(new.scheme_id, old.scheme_id);
  v_level  integer := coalesce(new.level, old.level);
  v_total  numeric(9,4);
begin
  select coalesce(sum(t.persentase), 0) into v_total
  from public.profit_scheme_tiers t
  where t.scheme_id = v_scheme and t.level = v_level;

  -- Level yang dikosongkan seluruhnya dianggap dihapus, bukan salah.
  if v_total = 0 then return null; end if;

  if v_total <> 100 then
    raise exception
      'Total persentase level % pada skema ini = %, harus tepat 100.',
      v_level, v_total using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

drop trigger if exists trg_tier_total on public.profit_scheme_tiers;
create constraint trigger trg_tier_total
  after insert or update or delete on public.profit_scheme_tiers
  deferrable initially deferred
  for each row execute function public.cek_total_tier();

-- ---------------------------------------------------------------------
-- 5. unit_profit_snapshot — INI yang dipakai menghitung, bukan join live
-- ---------------------------------------------------------------------
create table if not exists public.unit_profit_snapshot (
  unit_id                   uuid primary key
                              references public.units (id) on delete restrict,
  scheme_id                 uuid not null
                              references public.profit_schemes (id) on delete restrict,
  snapshot_json             jsonb not null,
  basis_perhitungan_snapshot public.basis_perhitungan not null,
  whitelist_biaya_snapshot  jsonb not null,
  funding_source_at_snapshot public.funding_source not null,
  dikunci_pada              timestamptz not null default now()
);
alter table public.unit_profit_snapshot enable row level security;

comment on table public.unit_profit_snapshot is
  'Salinan lengkap tier saat nisbah dikunci. Perhitungan profit WAJIB baca '
  'dari sini. Join live ke profit_scheme_tiers untuk keperluan selain '
  'preview/simulator adalah bug: skema induk bisa diarsipkan atau berubah.';

-- ---------------------------------------------------------------------
-- 6. Skema terpakai tidak bisa diubah, hanya diarsipkan
-- ---------------------------------------------------------------------
create or replace function public.kunci_skema_terpakai()
returns trigger language plpgsql set search_path = public
as $$
begin
  if not exists (select 1 from public.unit_profit_snapshot s where s.scheme_id = old.id) then
    return new;
  end if;

  -- Satu-satunya perubahan yang diizinkan: mengarsipkan.
  if new.status = 'archived'
     and new.nama_skema        is not distinct from old.nama_skema
     and new.basis_perhitungan is not distinct from old.basis_perhitungan
     and new.deal_type_target  is not distinct from old.deal_type_target
     and new.berlaku_dari      is not distinct from old.berlaku_dari
     and new.contract_id       is not distinct from old.contract_id
     and new.whitelist_biaya   is not distinct from old.whitelist_biaya then
    return new;
  end if;

  raise exception
    'Skema ini sudah dipakai unit yang nisbahnya terkunci. Skema terpakai '
    'tidak boleh diubah — buat skema baru, lalu arsipkan yang lama.'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_kunci_skema on public.profit_schemes;
create trigger trg_kunci_skema before update on public.profit_schemes
  for each row execute function public.kunci_skema_terpakai();

create or replace function public.kunci_tier_terpakai()
returns trigger language plpgsql set search_path = public
as $$
declare v_scheme uuid := coalesce(new.scheme_id, old.scheme_id);
begin
  if exists (select 1 from public.unit_profit_snapshot s where s.scheme_id = v_scheme) then
    raise exception
      'Tier skema ini tidak bisa diubah karena skemanya sudah dipakai unit '
      'yang nisbahnya terkunci. Buat skema baru.'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_kunci_tier on public.profit_scheme_tiers;
create trigger trg_kunci_tier before insert or update or delete on public.profit_scheme_tiers
  for each row execute function public.kunci_tier_terpakai();

-- ---------------------------------------------------------------------
-- 7. Penguncian snapshot
-- ---------------------------------------------------------------------
create or replace function public.kunci_snapshot_nisbah(
  p_unit_id  uuid,
  p_funding  public.funding_source,
  p_tanggal  date default current_date
)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_unit   public.units;
  v_scheme public.profit_schemes;
  v_tiers  jsonb;
begin
  if exists (select 1 from public.unit_profit_snapshot where unit_id = p_unit_id) then
    return; -- sudah terkunci, jangan pernah ditimpa
  end if;

  select * into v_unit from public.units where id = p_unit_id;
  if not found then return; end if;

  select * into v_scheme
    from public.profit_schemes s
   where s.deal_type_target = v_unit.deal_type
     and s.status = 'active'
     and s.berlaku_dari <= p_tanggal
     and (s.berlaku_sampai is null or s.berlaku_sampai >= p_tanggal)
   order by s.berlaku_dari desc, s.created_at desc
   limit 1;

  -- Belum ada skema aktif: jangan menghalangi operasional. settle_unit
  -- masih memakai profit_share_settings sampai engine dipasang ke
  -- perhitungan, jadi tidak ada yang rusak kalau snapshot belum terbentuk.
  if not found then return; end if;

  select jsonb_agg(jsonb_build_object(
           'level', t.level,
           'pihak_id', t.pihak_id,
           'pihak_kode', pa.kode,
           'pihak_nama', pa.nama,
           'persentase', t.persentase,
           'urutan', t.urutan)
         order by t.level, t.urutan)
    into v_tiers
  from public.profit_scheme_tiers t
  join public.parties pa on pa.id = t.pihak_id
  where t.scheme_id = v_scheme.id;

  if v_tiers is null then return; end if;

  insert into public.unit_profit_snapshot (
    unit_id, scheme_id, snapshot_json, basis_perhitungan_snapshot,
    whitelist_biaya_snapshot, funding_source_at_snapshot)
  values (
    p_unit_id, v_scheme.id, v_tiers, v_scheme.basis_perhitungan,
    v_scheme.whitelist_biaya, p_funding)
  on conflict (unit_id) do nothing;
end;
$$;

-- Skenario 1: capital call langsung per unit.
create or replace function public.snapshot_dari_capital_call()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.tipe = 'capital_call' and new.unit_id is not null then
    update public.units
       set funding_source = coalesce(funding_source, 'direct_capital_call')
     where id = new.unit_id;

    perform public.kunci_snapshot_nisbah(
      new.unit_id, 'direct_capital_call', new.tanggal::date);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_snapshot_capital_call on public.pemodal_ledger;
create trigger trg_snapshot_capital_call
  after insert on public.pemodal_ledger
  for each row execute function public.snapshot_dari_capital_call();

-- Skenario 2: unit dibeli memakai dana pool.
create or replace function public.snapshot_dari_pembelian_pool()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'paid_to_seller'
     and new.status is distinct from old.status
     and new.funding_source = 'pool' then
    perform public.kunci_snapshot_nisbah(new.id, 'pool', current_date);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_snapshot_pool on public.units;
create trigger trg_snapshot_pool
  after update on public.units
  for each row execute function public.snapshot_dari_pembelian_pool();

-- ---------------------------------------------------------------------
-- 8. Policy RLS
--    (enable row level security sudah menyala bersamaan dengan CREATE TABLE
--    di atas — Supabase memperingatkan kalau tabel sempat lahir tanpa RLS,
--    dan peringatan itu benar.)
-- ---------------------------------------------------------------------
drop policy if exists parties_baca on public.parties;
create policy parties_baca on public.parties for select to authenticated
  using (public.orang_dalam() or public.is_pemodal());
drop policy if exists parties_tulis on public.parties;
create policy parties_tulis on public.parties for all to authenticated
  using (public.bisa_tulis()) with check (public.bisa_tulis());

drop policy if exists contracts_baca on public.contracts;
create policy contracts_baca on public.contracts for select to authenticated
  using (public.orang_dalam() or public.is_pemodal());
drop policy if exists contracts_tulis on public.contracts;
create policy contracts_tulis on public.contracts for all to authenticated
  using (public.bisa_tulis()) with check (public.bisa_tulis());

-- Skema mandiri_internal HARAM dilihat pemodal.
drop policy if exists skema_baca_orang_dalam on public.profit_schemes;
create policy skema_baca_orang_dalam on public.profit_schemes for select to authenticated
  using (public.orang_dalam());
drop policy if exists skema_baca_pemodal on public.profit_schemes;
create policy skema_baca_pemodal on public.profit_schemes for select to authenticated
  using (public.is_pemodal() and deal_type_target <> 'mandiri_internal');
drop policy if exists skema_engine_tulis on public.profit_schemes;
create policy skema_engine_tulis on public.profit_schemes for all to authenticated
  using (public.bisa_tulis()) with check (public.bisa_tulis());

drop policy if exists tier_baca_orang_dalam on public.profit_scheme_tiers;
create policy tier_baca_orang_dalam on public.profit_scheme_tiers for select to authenticated
  using (public.orang_dalam());
drop policy if exists tier_baca_pemodal on public.profit_scheme_tiers;
create policy tier_baca_pemodal on public.profit_scheme_tiers for select to authenticated
  using (public.is_pemodal() and exists (
    select 1 from public.profit_schemes s
    where s.id = scheme_id and s.deal_type_target <> 'mandiri_internal'));
drop policy if exists tier_tulis on public.profit_scheme_tiers;
create policy tier_tulis on public.profit_scheme_tiers for all to authenticated
  using (public.bisa_tulis()) with check (public.bisa_tulis());

drop policy if exists snapshot_baca_orang_dalam on public.unit_profit_snapshot;
create policy snapshot_baca_orang_dalam on public.unit_profit_snapshot for select to authenticated
  using (public.orang_dalam());
drop policy if exists snapshot_baca_pemodal on public.unit_profit_snapshot;
create policy snapshot_baca_pemodal on public.unit_profit_snapshot for select to authenticated
  using (public.is_pemodal() and public.funds_unit(unit_id)
         and not public.unit_internal(unit_id));
drop policy if exists snapshot_tulis on public.unit_profit_snapshot;
create policy snapshot_tulis on public.unit_profit_snapshot for all to authenticated
  using (public.bisa_tulis()) with check (public.bisa_tulis());
