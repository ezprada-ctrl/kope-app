-- =====================================================================
-- 0021 — Mode data dummy: tandai, sembunyikan, tampilkan lagi
--
-- Kebutuhan: latihan/demo pakai data contoh sebelum data asli masuk,
-- dan cara "membersihkan" data itu nanti begitu data asli mulai jalan.
-- Solusinya BUKAN hapus baris — aplikasi ini sengaja tidak bisa
-- hard-delete data finansial (persis mekanisme yang mencegah kejadian
-- dana hilang di masa lalu). Baris dummy tetap ada selamanya di database,
-- cuma disembunyikan dari SEMUA tampilan (dashboard, daftar, laporan)
-- begitu admin mematikan toggle "Tampilkan data dummy" — dan bisa
-- dimunculkan lagi kapan saja tanpa kehilangan apa pun. Baris asli tidak
-- pernah tersentuh oleh mekanisme ini.
--
-- Desain:
--   1. Kolom is_dummy ditambahkan HANYA ke tabel "akar" — yang diisi
--      langsung lewat form/RPC/script seed. Tabel turunan murni
--      (cash_ledger, notifications, audit_log, dan item-item rincian)
--      TIDAK dapat kolom sendiri — dummy-nya ditelusuri balik lewat
--      kolom rujukan generik yang sudah ada (ref_table/ref_id,
--      tabel_terdampak/record_id, dst). Sengaja begitu, supaya trigger
--      auto-generate yang sudah terbukti benar tidak perlu diubah.
--   2. RLS restrictive policy menyembunyikan baris dummy dari SEMUA query
--      langsung/view (yang jalan sebagai security_invoker).
--   3. Beberapa fungsi laporan (saldo_kas_*, laba_rugi_periode, dst.)
--      SENGAJA security definer supaya bisa diagregasi lintas baris tanpa
--      kena RLS pemodal — itu artinya mereka JUGA bypass RLS restrictive
--      yang baru ini. Fungsi-fungsi itu ditambah filter is_dummy manual
--      di sini, satu per satu, supaya laporan tidak diam-diam bocor
--      angka dummy setelah toggle dimatikan.
--
-- Form/action aplikasi TIDAK PERNAH mengirim is_dummy — kolomnya default
-- false. Satu-satunya cara suatu baris jadi is_dummy=true adalah lewat
-- scripts/seed-dummy.mjs yang jalan pakai service_role (bypass RLS by
-- design), bukan lewat UI. Alur tulis normal aplikasi sama sekali tidak
-- berubah oleh migrasi ini.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Kolom is_dummy di tabel akar.
-- ---------------------------------------------------------------------
alter table public.units                  add column if not exists is_dummy boolean not null default false;
alter table public.pemodal_ledger         add column if not exists is_dummy boolean not null default false;
alter table public.courier_master         add column if not exists is_dummy boolean not null default false;
alter table public.courier_transactions   add column if not exists is_dummy boolean not null default false;
alter table public.cancellation_deposits  add column if not exists is_dummy boolean not null default false;
alter table public.operational_expenses   add column if not exists is_dummy boolean not null default false;
alter table public.bank_reconciliation    add column if not exists is_dummy boolean not null default false;
alter table public.profit_split           add column if not exists is_dummy boolean not null default false;
alter table public.loss_allocation        add column if not exists is_dummy boolean not null default false;

comment on column public.units.is_dummy is
  'Data latihan/demo, bukan transaksi asli. Diisi HANYA lewat '
  'scripts/seed-dummy.mjs (service_role) — form aplikasi tidak pernah '
  'mengirim kolom ini, jadi selalu false lewat pemakaian normal.';

-- ---------------------------------------------------------------------
-- 2. Toggle global tunggal: tampilkan atau sembunyikan seluruh dummy.
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  id                    boolean primary key default true,
  tampilkan_data_dummy  boolean not null default true,
  updated_at            timestamptz not null default now(),

  constraint app_settings_singleton check (id = true)
);

comment on table public.app_settings is
  'Satu baris konfigurasi global. Kolom id dipaksa selalu true lewat '
  'CHECK supaya tabel ini tidak akan pernah punya lebih dari satu baris.';

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

drop trigger if exists trg_app_settings_touch on public.app_settings;
create trigger trg_app_settings_touch
  before update on public.app_settings
  for each row execute function public.touch_updated_at();

