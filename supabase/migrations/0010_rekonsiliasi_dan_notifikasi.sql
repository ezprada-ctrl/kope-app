-- =====================================================================
-- 0010 — Rekonsiliasi bank + notifikasi (Fase 6)
--
-- Mitigasi risiko utama proyek ini (kasus Rp92jt hilang): setiap gerak uang
-- di dompet bisnis harus (1) bisa dibandingkan 1:1 terhadap satu angka, dan
-- (2) langsung diketahui semua pihak — bukan cuma admin yang pegang akses
-- transfer.
-- =====================================================================

-- ---------------------------------------------------------------------
-- `mutasi_tercatat_di_app` TIDAK BOLEH diisi manual oleh admin. Kalau boleh,
-- rekonsiliasi jadi membandingkan bank terhadap angka yang bisa keliru
-- diketik — persis masalah yang mau dicegah. Trigger ini memaksanya selalu
-- diambil dari `cash_ledger` (saldo kumulatif s.d. tanggal tersebut),
-- konsisten dengan prinsip "angka finansial dihitung DB" yang sudah dipakai
-- di hpp_total, margin, fee_net_kurir, dst.
-- ---------------------------------------------------------------------
create or replace function public.set_mutasi_tercatat_di_app()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.mutasi_tercatat_di_app := public.saldo_kas_per_tanggal(new.tanggal::timestamptz);
  return new;
end;
$$;

create trigger trg_bank_reconciliation_hitung_app
  before insert on public.bank_reconciliation
  for each row execute function public.set_mutasi_tercatat_di_app();

-- ---------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------
create type public.notif_tipe as enum (
  'kas_masuk',
  'kas_keluar',
  'rekonsiliasi_selisih'
);

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  tipe         public.notif_tipe not null,
  kategori     text,
  jumlah       numeric(18,2),
  deskripsi    text,
  ref_table    text,
  ref_id       uuid,
  dibaca_pada  timestamptz,
  created_at   timestamptz not null default now()
);

comment on table public.notifications is
  'Notifikasi in-app. Fan-out otomatis ke admin+partner+investor tiap ada gerak kas, supaya semua pihak bisa menyilangkan "yang tercatat di app" dengan realita tanpa perlu akses transfer.';

create index notifications_profile_idx
  on public.notifications (profile_id, dibaca_pada, created_at desc);

alter table public.notifications enable row level security;

create policy notif_lihat_sendiri on public.notifications
  for select to authenticated
  using (profile_id = (select auth.uid()));

create policy notif_tandai_dibaca on public.notifications
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Fan-out: setiap entry cash_ledger baru -> notifikasi ke SEMUA user aktif.
-- Ini yang dimaksud "transparansi radikal" di spec — partner & investor
-- tidak punya akses transfer, tapi tahu persis tiap kali uang bisnis
-- bergerak.
-- ---------------------------------------------------------------------
create or replace function public.notif_dari_cash_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications
    (profile_id, tipe, kategori, jumlah, deskripsi, ref_table, ref_id)
  select
    pr.id,
    (case new.tipe when 'in' then 'kas_masuk' else 'kas_keluar' end)::public.notif_tipe,
    new.kategori::text,
    new.jumlah,
    new.deskripsi,
    'cash_ledger',
    new.id
  from public.profiles pr
  where pr.aktif;

  return new;
end;
$$;

create trigger trg_cash_ledger_notif
  after insert on public.cash_ledger
  for each row execute function public.notif_dari_cash_ledger();

-- ---------------------------------------------------------------------
-- Selisih rekonsiliasi -> notifikasi ke admin. Ini yang bertindak, jadi
-- tidak perlu fan-out ke semua orang seperti gerak kas biasa.
-- ---------------------------------------------------------------------
create or replace function public.notif_dari_rekonsiliasi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.flagged then
    insert into public.notifications
      (profile_id, tipe, jumlah, deskripsi, ref_table, ref_id)
    select
      pr.id,
      'rekonsiliasi_selisih',
      new.selisih,
      'Selisih rekonsiliasi tanggal ' || new.tanggal::text ||
        ': bank ' || new.mutasi_bank_jago || ' vs app ' || new.mutasi_tercatat_di_app,
      'bank_reconciliation',
      new.id
    from public.profiles pr
    where pr.aktif and pr.role = 'admin';
  end if;

  return new;
end;
$$;

create trigger trg_bank_reconciliation_notif
  after insert on public.bank_reconciliation
  for each row execute function public.notif_dari_rekonsiliasi();

-- ---------------------------------------------------------------------
-- Ringkasan notifikasi belum dibaca — dipakai badge di header.
-- ---------------------------------------------------------------------
create or replace function public.jumlah_notif_belum_dibaca()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*) from public.notifications
  where profile_id = (select auth.uid()) and dibaca_pada is null;
$$;

grant execute on function public.jumlah_notif_belum_dibaca() to authenticated;
grant select, update on public.notifications to authenticated;
