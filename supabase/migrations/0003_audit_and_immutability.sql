-- =====================================================================
-- 0003 — Audit log immutable + larangan hard-delete
--
-- Prinsip: TIDAK ADA hard-delete untuk data finansial. Salah input =
-- bikin entry koreksi baru yang tertaut ke entry asal (koreksi_dari_id),
-- bukan overwrite atau hapus.
-- =====================================================================

create table public.audit_log (
  id              bigint generated always as identity primary key,
  tabel_terdampak text not null,
  record_id       text not null,
  aksi            public.audit_action not null,
  data_sebelum    jsonb,
  data_sesudah    jsonb,
  perubahan       jsonb,
  dilakukan_oleh  uuid,
  dilakukan_oleh_email text,
  timestamp       timestamptz not null default now()
);

create index audit_log_record_idx on public.audit_log (tabel_terdampak, record_id, timestamp desc);
create index audit_log_actor_idx  on public.audit_log (dilakukan_oleh, timestamp desc);

comment on table public.audit_log is
  'Append-only. Update & delete diblokir trigger. Hanya admin yang boleh baca.';

-- ---------------------------------------------------------------------
-- Trigger generik: catat setiap INSERT/UPDATE ke audit_log
-- ---------------------------------------------------------------------
create or replace function public.log_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before  jsonb;
  v_after   jsonb;
  v_changes jsonb;
  v_actor   uuid := auth.uid();
  v_email   text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
begin
  if tg_op = 'INSERT' then
    v_after := to_jsonb(new);
    insert into public.audit_log (
      tabel_terdampak, record_id, aksi, data_sebelum, data_sesudah, perubahan,
      dilakukan_oleh, dilakukan_oleh_email
    ) values (
      tg_table_name, (v_after ->> 'id'), 'create', null, v_after, v_after, v_actor, v_email
    );
    return new;
  end if;

  -- UPDATE
  v_before := to_jsonb(old);
  v_after  := to_jsonb(new);

  -- hanya field yang benar-benar berubah
  select coalesce(jsonb_object_agg(key, jsonb_build_object('dari', v_before -> key, 'jadi', v_after -> key)), '{}'::jsonb)
    into v_changes
  from jsonb_object_keys(v_after) as t(key)
  where (v_before -> key) is distinct from (v_after -> key)
    and key <> 'updated_at';

  if v_changes = '{}'::jsonb then
    return new; -- tidak ada perubahan berarti, jangan bikin noise
  end if;

  insert into public.audit_log (
    tabel_terdampak, record_id, aksi, data_sebelum, data_sesudah, perubahan,
    dilakukan_oleh, dilakukan_oleh_email
  ) values (
    tg_table_name, (v_after ->> 'id'), 'update', v_before, v_after, v_changes, v_actor, v_email
  );

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Guard: blokir DELETE di level database (bahkan untuk service_role)
-- ---------------------------------------------------------------------
create or replace function public.block_hard_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Hard-delete dilarang pada tabel %. Buat entry koreksi baru (koreksi_dari_id) atau ubah status.',
    tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

-- ---------------------------------------------------------------------
-- Guard: audit_log itu sendiri append-only
-- ---------------------------------------------------------------------
create or replace function public.block_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log bersifat immutable — % ditolak.', tg_op
    using errcode = 'restrict_violation';
end;
$$;

create trigger trg_audit_log_no_update
  before update or delete on public.audit_log
  for each row execute function public.block_audit_mutation();

-- ---------------------------------------------------------------------
-- Pasang audit + delete-guard ke semua tabel finansial
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  -- diaudit: setiap insert/update tercatat
  audited_tables text[] := array[
    'units',
    'investor_ledger',
    'courier_master',
    'courier_transactions',
    'cancellation_deposits',
    'refunds',
    'profit_share_settings',
    'profit_split',
    'loss_allocation',
    'loss_allocation_items',
    'bank_reconciliation',
    'plafon_settings',
    'profiles'
  ];
  -- tidak boleh hard-delete sama sekali (profiles dikecualikan supaya
  -- penghapusan user di auth.users tidak nyangkut di cascade)
  no_delete_tables text[] := array[
    'units',
    'investor_ledger',
    'courier_master',
    'courier_transactions',
    'cancellation_deposits',
    'refunds',
    'profit_share_settings',
    'profit_split',
    'loss_allocation',
    'loss_allocation_items',
    'bank_reconciliation',
    'plafon_settings'
  ];
begin
  foreach t in array audited_tables loop
    execute format(
      'create trigger trg_%1$s_audit
         after insert or update on public.%1$I
         for each row execute function public.log_audit()', t);
  end loop;

  foreach t in array no_delete_tables loop
    execute format(
      'create trigger trg_%1$s_no_delete
         before delete on public.%1$I
         for each row execute function public.block_hard_delete()', t);
  end loop;
end;
$$;
