-- =====================================================================
-- 0007 — Profit split engine
--
-- Formula (section 5 spec):
--   investor_profit      = margin_bruto * investor_percentage
--   admin_pool_profit    = sisa margin setelah investor
--   admin_final_profit   = admin_pool * 20%
--   partner_final_profit = admin_pool * 80%
--
-- Pembulatan: hanya bagian PERTAMA tiap pembagian yang dibulatkan, sisanya
-- dihitung sebagai pengurangan. Dengan begitu
--   investor_profit + admin_final_profit + partner_final_profit
-- selalu sama persis dengan margin_bruto — tidak ada rupiah yang hilang
-- atau tercipta karena pembulatan.
--
-- Margin negatif (rugi) memakai formula yang sama, sesuai section 5 poin 6:
-- investor menanggung rugi sebesar porsi ownership-nya.
-- =====================================================================

create or replace function public.settle_unit(p_unit_id uuid)
returns public.units
language plpgsql
set search_path = public
as $$
declare
  v_unit            public.units;
  v_setting         public.profit_share_settings;
  v_sisa_modal      numeric(18,2);
  v_investor_id     uuid;
  v_margin          numeric(18,2);
  v_investor_profit numeric(18,2);
  v_admin_pool      numeric(18,2);
  v_admin_final     numeric(18,2);
  v_partner_final   numeric(18,2);
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

  -- Setting yang berlaku SAAT INI. Perubahan persentase berlaku langsung
  -- untuk unit yang di-settle setelahnya, tidak retroaktif.
  select * into v_setting
    from public.profit_share_settings
   where effective_date <= now()
   order by effective_date desc, created_at desc
   limit 1;

  if not found then
    raise exception 'Profit share settings belum diatur.'
      using errcode = 'check_violation';
  end if;

  -- Investor pemilik dana: dari unit, atau dari capital call pertama unit ini.
  v_investor_id := coalesce(
    v_unit.investor_id,
    (select l.investor_id
       from public.investor_ledger l
      where l.unit_id = p_unit_id and l.tipe = 'capital_call'
      order by l.tanggal, l.created_at
      limit 1)
  );

  v_margin := v_unit.margin;

  -- Tanpa investor (modal sendiri / kas pool), seluruh margin masuk admin pool.
  if v_investor_id is null then
    v_investor_profit := 0;
  else
    v_investor_profit := round(v_margin * v_setting.investor_percentage / 100, 2);
  end if;

  v_admin_pool    := v_margin - v_investor_profit;
  v_admin_final   := round(v_admin_pool * v_setting.owner_admin_percentage / 100, 2);
  v_partner_final := v_admin_pool - v_admin_final;

  insert into public.profit_split (
    unit_id, tanggal_settle, margin_bruto, profit_share_setting_id,
    investor_id, investor_profit, admin_pool_profit,
    admin_final_profit, partner_final_profit
  ) values (
    p_unit_id, now(), v_margin, v_setting.id,
    v_investor_id, v_investor_profit, v_admin_pool,
    v_admin_final, v_partner_final
  );

  -- Bagi hasil dicatat di ledger hanya kalau positif — kolom `jumlah` punya
  -- CHECK (jumlah > 0). Kerugian tetap terekam di profit_split.
  if v_investor_id is not null and v_investor_profit > 0 then
    insert into public.investor_ledger
      (investor_id, tipe, jumlah, unit_id, catatan)
    values
      (v_investor_id, 'profit_share', v_investor_profit, p_unit_id,
       'Bagi hasil otomatis saat unit di-settle.');
  end if;

  -- Pengembalian modal investor untuk unit ini.
  v_sisa_modal := public.modal_tertahan_unit(p_unit_id);

  if v_sisa_modal > 0 and v_investor_id is not null then
    insert into public.investor_ledger
      (investor_id, tipe, jumlah, unit_id, catatan)
    values
      (v_investor_id, 'return_of_capital', v_sisa_modal, p_unit_id,
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

grant execute on function public.settle_unit(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Ringkasan keuntungan per role — dipakai dashboard.
-- security_invoker: investor hanya melihat barisnya sendiri lewat RLS.
-- ---------------------------------------------------------------------
create or replace view public.v_profit_ringkasan
with (security_invoker = true) as
select
  ps.unit_id,
  u.model,
  u.kode,
  ps.tanggal_settle,
  ps.margin_bruto,
  ps.investor_id,
  ps.investor_profit,
  ps.admin_pool_profit,
  ps.admin_final_profit,
  ps.partner_final_profit,
  s.investor_percentage,
  s.owner_admin_percentage,
  s.owner_partner_percentage
from public.profit_split ps
join public.units u on u.id = ps.unit_id
join public.profit_share_settings s on s.id = ps.profit_share_setting_id;

grant select on public.v_profit_ringkasan to authenticated;
