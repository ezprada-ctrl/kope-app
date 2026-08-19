-- =====================================================================
-- 0013 — Rename "investor" menjadi "pemodal" di seluruh skema
--
-- MURNI RENAME. Tidak ada satu pun rumus, constraint, atau logika yang
-- berubah di migrasi ini. Angka yang dihasilkan sebelum dan sesudah
-- migrasi ini harus identik.
--
-- Pemetaan peran (keputusan bisnis 19 Agustus 2026):
--   pemodal (dulu "investor") = Untung Store (US), shahibul mal
--   owner_partner             = HALO KOPE (HK), mudharib
--
-- Catatan teknis penting:
--   - Rename kolom di Postgres OTOMATIS merambat ke definisi view (view
--     menyimpan parse tree, bukan teks), tapi TIDAK merambat ke body
--     fungsi SQL/plpgsql — body fungsi cuma teks. Karena itu setiap fungsi
--     yang menyebut nama lama ditulis ulang di bawah.
--   - View sengaja di-DROP lalu dibuat ulang, bukan di-ALTER RENAME, supaya
--     nama kolom keluarannya ikut berubah dan definisinya terbaca jelas di
--     satu tempat. Aman karena view tidak menyimpan data.
--   - Fungsi yang dipakai RLS (is_investor) di-RENAME, bukan drop+create,
--     supaya OID-nya tetap dan 44 policy yang menunjuknya tidak perlu
--     ditulis ulang.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Buang view yang menyebut nama lama (urutan terbalik dari dependensi)
-- ---------------------------------------------------------------------
drop view if exists public.v_financial_summary;
drop view if exists public.v_profit_ringkasan;
drop view if exists public.v_investor_outstanding;
drop view if exists public.v_investor_ledger_running;
drop view if exists public.v_plafon_aktif;

-- ---------------------------------------------------------------------
-- 2. Nilai enum role
--    RENAME VALUE mempertahankan OID, jadi kolom & view yang menyimpan
--    nilai ini ikut berubah sendiri tanpa rewrite tabel.
-- ---------------------------------------------------------------------
alter type public.user_role rename value 'investor' to 'pemodal';

-- ---------------------------------------------------------------------
-- 3. Tabel & kolom
-- ---------------------------------------------------------------------
alter table public.investor_ledger rename to pemodal_ledger;
alter table public.pemodal_ledger  rename column investor_id to pemodal_id;

alter table public.units                 rename column investor_id         to pemodal_id;
alter table public.plafon_settings       rename column investor_id         to pemodal_id;
alter table public.profit_share_settings rename column investor_percentage to pemodal_percentage;
alter table public.profit_split          rename column investor_id         to pemodal_id;
alter table public.profit_split          rename column investor_profit     to pemodal_profit;
alter table public.loss_allocation_items rename column investor_id         to pemodal_id;

-- Index ikut dirapikan namanya biar tidak menyesatkan saat debugging.
alter index if exists investor_ledger_investor_idx rename to pemodal_ledger_pemodal_idx;
alter index if exists investor_ledger_unit_idx     rename to pemodal_ledger_unit_idx;
alter index if exists units_investor_idx           rename to units_pemodal_idx;
alter index if exists profit_split_investor_idx    rename to profit_split_pemodal_idx;

comment on column public.units.pemodal_id is
  'NULL artinya modal sendiri / kas pool tanpa pemodal.';
comment on column public.pemodal_ledger.unit_id is
  'NULL = dana masuk kas pool umum, tidak 1:1 ke unit tertentu.';

-- ---------------------------------------------------------------------
-- 4. Data historis di cash_ledger.ref_table
--    Kolom ini menyimpan nama tabel sebagai teks, jadi tidak ikut rename.
-- ---------------------------------------------------------------------
update public.cash_ledger
   set ref_table = 'pemodal_ledger'
 where ref_table = 'investor_ledger';

update public.audit_log
   set tabel_terdampak = 'pemodal_ledger'
 where tabel_terdampak = 'investor_ledger';

