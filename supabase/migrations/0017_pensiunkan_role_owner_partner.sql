-- =====================================================================
-- 0017 — Pensiunkan role owner_partner
--
-- Keputusan pemilik bisnis (19 Agustus 2026): hanya ada TIGA role.
--   super_admin = Owner 1 (pemegang mekanisme keuangan, satu-satunya penulis)
--   admin       = Owner 2 (lihat semua, tidak bisa menulis)
--   pemodal     = Untung Store
--
-- owner_partner tidak dipakai sama sekali.
--
-- Pra-cek sebelum dijalankan (semuanya nol/aman):
--   policy yang memakai is_partner() : 0
--   profil ber-role owner_partner    : 0
-- =====================================================================

-- Jaring pengaman kalau ada yang tertinggal.
update public.profiles set role = 'admin' where role = 'owner_partner';

-- Orang dalam KOPE tinggal dua owner.
create or replace function public.orang_dalam()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_super_admin() or public.is_admin(); $$;

drop function if exists public.is_partner();

-- ---------------------------------------------------------------------
-- Kenapa CHECK, bukan menghapus nilai enum:
--
-- Postgres tidak bisa membuang satu nilai dari enum tanpa membuat ulang
-- tipenya. Membuat ulang `user_role` akan men-cascade ke app_role() —
-- dan lewat itu ke is_super_admin/is_admin/is_pemodal serta 48 policy RLS
-- yang bergantung padanya. Menulis ulang seluruh lapisan RLS demi
-- kerapian enum bukan pertukaran yang sehat: tiap penulisan ulang policy
-- adalah kesempatan menganga untuk lubang izin.
--
-- CHECK ini mencapai tujuan sebenarnya — tidak ada lagi yang bisa menjadi
-- owner_partner — dengan nol sentuhan ke RLS. Nilai enumnya tertinggal
-- sebagai fosil yang tidak bisa dipakai.
-- ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists role_owner_partner_dihapus;
alter table public.profiles add constraint role_owner_partner_dihapus
  check (role <> 'owner_partner');

comment on column public.profiles.role is
  'super_admin = Owner 1 (pemegang mekanisme keuangan, satu-satunya yang boleh '
  'menulis). admin = Owner 2 (lihat semua, tidak bisa menulis). pemodal = '
  'Untung Store. Nilai owner_partner SUDAH DIPENSIUNKAN dan ditolak constraint.';

-- ---------------------------------------------------------------------
-- Penamaan kolom bagi hasil internal
--
-- Kolomnya TIDAK di-rename supaya tidak berbenturan dengan engine
-- profit_schemes yang akan menggantikan mekanisme ini. Yang diperjelas
-- hanya artinya, supaya tidak ada yang salah baca "partner" sebagai role.
-- ---------------------------------------------------------------------
comment on column public.profit_share_settings.owner_admin_percentage is
  'Porsi Owner 1 (super_admin) dari jatah KOPE.';
comment on column public.profit_share_settings.owner_partner_percentage is
  'Porsi Owner 2 (admin) dari jatah KOPE. Nama kolom warisan dari sebelum '
  'role owner_partner dipensiunkan.';
