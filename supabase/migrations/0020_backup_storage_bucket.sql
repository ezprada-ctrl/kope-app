-- =====================================================================
-- 0020 — Bucket Storage untuk backup terjadwal (H6, AUDIT-REPORT.md)
--
-- Bucket privat (public = false). Sengaja TIDAK ditambah policy apa pun
-- di storage.objects untuk role authenticated/anon — absennya policy
-- berarti tidak ada satu pun user aplikasi (termasuk super_admin) yang
-- bisa baca/tulis lewat client API. Satu-satunya penulis adalah cron job
-- backup yang pakai service_role key (bypass RLS by design di Supabase).
-- Untuk melihat isi bucket ini, buka dashboard Supabase langsung.
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;