-- ---------------------------------------------------------------------
-- 5. Fungsi: rename dulu (mempertahankan OID untuk policy), lalu tulis
--    ulang body-nya dengan identifier baru.
-- ---------------------------------------------------------------------
-- is_investor dipakai langsung oleh policy RLS, jadi WAJIB rename (bukan
-- drop+create) supaya OID-nya bertahan dan policy ikut berpindah sendiri.
alter function public.is_investor()               rename to is_pemodal;
alter function public.kas_dari_investor_ledger()  rename to kas_dari_pemodal_ledger;

-- plafon_investor & outstanding_investor tidak bisa lewat CREATE OR REPLACE
-- karena nama PARAMETER-nya ikut berubah (p_investor_id -> p_pemodal_id), dan
-- Postgres menolak itu dengan 42P13. Keduanya tidak dirujuk policy mana pun
-- (hanya dipanggil dari body cek_plafon_capital_call, dan body plpgsql tidak
-- membuat dependensi), jadi drop+create aman.
drop function if exists public.plafon_investor(uuid);
drop function if exists public.outstanding_investor(uuid);

create or replace function public.is_pemodal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.app_role() = 'pemodal', false);
$$;

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
      and u.pemodal_id = (select auth.uid())
  );
$$;

create or replace function public.plafon_pemodal(p_pemodal_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select ps.plafon
  from public.plafon_settings ps
  where (ps.pemodal_id = p_pemodal_id or ps.pemodal_id is null)
    and ps.effective_date <= now()
  order by (ps.pemodal_id is not null) desc, ps.effective_date desc
  limit 1;
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
  where l.pemodal_id = p_pemodal_id;
$$;

create or replace function public.cek_plafon_capital_call()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outstanding numeric(18,2);
  v_plafon      numeric(18,2);
begin
  if new.tipe <> 'capital_call' then
    return new;
  end if;

  -- Serialkan pengecekan per pemodal. Advisory lock dipakai (bukan FOR UPDATE)
  -- karena saat capital call PERTAMA belum ada baris yang bisa dikunci — dua
  -- request bersamaan akan sama-sama lolos kalau mengandalkan row lock.
  perform pg_advisory_xact_lock(hashtextextended(new.pemodal_id::text, 0));

  v_outstanding := public.outstanding_pemodal(new.pemodal_id);
  v_plafon      := public.plafon_pemodal(new.pemodal_id);

  if v_plafon is null then
    raise exception 'Plafon untuk pemodal ini belum diatur.'
      using errcode = 'check_violation';
  end if;

  if (v_outstanding + new.jumlah) > v_plafon then
    raise exception
      'Capital call ditolak. Outstanding % + permintaan % = % melebihi plafon %.',
      v_outstanding, new.jumlah, v_outstanding + new.jumlah, v_plafon
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create or replace function public.modal_tertahan_unit(p_unit_id uuid)
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
  where l.unit_id = p_unit_id;
$$;

create or replace function public.kas_dari_pemodal_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tipe = 'capital_call' then
    perform public.catat_kas(new.tanggal, 'in', 'capital_call_in', new.jumlah,
      'pemodal_ledger', new.id, 'Dana masuk dari pemodal');
  elsif new.tipe = 'return_of_capital' then
    perform public.catat_kas(new.tanggal, 'out', 'return_of_capital_out', new.jumlah,
      'pemodal_ledger', new.id, 'Pengembalian modal ke pemodal');
  end if;
  -- profit_share TIDAK menyentuh kas di sini; pencairannya dicatat terpisah
  -- sebagai profit_payout_out saat uang benar-benar ditransfer.
  return new;
end;
$$;

-- settle_unit: identik dengan versi 0007, hanya identifier yang berganti.
create or replace function public.settle_unit(p_unit_id uuid)
returns public.units
language plpgsql
set search_path = public
as $$
declare
  v_unit           public.units;
  v_setting        public.profit_share_settings;
  v_sisa_modal     numeric(18,2);
  v_pemodal_id     uuid;
  v_margin         numeric(18,2);
  v_pemodal_profit numeric(18,2);
  v_admin_pool     numeric(18,2);
  v_admin_final    numeric(18,2);
  v_partner_final  numeric(18,2);
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

  -- CATATAN: pengambilan setting pada waktu settle ini adalah cacat J2 yang
  -- sudah terdokumentasi di AUDIT-REPORT.md. SENGAJA tidak diperbaiki di
  -- migrasi rename ini — perbaikannya masuk paket engine profit sharing.
  select * into v_setting
    from public.profit_share_settings
   where effective_date <= now()
   order by effective_date desc, created_at desc
   limit 1;

  if not found then
    raise exception 'Profit share settings belum diatur.'
      using errcode = 'check_violation';
  end if;

  v_pemodal_id := coalesce(
    v_unit.pemodal_id,
    (select l.pemodal_id
       from public.pemodal_ledger l
      where l.unit_id = p_unit_id and l.tipe = 'capital_call'
      order by l.tanggal, l.created_at
      limit 1)
  );

  v_margin := v_unit.margin;

  if v_pemodal_id is null then
    v_pemodal_profit := 0;
  else
    v_pemodal_profit := round(v_margin * v_setting.pemodal_percentage / 100, 2);
  end if;

  v_admin_pool    := v_margin - v_pemodal_profit;
  v_admin_final   := round(v_admin_pool * v_setting.owner_admin_percentage / 100, 2);
  v_partner_final := v_admin_pool - v_admin_final;

  insert into public.profit_split (
    unit_id, tanggal_settle, margin_bruto, profit_share_setting_id,
    pemodal_id, pemodal_profit, admin_pool_profit,
    admin_final_profit, partner_final_profit
  ) values (
    p_unit_id, now(), v_margin, v_setting.id,
    v_pemodal_id, v_pemodal_profit, v_admin_pool,
    v_admin_final, v_partner_final
  );

  if v_pemodal_id is not null and v_pemodal_profit > 0 then
    insert into public.pemodal_ledger
      (pemodal_id, tipe, jumlah, unit_id, catatan)
    values
      (v_pemodal_id, 'profit_share', v_pemodal_profit, p_unit_id,
       'Bagi hasil otomatis saat unit di-settle.');
  end if;

  v_sisa_modal := public.modal_tertahan_unit(p_unit_id);

  if v_sisa_modal > 0 and v_pemodal_id is not null then
    insert into public.pemodal_ledger
      (pemodal_id, tipe, jumlah, unit_id, catatan)
    values
      (v_pemodal_id, 'return_of_capital', v_sisa_modal, p_unit_id,
       'Otomatis dicatat saat unit di-settle.');
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
-- 6. View dibuat ulang dengan nama & kolom baru
-- ---------------------------------------------------------------------
create or replace view public.v_plafon_aktif
with (security_invoker = true) as
select
  pr.id as pemodal_id,
  pr.nama,
  coalesce(khusus.plafon, global_plafon.plafon) as plafon_aktif,
  coalesce(khusus.effective_date, global_plafon.effective_date) as effective_date,
  (khusus.plafon is not null) as pakai_plafon_khusus
from public.profiles pr
left join lateral (
  select ps.plafon, ps.effective_date
  from public.plafon_settings ps
  where ps.pemodal_id = pr.id
    and ps.effective_date <= now()
  order by ps.effective_date desc
  limit 1
) khusus on true
left join lateral (
  select ps.plafon, ps.effective_date
  from public.plafon_settings ps
  where ps.pemodal_id is null
    and ps.effective_date <= now()
  order by ps.effective_date desc
  limit 1
) global_plafon on true
where pr.role = 'pemodal';

create or replace view public.v_pemodal_ledger_running
with (security_invoker = true) as
select
  l.*,
  case l.tipe
    when 'capital_call'      then l.jumlah
    when 'return_of_capital' then -l.jumlah
    else 0
  end as delta_outstanding,
  sum(
    case l.tipe
      when 'capital_call'      then l.jumlah
      when 'return_of_capital' then -l.jumlah
      else 0
    end
  ) over (
    partition by l.pemodal_id
    order by l.tanggal, l.created_at, l.id
    rows between unbounded preceding and current row
  ) as outstanding_running_balance
from public.pemodal_ledger l;

create or replace view public.v_pemodal_outstanding
with (security_invoker = true) as
select
  pr.id as pemodal_id,
  pr.nama,
  coalesce(sum(l.jumlah) filter (where l.tipe = 'capital_call'), 0)      as total_capital_call,
  coalesce(sum(l.jumlah) filter (where l.tipe = 'return_of_capital'), 0) as total_return_of_capital,
  coalesce(sum(l.jumlah) filter (where l.tipe = 'profit_share'), 0)      as total_profit_share,
  coalesce(sum(l.jumlah) filter (where l.tipe = 'capital_call'), 0)
    - coalesce(sum(l.jumlah) filter (where l.tipe = 'return_of_capital'), 0) as outstanding,
  pl.plafon_aktif,
  pl.plafon_aktif
    - (
        coalesce(sum(l.jumlah) filter (where l.tipe = 'capital_call'), 0)
        - coalesce(sum(l.jumlah) filter (where l.tipe = 'return_of_capital'), 0)
      ) as sisa_plafon
from public.profiles pr
left join public.pemodal_ledger l on l.pemodal_id = pr.id
left join public.v_plafon_aktif pl on pl.pemodal_id = pr.id
where pr.role = 'pemodal'
group by pr.id, pr.nama, pl.plafon_aktif;

create or replace view public.v_profit_ringkasan
with (security_invoker = true) as
select
  ps.unit_id,
  u.model,
  u.kode,
  ps.tanggal_settle,
  ps.margin_bruto,
  ps.pemodal_id,
  ps.pemodal_profit,
  ps.admin_pool_profit,
  ps.admin_final_profit,
  ps.partner_final_profit,
  s.pemodal_percentage,
  s.owner_admin_percentage,
  s.owner_partner_percentage
from public.profit_split ps
join public.units u on u.id = ps.unit_id
join public.profit_share_settings s on s.id = ps.profit_share_setting_id;

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
   from public.pemodal_ledger l) as total_outstanding_pemodal,
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

