-- =====================================================================
-- 0006 — Penegakan plafon capital call + settle unit yang atomik
--
-- Dua aturan uang yang tidak boleh bisa ditembus dari layer aplikasi:
--   1. outstanding + capital_call_baru <= plafon_aktif
--   2. saat unit di-settle, modal investor untuk unit itu otomatis kembali
-- Keduanya ditegakkan di database supaya race condition (dua request
-- barengan) tidak bisa melewatinya.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Plafon yang berlaku untuk seorang investor.
-- Plafon khusus investor menang atas plafon global (investor_id IS NULL).
-- ---------------------------------------------------------------------
create or replace function public.plafon_investor(p_investor_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select ps.plafon
  from public.plafon_settings ps
  where (ps.investor_id = p_investor_id or ps.investor_id is null)
    and ps.effective_date <= now()
  order by (ps.investor_id is not null) desc, ps.effective_date desc
  limit 1;
$$;

grant execute on function public.plafon_investor(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Outstanding modal seorang investor.
-- profit_share TIDAK mengubah outstanding — itu bagi hasil, bukan modal.
-- ---------------------------------------------------------------------
create or replace function public.outstanding_investor(p_investor_id uuid)
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
  from public.investor_ledger l
  where l.investor_id = p_investor_id;
$$;

grant execute on function public.outstanding_investor(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Guard: capital call tidak boleh menembus plafon.
-- ---------------------------------------------------------------------
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

  -- Serialkan pengecekan per investor. Advisory lock dipakai (bukan FOR UPDATE)
  -- karena saat capital call PERTAMA belum ada baris yang bisa dikunci — dua
  -- request bersamaan akan sama-sama lolos kalau mengandalkan row lock.
  perform pg_advisory_xact_lock(hashtextextended(new.investor_id::text, 0));

  v_outstanding := public.outstanding_investor(new.investor_id);
  v_plafon      := public.plafon_investor(new.investor_id);

  if v_plafon is null then
    raise exception 'Plafon untuk investor ini belum diatur.'
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

create trigger trg_investor_ledger_cek_plafon
  before insert on public.investor_ledger
  for each row execute function public.cek_plafon_capital_call();

-- ---------------------------------------------------------------------
-- Modal yang masih nyangkut di satu unit
-- (capital call untuk unit itu, dikurangi yang sudah dikembalikan).
-- ---------------------------------------------------------------------
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
  from public.investor_ledger l
  where l.unit_id = p_unit_id;
$$;

grant execute on function public.modal_tertahan_unit(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Settle unit: ubah status + kembalikan modal investor dalam SATU transaksi.
--
-- SECURITY INVOKER (default) — RLS pemanggil tetap berlaku, jadi hanya admin
-- yang bisa menjalankannya sampai tuntas.
--
-- Fase 4 akan menambahkan pembuatan baris profit_split di fungsi ini.
-- ---------------------------------------------------------------------
create or replace function public.settle_unit(p_unit_id uuid)
returns public.units
language plpgsql
set search_path = public
as $$
declare
  v_unit        public.units;
  v_sisa_modal  numeric(18,2);
  v_investor_id uuid;
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

  v_sisa_modal := public.modal_tertahan_unit(p_unit_id);

  if v_sisa_modal > 0 then
    -- Investor pemilik dana: dari unit, atau dari capital call pertama unit ini.
    v_investor_id := coalesce(
      v_unit.investor_id,
      (select l.investor_id
         from public.investor_ledger l
        where l.unit_id = p_unit_id and l.tipe = 'capital_call'
        order by l.tanggal, l.created_at
        limit 1)
    );

    if v_investor_id is not null then
      insert into public.investor_ledger
        (investor_id, tipe, jumlah, unit_id, catatan)
      values
        (v_investor_id, 'return_of_capital', v_sisa_modal, p_unit_id,
         'Otomatis dicatat saat unit di-settle.');
    end if;
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