create or replace function public.dummy_data_visible()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select tampilkan_data_dummy from public.app_settings limit 1), true);
$$;

grant execute on function public.dummy_data_visible() to authenticated;

alter table public.app_settings enable row level security;

drop policy if exists app_settings_baca on public.app_settings;
create policy app_settings_baca on public.app_settings
  for select to authenticated using (true);

drop policy if exists app_settings_tulis on public.app_settings;
create policy app_settings_tulis on public.app_settings
  for update to authenticated
  using (public.bisa_tulis()) with check (public.bisa_tulis());

-- ---------------------------------------------------------------------
-- 3. Penelusuran dummy buat tabel turunan, lewat kolom rujukan yang
--    sudah ada — bukan kolom is_dummy baru. security definer WAJIB di
--    sini: kalau tidak, pemanggilan select is_dummy dari public.units di
--    dalam fungsi ini akan ikut kena RLS restrictive yang sedang dicek,
--    jadi muter balik/salah baca begitu togglenya mati.
-- ---------------------------------------------------------------------
create or replace function public.rujukan_ini_dummy(p_tabel text, p_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dummy      boolean;
  v_ref_tabel  text;
  v_ref_id     uuid;
begin
  if p_id is null or p_tabel is null then
    return false;
  end if;

  case p_tabel
    when 'units' then
      select is_dummy into v_dummy from public.units where id = p_id::uuid;
    when 'pemodal_ledger' then
      select is_dummy into v_dummy from public.pemodal_ledger where id = p_id::uuid;
    when 'courier_transactions' then
      select is_dummy into v_dummy from public.courier_transactions where id = p_id::uuid;
    when 'cancellation_deposits' then
      select is_dummy into v_dummy from public.cancellation_deposits where id = p_id::uuid;
    when 'operational_expenses' then
      select is_dummy into v_dummy from public.operational_expenses where id = p_id::uuid;
    when 'bank_reconciliation' then
      select is_dummy into v_dummy from public.bank_reconciliation where id = p_id::uuid;
    when 'profit_split' then
      select is_dummy into v_dummy from public.profit_split where id = p_id::uuid;
    when 'loss_allocation' then
      select is_dummy into v_dummy from public.loss_allocation where id = p_id::uuid;
    when 'cash_ledger' then
      select ref_table, ref_id into v_ref_tabel, v_ref_id
        from public.cash_ledger where id = p_id::uuid;
      if v_ref_tabel is not null then
        return public.rujukan_ini_dummy(v_ref_tabel, v_ref_id::text);
      end if;
      v_dummy := false;
    else
      v_dummy := false;
  end case;

  return coalesce(v_dummy, false);
exception when invalid_text_representation then
  -- record_id di audit_log kadang bukan uuid valid (mis. baris tabel lain
  -- yang bukan bagian dari alur dummy). Anggap saja bukan dummy.
  return false;
end;
$$;

grant execute on function public.rujukan_ini_dummy(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. RLS restrictive: di-AND-kan dengan seluruh policy permissive yang
--    sudah ada, tanpa perlu mengubah satu pun policy lama.
-- ---------------------------------------------------------------------
drop policy if exists sembunyikan_dummy on public.units;
create policy sembunyikan_dummy on public.units as restrictive
  for select to authenticated
  using (not is_dummy or public.dummy_data_visible());

drop policy if exists sembunyikan_dummy on public.pemodal_ledger;
create policy sembunyikan_dummy on public.pemodal_ledger as restrictive
  for select to authenticated
  using (not is_dummy or public.dummy_data_visible());

drop policy if exists sembunyikan_dummy on public.courier_master;
create policy sembunyikan_dummy on public.courier_master as restrictive
  for select to authenticated
  using (not is_dummy or public.dummy_data_visible());

drop policy if exists sembunyikan_dummy on public.courier_transactions;
create policy sembunyikan_dummy on public.courier_transactions as restrictive
  for select to authenticated
  using (not is_dummy or public.dummy_data_visible());

drop policy if exists sembunyikan_dummy on public.cancellation_deposits;
create policy sembunyikan_dummy on public.cancellation_deposits as restrictive
  for select to authenticated
  using (not is_dummy or public.dummy_data_visible());

drop policy if exists sembunyikan_dummy on public.operational_expenses;
create policy sembunyikan_dummy on public.operational_expenses as restrictive
  for select to authenticated
  using (not is_dummy or public.dummy_data_visible());

drop policy if exists sembunyikan_dummy on public.bank_reconciliation;
create policy sembunyikan_dummy on public.bank_reconciliation as restrictive
  for select to authenticated
  using (not is_dummy or public.dummy_data_visible());

drop policy if exists sembunyikan_dummy on public.profit_split;
create policy sembunyikan_dummy on public.profit_split as restrictive
  for select to authenticated
  using (not is_dummy or public.dummy_data_visible());

drop policy if exists sembunyikan_dummy on public.loss_allocation;
create policy sembunyikan_dummy on public.loss_allocation as restrictive
  for select to authenticated
  using (not is_dummy or public.dummy_data_visible());

drop policy if exists sembunyikan_dummy on public.loss_allocation_items;
create policy sembunyikan_dummy on public.loss_allocation_items as restrictive
  for select to authenticated
  using (
    public.dummy_data_visible()
    or not exists (
      select 1 from public.loss_allocation la
      where la.id = loss_allocation_id and la.is_dummy
    )
  );

drop policy if exists sembunyikan_dummy on public.cancellation_loss_items;
create policy sembunyikan_dummy on public.cancellation_loss_items as restrictive
  for select to authenticated
  using (
    public.dummy_data_visible()
    or not exists (
      select 1 from public.cancellation_deposits cd
      where cd.id = cancellation_deposit_id and cd.is_dummy
    )
  );

drop policy if exists sembunyikan_dummy on public.cash_ledger;
create policy sembunyikan_dummy on public.cash_ledger as restrictive
  for select to authenticated
  using (
    public.dummy_data_visible()
    or not public.rujukan_ini_dummy(ref_table, ref_id::text)
  );

drop policy if exists sembunyikan_dummy on public.notifications;
create policy sembunyikan_dummy on public.notifications as restrictive
  for select to authenticated
  using (
    public.dummy_data_visible()
    or not public.rujukan_ini_dummy(ref_table, ref_id::text)
  );

drop policy if exists sembunyikan_dummy on public.audit_log;
create policy sembunyikan_dummy on public.audit_log as restrictive
  for select to authenticated
  using (
    public.dummy_data_visible()
    or not public.rujukan_ini_dummy(tabel_terdampak, record_id)
  );

-- ---------------------------------------------------------------------
-- 5. Fungsi laporan security definer — bypass RLS by design (supaya
--    bisa agregat lintas baris tanpa terbatasi RLS per-pemodal), jadi
--    JUGA bypass RLS restrictive di atas. Ditambah filter manual di sini
--    satu per satu, supaya angka laporan konsisten dengan tampilan.
-- ---------------------------------------------------------------------
create or replace function public.saldo_kas_per_tanggal(p_tanggal timestamptz)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(delta), 0)
  from public.cash_ledger
  where tanggal <= p_tanggal
    and (public.dummy_data_visible() or not public.rujukan_ini_dummy(ref_table, ref_id::text));
$$;

create or replace function public.saldo_kas_sekarang()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(delta), 0)
  from public.cash_ledger
  where public.dummy_data_visible() or not public.rujukan_ini_dummy(ref_table, ref_id::text);
