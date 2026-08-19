-- =====================================================================
-- 0005 — View turunan (outstanding, plafon aktif) + seed konfigurasi awal
-- Semua view pakai security_invoker supaya RLS pemanggil tetap berlaku.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Plafon aktif per investor: plafon khusus kalau ada, kalau tidak
-- pakai plafon global (investor_id IS NULL) yang paling baru.
-- ---------------------------------------------------------------------
create or replace view public.v_plafon_aktif
with (security_invoker = true) as
select
  pr.id as investor_id,
  pr.nama,
  coalesce(khusus.plafon, global_plafon.plafon) as plafon_aktif,
  coalesce(khusus.effective_date, global_plafon.effective_date) as effective_date,
  (khusus.plafon is not null) as pakai_plafon_khusus
from public.profiles pr
left join lateral (
  select ps.plafon, ps.effective_date
  from public.plafon_settings ps
  where ps.investor_id = pr.id
    and ps.effective_date <= now()
  order by ps.effective_date desc
  limit 1
) khusus on true
left join lateral (
  select ps.plafon, ps.effective_date
  from public.plafon_settings ps
  where ps.investor_id is null
    and ps.effective_date <= now()
  order by ps.effective_date desc
  limit 1
) global_plafon on true
where pr.role = 'investor';

-- ---------------------------------------------------------------------
-- Ledger dengan running balance outstanding per investor.
-- profit_share TIDAK mengubah outstanding (itu bagi hasil, bukan modal).
-- ---------------------------------------------------------------------
create or replace view public.v_investor_ledger_running
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
    partition by l.investor_id
    order by l.tanggal, l.created_at, l.id
    rows between unbounded preceding and current row
  ) as outstanding_running_balance
from public.investor_ledger l;

-- ---------------------------------------------------------------------
-- Ringkasan outstanding + sisa plafon per investor.
-- ---------------------------------------------------------------------
create or replace view public.v_investor_outstanding
with (security_invoker = true) as
select
  pr.id as investor_id,
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
left join public.investor_ledger l on l.investor_id = pr.id
left join public.v_plafon_aktif pl on pl.investor_id = pr.id
where pr.role = 'investor'
group by pr.id, pr.nama, pl.plafon_aktif;

-- ---------------------------------------------------------------------
-- Setting bagi hasil yang berlaku sekarang.
-- ---------------------------------------------------------------------
create or replace function public.active_profit_share_setting(p_at timestamptz default now())
returns public.profit_share_settings
language sql
stable
set search_path = public
as $$
  select s.*
  from public.profit_share_settings s
  where s.effective_date <= p_at
  order by s.effective_date desc, s.created_at desc
  limit 1;
$$;

grant execute on function public.active_profit_share_setting(timestamptz) to authenticated;

grant select on public.v_plafon_aktif,
                public.v_investor_ledger_running,
                public.v_investor_outstanding
  to authenticated;

-- ---------------------------------------------------------------------
-- Seed konfigurasi awal
-- ---------------------------------------------------------------------
insert into public.profit_share_settings
  (investor_percentage, owner_admin_percentage, owner_partner_percentage, effective_date, catatan)
values
  (60, 20, 80, now(), 'Setting awal: investor 60% dari margin bruto, sisanya 20/80 admin:partner.');

insert into public.plafon_settings (investor_id, plafon, effective_date, catatan)
values
  (null, 300000000, now(), 'Plafon global default Rp300.000.000.');