grant select on public.v_plafon_aktif,
                public.v_pemodal_ledger_running,
                public.v_pemodal_outstanding,
                public.v_profit_ringkasan,
                public.v_financial_summary
  to authenticated;

grant execute on function public.plafon_pemodal(uuid)      to authenticated;
grant execute on function public.outstanding_pemodal(uuid) to authenticated;
grant execute on function public.is_pemodal()              to authenticated;

-- ---------------------------------------------------------------------
-- 7. Trigger yang namanya menyebut tabel lama
-- ---------------------------------------------------------------------
-- Nama persis diambil dari pg_trigger, bukan ditebak dari file migrasi.
alter trigger trg_investor_ledger_touch      on public.pemodal_ledger
  rename to trg_pemodal_ledger_touch;
alter trigger trg_investor_ledger_kas        on public.pemodal_ledger
  rename to trg_pemodal_ledger_kas;
alter trigger trg_investor_ledger_cek_plafon on public.pemodal_ledger
  rename to trg_pemodal_ledger_cek_plafon;
alter trigger trg_investor_ledger_audit      on public.pemodal_ledger
  rename to trg_pemodal_ledger_audit;
alter trigger trg_investor_ledger_no_delete  on public.pemodal_ledger
  rename to trg_pemodal_ledger_no_delete;

-- ---------------------------------------------------------------------
-- 8. Nama constraint/index bawaan
--    ALTER TABLE ... RENAME TO tidak ikut mengganti nama index PK maupun
--    unique constraint, jadi keduanya dirapikan manual.
-- ---------------------------------------------------------------------
alter index public.investor_ledger_pkey rename to pemodal_ledger_pkey;
alter index public.loss_allocation_items_loss_allocation_id_investor_id_key
  rename to loss_allocation_items_alloc_pemodal_key;

-- ---------------------------------------------------------------------
-- 9. WAJIB: handle_new_user masih menulis literal 'investor'
--
--    Ini BUKAN kosmetik. Nilai enum 'investor' sudah tidak ada setelah
--    langkah 2, sehingga trigger signup akan gagal dengan
--    "invalid input value for enum user_role" pada SETIAP pembuatan user
--    baru. Body fungsi tidak ikut terbawa rename karena cuma teks.
--
--    Selebihnya identik dengan versi di 0012 (role terendah + non-aktif).
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nama, email, role, aktif)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nama', split_part(new.email, '@', 1)),
    new.email,
    'pemodal',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
