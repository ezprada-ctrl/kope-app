-- =====================================================================
-- 0004 — Row Level Security
--
-- Aturan dasar (section 2 spec):
--   admin         : full akses (satu-satunya yang boleh insert/update)
--   owner_partner : VIEW-ONLY, boleh lihat semua unit + HPP + margin
--   investor      : VIEW-ONLY, HANYA unit yang dia danai + data dirinya
--
-- Tidak ada satu pun policy DELETE di file ini — hard-delete memang
-- tidak diizinkan (diperkuat trigger block_hard_delete di 0003).
-- =====================================================================

alter table public.profiles              enable row level security;
alter table public.plafon_settings       enable row level security;
alter table public.units                 enable row level security;
alter table public.investor_ledger       enable row level security;
alter table public.courier_master        enable row level security;
alter table public.courier_transactions  enable row level security;
alter table public.cancellation_deposits enable row level security;
alter table public.refunds               enable row level security;
alter table public.profit_share_settings enable row level security;
alter table public.profit_split          enable row level security;
alter table public.loss_allocation       enable row level security;
alter table public.loss_allocation_items enable row level security;
alter table public.bank_reconciliation   enable row level security;
alter table public.audit_log             enable row level security;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_select_admin_partner on public.profiles
  for select to authenticated
  using (public.is_admin() or public.is_partner());

create policy profiles_admin_insert on public.profiles
  for insert to authenticated
  with check (public.is_admin());

create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- plafon_settings
-- ---------------------------------------------------------------------
create policy plafon_admin_all on public.plafon_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy plafon_partner_read on public.plafon_settings
  for select to authenticated
  using (public.is_partner());

create policy plafon_investor_read on public.plafon_settings
  for select to authenticated
  using (
    public.is_investor()
    and (investor_id is null or investor_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------
-- units
-- ---------------------------------------------------------------------
create policy units_admin_all on public.units
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy units_partner_read on public.units
  for select to authenticated
  using (public.is_partner());

create policy units_investor_read on public.units
  for select to authenticated
  using (public.is_investor() and investor_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- investor_ledger
-- ---------------------------------------------------------------------
create policy ledger_admin_all on public.investor_ledger
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy ledger_partner_read on public.investor_ledger
  for select to authenticated
  using (public.is_partner());

create policy ledger_investor_read on public.investor_ledger
  for select to authenticated
  using (public.is_investor() and investor_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- courier_master
-- ---------------------------------------------------------------------
create policy courier_admin_all on public.courier_master
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy courier_read_all_roles on public.courier_master
  for select to authenticated
  using (public.is_partner() or public.is_investor());

-- ---------------------------------------------------------------------
-- courier_transactions
-- ---------------------------------------------------------------------
create policy courier_tx_admin_all on public.courier_transactions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy courier_tx_partner_read on public.courier_transactions
  for select to authenticated
  using (public.is_partner());

create policy courier_tx_investor_read on public.courier_transactions
  for select to authenticated
  using (public.is_investor() and unit_id is not null and public.funds_unit(unit_id));

-- ---------------------------------------------------------------------
-- cancellation_deposits
-- ---------------------------------------------------------------------
create policy cancel_admin_all on public.cancellation_deposits
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy cancel_partner_read on public.cancellation_deposits
  for select to authenticated
  using (public.is_partner());

create policy cancel_investor_read on public.cancellation_deposits
  for select to authenticated
  using (public.is_investor() and public.funds_unit(unit_id));

-- ---------------------------------------------------------------------
-- refunds
-- ---------------------------------------------------------------------
create policy refunds_admin_all on public.refunds
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy refunds_partner_read on public.refunds
  for select to authenticated
  using (public.is_partner());

create policy refunds_investor_read on public.refunds
  for select to authenticated
  using (public.is_investor() and public.funds_unit(unit_id));

-- ---------------------------------------------------------------------
-- profit_share_settings — semua pihak berhak tahu skema bagi hasil
-- ---------------------------------------------------------------------
create policy pss_admin_all on public.profit_share_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy pss_read_all_roles on public.profit_share_settings
  for select to authenticated
  using (public.is_partner() or public.is_investor());

-- ---------------------------------------------------------------------
-- profit_split
-- ---------------------------------------------------------------------
create policy split_admin_all on public.profit_split
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy split_partner_read on public.profit_split
  for select to authenticated
  using (public.is_partner());

create policy split_investor_read on public.profit_split
  for select to authenticated
  using (public.is_investor() and investor_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- loss_allocation (+ items)
-- ---------------------------------------------------------------------
create policy loss_admin_all on public.loss_allocation
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy loss_partner_read on public.loss_allocation
  for select to authenticated
  using (public.is_partner());

create policy loss_investor_read on public.loss_allocation
  for select to authenticated
  using (
    public.is_investor()
    and exists (
      select 1 from public.loss_allocation_items i
      where i.loss_allocation_id = loss_allocation.id
        and i.investor_id = (select auth.uid())
    )
  );

create policy loss_items_admin_all on public.loss_allocation_items
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy loss_items_partner_read on public.loss_allocation_items
  for select to authenticated
  using (public.is_partner());

create policy loss_items_investor_read on public.loss_allocation_items
  for select to authenticated
  using (public.is_investor() and investor_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- bank_reconciliation — transparansi radikal: semua pihak boleh lihat
-- selisih pencatatan app vs mutasi bank.
-- ---------------------------------------------------------------------
create policy recon_admin_all on public.bank_reconciliation
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy recon_read_all_roles on public.bank_reconciliation
  for select to authenticated
  using (public.is_partner() or public.is_investor());

-- ---------------------------------------------------------------------
-- audit_log — admin only (read-only; insert lewat SECURITY DEFINER trigger)
-- ---------------------------------------------------------------------
create policy audit_admin_read on public.audit_log
  for select to authenticated
  using (public.is_admin());
