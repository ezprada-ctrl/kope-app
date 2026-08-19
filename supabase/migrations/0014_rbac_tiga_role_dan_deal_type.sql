-- =====================================================================
-- 0014 — RBAC 3 role + deal_type + isolasi data mandiri_internal
--
-- Model peran (keputusan bisnis 19 Agustus 2026):
--   super_admin — pemegang mekanisme keuangan. SATU-SATUNYA yang boleh
--                 menulis ke tabel finansial. Melihat semua.
--   admin       — view-only operasional. Melihat semua termasuk
--                 mandiri_internal (internal KOPE = satu kesatuan).
--   pemodal     — view-only, scope sempit: hanya unit yang dia danai, dan
--                 TIDAK BOLEH melihat apa pun yang menyangkut unit
--                 mandiri_internal.
--
-- owner_partner (HALO KOPE) DIPERLAKUKAN SEBAGAI ORANG DALAM: melihat
-- semua, tidak bisa menulis. Lihat catatan "ASUMSI YANG PERLU DIKONFIRMASI"
-- di bagian akhir file ini.
--
-- CATATAN URUTAN: 'super_admin' ditambahkan ke enum user_role di run
-- TERPISAH sebelum file ini, karena Postgres melarang memakai nilai enum
-- baru di dalam transaksi yang sama saat nilai itu ditambahkan.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. deal_type & funding_source
-- ---------------------------------------------------------------------
do $$ begin
  create type public.deal_type as enum ('mudharabah', 'mandiri_internal', 'konsinyasi_fee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.funding_source as enum ('direct_capital_call', 'pool');
exception when duplicate_object then null; end $$;

alter table public.units
  add column if not exists deal_type public.deal_type not null default 'mudharabah',
  add column if not exists funding_source public.funding_source,
  add column if not exists custody_holder  uuid references public.profiles (id),
  add column if not exists risk_bearer     uuid references public.profiles (id),
  add column if not exists handover_document text;

comment on column public.units.deal_type is
  'mudharabah = modal Pemodal. mandiri_internal = dana KOPE sendiri, TIDAK '
  'boleh terlihat pemodal. konsinyasi_fee = titip jual (belum dipakai).';
comment on column public.units.funding_source is
  'direct_capital_call = capital call langsung per unit. pool = dibeli dari '
  'dana pool. Menentukan kapan nisbah di-snapshot.';
comment on column public.units.custody_holder is
  'Penyimpan unit fisik. Sengaja NULL sampai keputusan custody final.';
comment on column public.units.risk_bearer is
  'Penanggung risiko rusak/hilang. Sengaja NULL sampai keputusan final.';

create index if not exists units_deal_type_idx on public.units (deal_type);

-- ---------------------------------------------------------------------
-- 2. Naikkan admin yang ada jadi super_admin
--
--    WAJIB. Tanpa ini pemilik satu-satunya akun (role 'admin') kehilangan
--    seluruh hak tulis begitu policy di bawah aktif — terkunci dari
--    aplikasinya sendiri.
-- ---------------------------------------------------------------------
update public.profiles set role = 'super_admin' where role = 'admin';

-- ---------------------------------------------------------------------
-- 3. Helper peran
-- ---------------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.app_role() = 'super_admin', false); $$;

-- Gerbang TULIS tunggal. Semua policy tulis memakai ini, jadi kalau aturan
-- berubah cukup satu tempat.
create or replace function public.bisa_tulis()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_super_admin(); $$;

-- Orang dalam KOPE: boleh melihat SEMUA termasuk mandiri_internal.
create or replace function public.orang_dalam()
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_super_admin() or public.is_admin() or public.is_partner();
$$;

create or replace function public.unit_internal(p_unit_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select u.deal_type = 'mandiri_internal' from public.units u where u.id = p_unit_id),
    false);
$$;

