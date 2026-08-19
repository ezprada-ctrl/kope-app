-- =====================================================================
-- 0001 — Enums, profiles, dan helper function untuk RLS
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Enums ----------
create type public.user_role as enum ('admin', 'owner_partner', 'investor');

create type public.unit_tipe as enum ('baru', 'bekas');

create type public.unit_status as enum (
  'sourced',
  'paid_to_seller',
  'in_stock',
  'sold_pending_delivery',
  'delivered_paid',
  'settled',
  'refunded',
  'partial_refund',
  'cancelled_forfeited'
);

create type public.ledger_tipe as enum ('capital_call', 'return_of_capital', 'profit_share');

create type public.courier_tx_tipe as enum ('ambil_barang', 'antar_barang');
create type public.courier_tx_status as enum ('pending', 'selesai', 'batal_forfeited');

create type public.cancellation_status as enum ('pending', 'applied_to_transaction', 'forfeited_as_revenue');
create type public.cancellation_payer as enum ('buyer', 'seller');

create type public.refund_tipe as enum ('refund_full', 'partial_refund');
create type public.refund_status as enum ('pending', 'approved', 'completed');

create type public.audit_action as enum ('create', 'update');

-- ---------- Profiles (1:1 dengan auth.users) ----------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nama        text not null,
  email       text not null,
  role        public.user_role not null default 'investor',
  aktif       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'Profil user + role RBAC. Dibuat otomatis lewat trigger saat signup.';

-- Auto-create profile saat user baru mendaftar di auth.users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nama, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nama', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'investor')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Helper: touch updated_at ----------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------- Helper RLS ----------
-- SECURITY DEFINER supaya tidak rekursif ke policy profiles itu sendiri.
create or replace function public.app_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.app_role() = 'admin', false);
$$;

create or replace function public.is_partner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.app_role() = 'owner_partner', false);
$$;

create or replace function public.is_investor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.app_role() = 'investor', false);
$$;

revoke all on function public.app_role(), public.is_admin(), public.is_partner(),
                       public.is_investor() from public;
grant execute on function public.app_role(), public.is_admin(), public.is_partner(),
                          public.is_investor() to authenticated;