$$;

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
      and (public.dummy_data_visible() or not ps.is_dummy)
  ),
  opex as (
    select coalesce(sum(oe.jumlah), 0) as total
    from public.operational_expenses oe
    where oe.tanggal between p_mulai and p_selesai
      and (public.dummy_data_visible() or not oe.is_dummy)
  )
  select
    margin.total,
    opex.total,
    margin.total - opex.total,
    margin.unit
  from margin, opex;
$$;

create or replace function public.jumlah_notif_belum_dibaca()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*) from public.notifications
  where profile_id = (select auth.uid())
    and dibaca_pada is null
    and (public.dummy_data_visible() or not public.rujukan_ini_dummy(ref_table, ref_id::text));
$$;

create or replace function public.outstanding_pemodal(p_pemodal_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
    case l.tipe
      when 'capital_call'      then l.jumlah
      when 'return_of_capital' then -l.jumlah
      else 0
    end
  ), 0)
  from public.pemodal_ledger l
  where l.pemodal_id = p_pemodal_id
    and (public.dummy_data_visible() or not l.is_dummy);
$$;

-- ---------------------------------------------------------------------
-- 6. settle_unit(): teruskan is_dummy unit ke baris turunan yang dibuat
--    fungsi ini sendiri (profit_split, pemodal_ledger, loss_allocation).
--    Bagian lain TIDAK disentuh — cuma tiga insert yang ditambah satu
--    kolom.
-- ---------------------------------------------------------------------
create or replace function public.settle_unit(p_unit_id uuid)
returns public.units
language plpgsql
set search_path = public
as $$
declare
  v_unit           public.units;
  v_setting        public.profit_share_settings;
  v_snapshot       public.unit_profit_snapshot;
  v_modal          numeric(18,2);
  v_pemodal_id     uuid;
  v_margin         numeric(18,2);
  v_rugi           numeric(18,2);
  v_rugi_pemodal   numeric(18,2);
  v_kembali        numeric(18,2);
  v_pemodal_profit numeric(18,2);
  v_admin_pool     numeric(18,2);
  v_admin_final    numeric(18,2);
  v_partner_final  numeric(18,2);
  v_alloc_id       uuid;
  v_setting_id     uuid;
  v_pct_pemodal    numeric;
  v_pct_owner1     numeric;
  v_pct_owner2     numeric;
