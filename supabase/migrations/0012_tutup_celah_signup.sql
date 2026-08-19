-- ---------------------------------------------------------------------
-- Menutup celah eskalasi privilege lewat signup publik.
--
-- Masalah: handle_new_user() mengambil role dari
-- `raw_user_meta_data ->> 'role'`. Isi metadata itu sepenuhnya dikirim
-- client saat memanggil /auth/v1/signup, jadi siapa pun yang punya
-- publishable key (dan key itu memang publik, ter-inline di bundle JS)
-- bisa mendaftar sambil menyetel dirinya sendiri sebagai 'admin'.
-- Admin satu-satunya role yang boleh insert/update di seluruh RLS.
--
-- Masalah kedua: profil baru langsung `aktif = true`, sedangkan
-- notif_dari_cash_ledger() fan-out ke SEMUA profil yang aktif. Artinya
-- pendaftar liar ikut menerima nominal + deskripsi tiap gerak kas bisnis,
-- lewat policy notif_lihat_sendiri yang sah.
--
-- Perbaikan: role selalu 'investor' (paling rendah) dan profil baru
-- dibuat non-aktif. Menaikkan role & mengaktifkan jadi tindakan sadar
-- admin, bukan efek samping pendaftaran.
--
-- CATATAN: migrasi ini tidak mematikan signup publik itu sendiri. Itu
-- setelan Auth di dashboard Supabase dan harus dimatikan terpisah.
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
    -- Sengaja hardcoded. Jangan pernah baca role dari metadata signup.
    'investor',
    -- Non-aktif sampai admin mengaktifkan: menahan fan-out notifikasi kas.
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Membuat profil saat signup. Role dipaksa investor & aktif=false — '
  'metadata signup dikendalikan client, jadi tidak boleh menentukan '
  'otoritas. Admin menaikkan role/mengaktifkan secara manual.';

-- ---------------------------------------------------------------------
-- Setelah menerapkan ini, tinjau profil yang sudah terlanjur dibuat.
-- Hanya admin yang bisa update profiles (policy profiles_admin_update),
-- jadi eskalasi lewat UPDATE tidak mungkin — tapi akun yang sudah
-- terlanjur mendaftar dengan role dari metadata tetap perlu diperiksa:
--
--   select id, email, role, aktif, created_at
--   from public.profiles
--   order by created_at desc;
--
-- Nonaktifkan yang tidak dikenal:
--
--   update public.profiles set aktif = false, role = 'investor'
--   where email = 'yang-mencurigakan@contoh.com';
-- ---------------------------------------------------------------------