-- Menelusuri baris cash_ledger balik ke unit asalnya. cash_ledger menyimpan
-- ref_table/ref_id, bukan unit_id, jadi harus di-resolve per tabel sumber.
create or replace function public.unit_dari_kas(p_ref_table text, p_ref_id uuid)
returns uuid language sql stable security definer set search_path = public
as $$
  select case p_ref_table
    when 'units'                 then p_ref_id
    when 'pemodal_ledger'        then (select unit_id from public.pemodal_ledger where id = p_ref_id)
    when 'courier_transactions'  then (select unit_id from public.courier_transactions where id = p_ref_id)
    when 'cancellation_deposits' then (select unit_id from public.cancellation_deposits where id = p_ref_id)
    else null
  end;
$$;

create or replace function public.kas_internal(p_ref_table text, p_ref_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.unit_internal(public.unit_dari_kas(p_ref_table, p_ref_id));
$$;

revoke all on function public.is_super_admin(), public.bisa_tulis(),
  public.orang_dalam(), public.unit_internal(uuid),
  public.unit_dari_kas(text, uuid), public.kas_internal(text, uuid) from public;
grant execute on function public.is_super_admin(), public.bisa_tulis(),
  public.orang_dalam(), public.unit_internal(uuid),
  public.unit_dari_kas(text, uuid), public.kas_internal(text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Audit log ikut mencatat ROLE pelaku
-- ---------------------------------------------------------------------
alter table public.audit_log
  add column if not exists dilakukan_oleh_role text;

create or replace function public.log_audit()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_before  jsonb;
  v_after   jsonb;
  v_changes jsonb;
  v_actor   uuid := auth.uid();
  v_email   text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
  v_role    text := public.app_role()::text;
begin
  if tg_op = 'INSERT' then
    v_after := to_jsonb(new);
    insert into public.audit_log (
      tabel_terdampak, record_id, aksi, data_sebelum, data_sesudah, perubahan,
      dilakukan_oleh, dilakukan_oleh_email, dilakukan_oleh_role
    ) values (
      tg_table_name, (v_after ->> 'id'), 'create', null, v_after, v_after,
      v_actor, v_email, v_role
    );
    return new;
  end if;

  v_before := to_jsonb(old);
  v_after  := to_jsonb(new);

  select coalesce(jsonb_object_agg(key, jsonb_build_object('dari', v_before -> key, 'jadi', v_after -> key)), '{}'::jsonb)
    into v_changes
  from jsonb_object_keys(v_after) as t(key)
  where (v_before -> key) is distinct from (v_after -> key)
    and key <> 'updated_at';

  if v_changes = '{}'::jsonb then return new; end if;

  insert into public.audit_log (
    tabel_terdampak, record_id, aksi, data_sebelum, data_sesudah, perubahan,
    dilakukan_oleh, dilakukan_oleh_email, dilakukan_oleh_role
  ) values (
    tg_table_name, (v_after ->> 'id'), 'update', v_before, v_after, v_changes,
    v_actor, v_email, v_role
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Fan-out notifikasi: JANGAN kirim gerak kas unit internal ke pemodal
--
--    Ini kebocoran kedua yang tidak disebut di dokumen keputusan. Tanpa
--    perbaikan ini, seketat apa pun RLS cash_ledger, nominal + deskripsi
--    kas unit mandiri_internal tetap sampai ke pemodal lewat tabel
--    notifications melalui policy notif_lihat_sendiri yang sah.
-- ---------------------------------------------------------------------
create or replace function public.notif_dari_cash_ledger()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_internal boolean := public.kas_internal(new.ref_table, new.ref_id);
begin
  insert into public.notifications
    (profile_id, tipe, kategori, jumlah, deskripsi, ref_table, ref_id)
  select
    pr.id,
    (case new.tipe when 'in' then 'kas_masuk' else 'kas_keluar' end)::public.notif_tipe,
    new.kategori::text, new.jumlah, new.deskripsi, 'cash_ledger', new.id
  from public.profiles pr
  where pr.aktif
    and (not v_internal or pr.role <> 'pemodal');

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Tulis ulang SELURUH policy RLS
--    Dibuang semua dulu supaya tidak ada sisa aturan model lama yang
--    diam-diam masih memberi akses.
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- profiles
create policy profiles_baca_sendiri on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_baca_orang_dalam on public.profiles
  for select to authenticated using (public.orang_dalam());
create policy profiles_tulis on public.profiles
  for all to authenticated using (public.bisa_tulis()) with check (public.bisa_tulis());

-- plafon_settings
create policy plafon_baca on public.plafon_settings
  for select to authenticated
  using (public.orang_dalam()
         or (public.is_pemodal() and (pemodal_id = (select auth.uid()) or pemodal_id is null)));
create policy plafon_tulis on public.plafon_settings
  for all to authenticated using (public.bisa_tulis()) with check (public.bisa_tulis());

-- units — inti isolasi mandiri_internal
create policy units_baca_orang_dalam on public.units
  for select to authenticated using (public.orang_dalam());
create policy units_baca_pemodal on public.units
  for select to authenticated
  using (public.is_pemodal()
         and pemodal_id = (select auth.uid())
         and deal_type <> 'mandiri_internal');
create policy units_tulis on public.units
  for all to authenticated using (public.bisa_tulis()) with check (public.bisa_tulis());

-- pemodal_ledger
create policy pemodal_ledger_baca_orang_dalam on public.pemodal_ledger
  for select to authenticated using (public.orang_dalam());
create policy pemodal_ledger_baca_sendiri on public.pemodal_ledger
  for select to authenticated
  using (public.is_pemodal() and pemodal_id = (select auth.uid()));
create policy pemodal_ledger_tulis on public.pemodal_ledger
  for all to authenticated using (public.bisa_tulis()) with check (public.bisa_tulis());

-- courier_master — master kurir tidak mengandung informasi deal
create policy kurir_baca on public.courier_master
  for select to authenticated using (public.orang_dalam() or public.is_pemodal());
create policy kurir_tulis on public.courier_master
  for all to authenticated using (public.bisa_tulis()) with check (public.bisa_tulis());

-- courier_transactions
create policy kurir_tx_baca_orang_dalam on public.courier_transactions
  for select to authenticated using (public.orang_dalam());
create policy kurir_tx_baca_pemodal on public.courier_transactions
  for select to authenticated
  using (public.is_pemodal() and unit_id is not null
         and public.funds_unit(unit_id) and not public.unit_internal(unit_id));
create policy kurir_tx_tulis on public.courier_transactions
  for all to authenticated using (public.bisa_tulis()) with check (public.bisa_tulis());

-- cancellation_deposits
create policy deposit_baca_orang_dalam on public.cancellation_deposits
  for select to authenticated using (public.orang_dalam());
create policy deposit_baca_pemodal on public.cancellation_deposits
  for select to authenticated
  using (public.is_pemodal() and public.funds_unit(unit_id)
         and not public.unit_internal(unit_id));
create policy deposit_tulis on public.cancellation_deposits
  for all to authenticated using (public.bisa_tulis()) with check (public.bisa_tulis());

-- refunds
create policy refund_baca_orang_dalam on public.refunds
  for select to authenticated using (public.orang_dalam());
create policy refund_baca_pemodal on public.refunds
  for select to authenticated
  using (public.is_pemodal() and public.funds_unit(unit_id)
         and not public.unit_internal(unit_id));
create policy refund_tulis on public.refunds
  for all to authenticated using (public.bisa_tulis()) with check (public.bisa_tulis());

-- profit_share_settings
-- CATATAN: tabel ini belum punya deal_type (engine profit_schemes menyusul).
-- Begitu skema mandiri_internal punya barisnya sendiri, policy ini WAJIB
-- diperketat supaya pemodal tidak melihat skema internal.
create policy skema_baca on public.profit_share_settings
  for select to authenticated using (public.orang_dalam() or public.is_pemodal());
create policy skema_tulis on public.profit_share_settings
  for all to authenticated using (public.bisa_tulis()) with check (public.bisa_tulis());

-- profit_split
create policy split_baca_orang_dalam on public.profit_split
  for select to authenticated using (public.orang_dalam());
create policy split_baca_pemodal on public.profit_split
  for select to authenticated
  using (public.is_pemodal() and pemodal_id = (select auth.uid())
         and not public.unit_internal(unit_id));
create policy split_tulis on public.profit_split
  for all to authenticated using (public.bisa_tulis()) with check (public.bisa_tulis());

-- loss_allocation
create policy rugi_baca on public.loss_allocation
  for select to authenticated
  using (public.orang_dalam()
         or (public.is_pemodal() and unit_id is not null
             and not public.unit_internal(unit_id)));
create policy rugi_tulis on public.loss_allocation
  for all to authenticated using (public.bisa_tulis()) with check (public.bisa_tulis());

create policy rugi_item_baca on public.loss_allocation_items
  for select to authenticated
  using (public.orang_dalam()
         or (public.is_pemodal() and pemodal_id = (select auth.uid())));
create policy rugi_item_tulis on public.loss_allocation_items
  for all to authenticated using (public.bisa_tulis()) with check (public.bisa_tulis());

-- bank_reconciliation — angka agregat per tanggal, tanpa rincian unit
create policy rekon_baca on public.bank_reconciliation
  for select to authenticated using (public.orang_dalam() or public.is_pemodal());
create policy rekon_tulis on public.bank_reconciliation
  for all to authenticated using (public.bisa_tulis()) with check (public.bisa_tulis());

-- audit_log — hanya orang dalam. Isinya diff mentah seluruh tabel, termasuk
-- unit internal, jadi pemodal tidak boleh menyentuhnya sama sekali.
create policy audit_baca on public.audit_log
  for select to authenticated using (public.orang_dalam());

-- cash_ledger — per BARIS, bukan per tabel (ini yang sebelumnya bocor)
create policy kas_baca_orang_dalam on public.cash_ledger
  for select to authenticated using (public.orang_dalam());
create policy kas_baca_pemodal on public.cash_ledger
  for select to authenticated
  using (public.is_pemodal() and not public.kas_internal(ref_table, ref_id));
create policy kas_tulis on public.cash_ledger
  for all to authenticated using (public.bisa_tulis()) with check (public.bisa_tulis());

-- operational_expenses
-- CATATAN: tabel ini belum punya unit_id (temuan D1 di AUDIT-REPORT.md),
-- jadi biayanya tidak bisa diatribusikan ke unit mana pun dan karenanya
-- tidak membawa informasi mandiri_internal. Begitu D1 menambahkan unit_id,
-- policy ini WAJIB ditinjau ulang.
create policy opex_baca on public.operational_expenses
  for select to authenticated using (public.orang_dalam() or public.is_pemodal());
create policy opex_tulis on public.operational_expenses
  for all to authenticated using (public.bisa_tulis()) with check (public.bisa_tulis());

-- notifications — tiap orang hanya barisnya sendiri; menandai dibaca bukan
-- aksi finansial jadi tidak lewat bisa_tulis().
create policy notif_baca_sendiri on public.notifications
  for select to authenticated using (profile_id = (select auth.uid()));
create policy notif_tandai_dibaca on public.notifications
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- =====================================================================
-- ASUMSI YANG PERLU DIKONFIRMASI PEMILIK BISNIS
--
-- Dokumen keputusan hanya menyebut 3 role (super_admin / admin / pemodal),
-- tapi enum masih punya owner_partner, dan profit_share_settings masih
-- memakai owner_admin_percentage : owner_partner_percentage sebagai split
-- internal 20:80 antar dua owner KOPE.
--
-- Di file ini owner_partner diperlakukan sebagai ORANG DALAM: melihat
-- semua termasuk mandiri_internal, tidak bisa menulis. Dipilih karena
-- owner_partner = HALO KOPE = mudharib, jadi mustahil dia harus dibutakan
-- dari uang KOPE sendiri — dan karena mempertahankan akses yang sudah ada
-- lebih aman daripada diam-diam mencabutnya.
--
-- Yang perlu diputuskan: apakah dua owner KOPE itu = super_admin + admin
-- (sehingga owner_partner mati), atau super_admin + owner_partner
-- (sehingga admin adalah staf operasional)? Jawabannya menentukan siapa
-- penerima partner_final_profit.
-- =====================================================================