begin
  select * into v_unit from public.units where id = p_unit_id for update;

  if not found then
    raise exception 'Unit tidak ditemukan.' using errcode = 'no_data_found';
  end if;

  if v_unit.status <> 'delivered_paid' then
    raise exception
      'Unit harus berstatus delivered_paid sebelum di-settle (sekarang: %).',
      v_unit.status using errcode = 'check_violation';
  end if;

  if v_unit.harga_jual is null then
    raise exception 'Harga jual wajib diisi sebelum unit di-settle.'
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.profit_split where unit_id = p_unit_id) then
    raise exception 'Unit ini sudah pernah di-settle.'
      using errcode = 'unique_violation';
  end if;

  v_pemodal_id := coalesce(
    v_unit.pemodal_id,
    (select l.pemodal_id
       from public.pemodal_ledger l
      where l.unit_id = p_unit_id and l.tipe = 'capital_call'
      order by l.tanggal, l.created_at
      limit 1));

  select * into v_snapshot
    from public.unit_profit_snapshot
   where unit_id = p_unit_id;

  if found then
    v_pct_pemodal := public.persentase_snapshot_pihak(v_snapshot.snapshot_json, 'pemodal_us');
    v_pct_owner1  := public.persentase_snapshot_pihak(v_snapshot.snapshot_json, 'owner_1');
    v_pct_owner2  := public.persentase_snapshot_pihak(v_snapshot.snapshot_json, 'owner_2');

    if v_pct_pemodal is null or v_pct_owner1 is null or v_pct_owner2 is null then
      raise exception
        'Snapshot nisbah unit ini bukan bentuk pemodal_us/owner_1/owner_2 — '
        'settle_unit() belum mendukung bentuk skema lain. Revisi fungsi ini '
        'dulu sebelum melanjutkan.'
        using errcode = 'check_violation';
    end if;

    v_setting_id := null;
  else
    select * into v_setting
      from public.profit_share_settings
     where effective_date <= now()
     order by effective_date desc, created_at desc
     limit 1;

    if not found then
      raise exception 'Profit share settings belum diatur.'
        using errcode = 'check_violation';
    end if;

    v_pct_pemodal := v_setting.pemodal_percentage;
    v_pct_owner1  := v_setting.owner_admin_percentage;
    v_pct_owner2  := v_setting.owner_partner_percentage;
    v_setting_id  := v_setting.id;
  end if;

  v_margin := v_unit.margin;
  v_rugi   := greatest(-v_margin, 0);
  v_modal  := public.modal_tertahan_unit(p_unit_id);

  if v_rugi > 0 and v_unit.loss_classification is null then
    raise exception
      'Unit ini rugi %. Klasifikasi kerugian (normal/kelalaian/fraud) dan '
      'justifikasinya wajib diisi dulu sebelum unit di-settle.', v_rugi
      using errcode = 'check_violation';
  end if;

  if v_margin > 0 then
    if v_pemodal_id is null then
      v_pemodal_profit := 0;
    else
      v_pemodal_profit := round(v_margin * v_pct_pemodal / 100, 2);
    end if;
    v_admin_pool  := v_margin - v_pemodal_profit;
    v_admin_final := round(
      v_admin_pool * v_pct_owner1 / nullif(v_pct_owner1 + v_pct_owner2, 0), 2);
    v_partner_final := v_admin_pool - v_admin_final;
  else
    v_pemodal_profit := 0;
    v_admin_pool     := 0;
    v_admin_final    := 0;
    v_partner_final  := 0;
  end if;

  v_rugi_pemodal := 0;

  if v_rugi > 0 and v_pemodal_id is not null and v_modal > 0 then
    if v_unit.loss_classification = 'normal'
       or v_unit.loss_bearer_id = v_pemodal_id then
      v_rugi_pemodal := least(v_rugi, v_modal);
    end if;
  end if;

  insert into public.profit_split (
    unit_id, tanggal_settle, margin_bruto, profit_share_setting_id,
    pemodal_id, pemodal_profit, admin_pool_profit,
    admin_final_profit, partner_final_profit, is_dummy
  ) values (
    p_unit_id, now(), v_margin, v_setting_id,
    v_pemodal_id, v_pemodal_profit, v_admin_pool,
    v_admin_final, v_partner_final, v_unit.is_dummy
  );

  if v_rugi > 0 then
    insert into public.loss_allocation
      (periode, unit_id, total_pool_saat_kejadian, total_rugi, catatan, is_dummy)
    values
      (to_char(now(), 'YYYY-MM'), p_unit_id, v_modal, v_rugi,
       'Otomatis saat settle. Klasifikasi: ' || v_unit.loss_classification,
       v_unit.is_dummy)
    returning id into v_alloc_id;

    if v_pemodal_id is not null then
      insert into public.loss_allocation_items
        (loss_allocation_id, pemodal_id, kontribusi, proporsi, jumlah_rugi_ditanggung)
      values
        (v_alloc_id, v_pemodal_id, v_modal,
         case when v_rugi = 0 then 0 else round(v_rugi_pemodal / v_rugi, 6) end,
         v_rugi_pemodal);
    end if;

    update public.units set realized_loss = v_rugi where id = p_unit_id;
  end if;

  if v_pemodal_id is not null and v_pemodal_profit > 0 then
    insert into public.pemodal_ledger
      (pemodal_id, tipe, jumlah, unit_id, catatan, is_dummy)
    values
      (v_pemodal_id, 'profit_share', v_pemodal_profit, p_unit_id,
       'Bagi hasil otomatis saat unit di-settle.', v_unit.is_dummy);
  end if;

  v_kembali := v_modal - v_rugi_pemodal;

  if v_kembali > 0 and v_pemodal_id is not null then
    insert into public.pemodal_ledger
      (pemodal_id, tipe, jumlah, unit_id, catatan, is_dummy)
    values
      (v_pemodal_id, 'return_of_capital', v_kembali, p_unit_id,
       case when v_rugi_pemodal > 0
            then 'Pengembalian modal saat settle, dikurangi rugi ' || v_rugi_pemodal
            else 'Otomatis dicatat saat unit di-settle.' end,
       v_unit.is_dummy);
  end if;

  update public.units
     set status = 'settled',
         tanggal_settle = now()
   where id = p_unit_id
  returning * into v_unit;

  return v_unit;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Toggle dari aplikasi: fungsi tunggal, gampang dipanggil dari
--    server action. bisa_tulis() (super_admin) required lewat RLS
--    app_settings_tulis di atas, tapi dicek juga di sini supaya pesan
--    errornya jelas kalau ada yang coba lewat jalur lain.
-- ---------------------------------------------------------------------
create or replace function public.atur_tampilan_data_dummy(p_tampilkan boolean)
returns public.app_settings
language plpgsql
set search_path = public
as $$
declare
  v_row public.app_settings;
begin
  if not public.bisa_tulis() then
    raise exception 'Hanya super admin yang bisa mengatur tampilan data dummy.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.app_settings
     set tampilkan_data_dummy = p_tampilkan
   where id = true
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.atur_tampilan_data_dummy(boolean) to authenticated;
