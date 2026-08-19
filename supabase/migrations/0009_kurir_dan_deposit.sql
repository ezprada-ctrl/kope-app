-- =====================================================================
-- 0009 — Kurir & cancellation deposit (Fase 5)
--
-- MASALAH YANG DIPERBAIKI DI SINI:
-- Deposit pembatalan dibayar buyer DI DEPAN, dan kalau deal jadi nilainya
-- "masuk ke harga transaksi" (spec section 3). Artinya uang dari buyer datang
-- dua kali: 75rb di depan, sisanya saat COD.
--
-- Trigger kas dari Fase 3.5 mencatat `unit_sale_in` sebesar harga_jual PENUH,
-- padahal 75rb-nya sudah lebih dulu masuk sebagai `cancellation_deposit_in`.
-- Tanpa perbaikan ini, setiap unit yang pakai deposit akan menggelembungkan
-- kas sebesar nilai depositnya — dan rekonsiliasi terhadap Bank Jago gagal.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Deposit yang sudah diterima untuk sebuah unit dan diperhitungkan ke
-- harga transaksi. Deposit yang hangus (forfeited) TIDAK dihitung di sini —
-- itu jadi revenue tersendiri, bukan cicilan harga.
-- ---------------------------------------------------------------------
create or replace function public.deposit_diterima_unit(p_unit_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(cd.jumlah), 0)
  from public.cancellation_deposits cd
  where cd.unit_id = p_unit_id
    and cd.status <> 'forfeited_as_revenue';
$$;

grant execute on function public.deposit_diterima_unit(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Trigger kas untuk units — versi yang sadar deposit.
-- ---------------------------------------------------------------------
create or replace function public.kas_dari_units()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deposit  numeric(18,2);
  v_sisa     numeric(18,2);
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'paid_to_seller' then
    perform public.catat_kas(now(), 'out', 'unit_purchase_out', new.harga_beli,
      'units', new.id, 'Pembayaran ke penjual: ' || new.model);

  elsif new.status = 'delivered_paid' then
    -- Deposit yang sudah masuk lebih dulu tidak boleh dihitung dua kali.
    v_deposit := public.deposit_diterima_unit(new.id);
    v_sisa    := new.harga_jual - v_deposit;

    perform public.catat_kas(now(), 'in', 'unit_sale_in', v_sisa,
      'units', new.id,
      case
        when v_deposit > 0 then
          'Pelunasan dari buyer: ' || new.model ||
          ' (harga ' || new.harga_jual || ' dikurangi deposit ' || v_deposit || ')'
        else 'Pembayaran dari buyer: ' || new.model
      end);
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Resolve deposit: admin menandai deal jadi atau batal.
-- Dibuat sebagai fungsi supaya status + tanggal_resolve selalu sinkron.
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

  update public.cancellation_deposits
     set status = p_status,
         tanggal_resolve = now()
   where id = p_deposit_id
  returning * into v_deposit;

  return v_deposit;
end;
$$;

grant execute on function public.resolve_deposit(uuid, public.cancellation_status)
  to authenticated;

-- ---------------------------------------------------------------------
-- Ringkasan transaksi kurir + unit terkait, untuk halaman kurir.
-- ---------------------------------------------------------------------
create or replace view public.v_courier_transactions
with (security_invoker = true) as
select
  ct.*,
  cm.nama  as courier_nama,
  u.model  as unit_model,
  u.kode   as unit_kode
from public.courier_transactions ct
join public.courier_master cm on cm.id = ct.courier_id
left join public.units u on u.id = ct.unit_id;

grant select on public.v_courier_transactions to authenticated;

-- ---------------------------------------------------------------------
-- Ringkasan deposit + unit terkait.
-- ---------------------------------------------------------------------
create or replace view public.v_cancellation_deposits
with (security_invoker = true) as
select
  cd.*,
  u.model as unit_model,
  u.kode  as unit_kode,
  u.status as unit_status
from public.cancellation_deposits cd
join public.units u on u.id = cd.unit_id;

grant select on public.v_cancellation_deposits to authenticated;
