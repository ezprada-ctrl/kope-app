-- =====================================================================
-- 0016 — Kerugian riil per unit + badan usaha
--
-- Dua hal yang diubah, keduanya menyangkut uang:
--
-- 1. RUGI TIDAK LAGI DIBAGI PAKAI NISBAH.
--    Keputusan bisnis: rugi normal ditanggung proporsional terhadap PORSI
--    MODAL, bukan mengikuti persentase bagi hasil. Karena HK tidak
--    menyetor modal, untuk unit mudharabah rugi finansial normal jatuh
--    ~100% ke Pemodal — HK "rugi" dalam bentuk kerja yang tidak berbuah
--    bagi hasil, bukan rugi uang.
--
--    settle_unit() sebelumnya menghitung `margin * pemodal_percentage`
--    yang untuk margin negatif berarti rugi dibagi pakai nisbah. Itu
--    bertentangan dengan keputusan di atas, jadi dirombak.
--
-- 2. MODAL TIDAK LAGI SELALU KEMBALI UTUH.
--    Tidak ada constraint yang memaksa modal kembali utuh — yang memaksa
--    adalah LOGIKA modal_tertahan_unit() yang tidak pernah dikurangi rugi.
--    Sekarang return_of_capital = modal tertahan - rugi yang ditanggung
--    Pemodal. Kalau rugi menghabiskan modal, tidak ada baris
--    return_of_capital sama sekali (kolom `jumlah` punya CHECK > 0).
--
-- Klasifikasi kerugian SENGAJA manual. Definisi operasional "kelalaian"
-- belum ditetapkan di akad, jadi tidak boleh jadi aturan otomatis di kode.
-- Yang dipaksa database cuma: kalau ada rugi, klasifikasi & justifikasinya
-- wajib terisi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Klasifikasi kerugian
-- ---------------------------------------------------------------------
do $$ begin
  create type public.loss_classification as enum ('normal', 'kelalaian', 'fraud');
exception when duplicate_object then null; end $$;

alter table public.units
  add column if not exists realized_loss numeric(18,2) not null default 0
    check (realized_loss >= 0),
  add column if not exists loss_classification public.loss_classification,
  add column if not exists loss_justifikasi text,
  add column if not exists loss_bearer_id uuid references public.profiles (id);

comment on column public.units.realized_loss is
  'Kerugian yang benar-benar terjadi pada unit ini. Diisi settle_unit() saat '
  'margin negatif, atau manual untuk rugi di luar margin (unit hilang/rusak).';
comment on column public.units.loss_classification is
  'normal | kelalaian | fraud. Diisi manual per kejadian — definisi '
  'operasional "kelalaian" belum ditetapkan di akad, jadi TIDAK boleh '
  'dijadikan aturan otomatis di kode.';
comment on column public.units.loss_bearer_id is
  'Pihak yang menanggung untuk kelalaian/fraud. NULL untuk rugi normal, '
  'karena rugi normal ditanggung proporsional terhadap porsi modal.';

-- Ada rugi -> klasifikasi & justifikasi wajib. Justifikasi tidak boleh
-- string kosong, supaya tidak bisa diakali dengan spasi.
alter table public.units
  drop constraint if exists rugi_wajib_diklasifikasi;
alter table public.units
  add constraint rugi_wajib_diklasifikasi check (
    realized_loss = 0
    or (loss_classification is not null
        and loss_justifikasi is not null
        and length(btrim(loss_justifikasi)) > 0)
  );

-- Kelalaian & fraud ditanggung pihak tertentu 100%, jadi pihaknya wajib jelas.
alter table public.units
  drop constraint if exists penanggung_wajib_untuk_kelalaian;
alter table public.units
  add constraint penanggung_wajib_untuk_kelalaian check (
    loss_classification is null
    or loss_classification = 'normal'
    or loss_bearer_id is not null
  );

-- ---------------------------------------------------------------------
-- 2. settle_unit — rugi lewat porsi modal, bukan nisbah
--
--    loss_allocation & loss_allocation_items akhirnya dipakai (sebelumnya
--    tabel mati: punya DDL, RLS, dan tipe TS tapi nol penulis).
-- ---------------------------------------------------------------------
create or replace function public.settle_unit(p_unit_id uuid)
returns public.units
language plpgsql
set search_path = public
as $$
declare
  v_unit           public.units;
  v_setting        public.profit_share_settings;
  v_modal          numeric(18,2);
  v_pemodal_id     uuid;
  v_margin         numeric(18,2);
  v_rugi           numeric(18,2);
  v_rugi_pemodal   numeric(18,2);
  v_kembali        numeric(18,2);
  v_pemodal_profit numeric(18,2);
  v_admin_pool     numeric(18,2);
  v_admin_final    numeric(18,2);
  v_partner_final  numeric(18,2);
  v_alloc_id       uuid;
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

  if exists (select 1 from public.profit_split where unit_id = p_unit_id) then
    raise exception 'Unit ini sudah pernah di-settle.'
      using errcode = 'unique_violation';
  end if;

  select * into v_setting
    from public.profit_share_settings
   where effective_date <= now()
   order by effective_date desc, created_at desc
   limit 1;

  if not found then
    raise exception 'Profit share settings belum diatur.'
      using errcode = 'check_violation';
  end if;

  v_pemodal_id := coalesce(
    v_unit.pemodal_id,
    (select l.pemodal_id
       from public.pemodal_ledger l
      where l.unit_id = p_unit_id and l.tipe = 'capital_call'
      order by l.tanggal, l.created_at
      limit 1));

  v_margin := v_unit.margin;
  v_rugi   := greatest(-v_margin, 0);
  v_modal  := public.modal_tertahan_unit(p_unit_id);

  -- Rugi harus diklasifikasi SEBELUM settle. Tanpa ini penanggungnya tidak
  -- bisa ditentukan, dan angka yang terlanjur ter-settle tidak bisa diulang.
  if v_rugi > 0 and v_unit.loss_classification is null then
    raise exception
      'Unit ini rugi %. Klasifikasi kerugian (normal/kelalaian/fraud) dan '
      'justifikasinya wajib diisi dulu sebelum unit di-settle.', v_rugi
      using errcode = 'check_violation';
  end if;

  -- ---- Bagi hasil hanya kalau untung ----
  if v_margin > 0 then
    if v_pemodal_id is null then
      v_pemodal_profit := 0;
    else
      v_pemodal_profit := round(v_margin * v_setting.pemodal_percentage / 100, 2);
    end if;
    v_admin_pool    := v_margin - v_pemodal_profit;
    v_admin_final   := round(v_admin_pool * v_setting.owner_admin_percentage / 100, 2);
    v_partner_final := v_admin_pool - v_admin_final;
  else
    -- Rugi TIDAK dibagi pakai nisbah. Penanganannya lewat porsi modal.
    v_pemodal_profit := 0;
    v_admin_pool     := 0;
    v_admin_final    := 0;
    v_partner_final  := 0;
  end if;

  -- ---- Siapa menanggung rugi ----
  -- normal    : proporsional porsi modal. Pemodal satu-satunya penyetor
  --             modal unit, jadi porsinya 100% (dibatasi modalnya sendiri).
  -- kelalaian : ditanggung pihak yang lalai 100%. Modal Pemodal hanya
  --   & fraud   berkurang kalau Pemodal sendiri yang jadi penanggung.
  v_rugi_pemodal := 0;

  if v_rugi > 0 and v_pemodal_id is not null and v_modal > 0 then
    if v_unit.loss_classification = 'normal'
       or v_unit.loss_bearer_id = v_pemodal_id then
      v_rugi_pemodal := least(v_rugi, v_modal);
    end if;
  end if;

  insert into public.profit_split (
    unit_id, tanggal_settle, margin_bruto, profit_share_setting_id,
    pemodal_id, pemodal_profit, admin_pool_profit,
    admin_final_profit, partner_final_profit
  ) values (
    p_unit_id, now(), v_margin, v_setting.id,
    v_pemodal_id, v_pemodal_profit, v_admin_pool,
    v_admin_final, v_partner_final
  );

  -- Jejak alokasi rugi supaya bisa diaudit siapa menanggung berapa.
  if v_rugi > 0 then
    insert into public.loss_allocation
      (periode, unit_id, total_pool_saat_kejadian, total_rugi, catatan)
    values
      (to_char(now(), 'YYYY-MM'), p_unit_id, v_modal, v_rugi,
       'Otomatis saat settle. Klasifikasi: ' || v_unit.loss_classification)
    returning id into v_alloc_id;

    if v_pemodal_id is not null then
      insert into public.loss_allocation_items
        (loss_allocation_id, pemodal_id, kontribusi, proporsi, jumlah_rugi_ditanggung)
      values
        (v_alloc_id, v_pemodal_id, v_modal,
         case when v_rugi = 0 then 0 else round(v_rugi_pemodal / v_rugi, 6) end,
         v_rugi_pemodal);
    end if;

    update public.units set realized_loss = v_rugi where id = p_unit_id;
  end if;

  if v_pemodal_id is not null and v_pemodal_profit > 0 then
    insert into public.pemodal_ledger
      (pemodal_id, tipe, jumlah, unit_id, catatan)
    values
      (v_pemodal_id, 'profit_share', v_pemodal_profit, p_unit_id,
       'Bagi hasil otomatis saat unit di-settle.');
  end if;

  -- Modal kembali SETELAH dikurangi rugi yang ditanggung Pemodal.
  -- Kalau rugi menghabiskan modal, tidak ada baris return_of_capital sama
  -- sekali — `jumlah` punya CHECK > 0, dan nol memang bukan peristiwa kas.
  v_kembali := v_modal - v_rugi_pemodal;

  if v_kembali > 0 and v_pemodal_id is not null then
    insert into public.pemodal_ledger
      (pemodal_id, tipe, jumlah, unit_id, catatan)
    values
      (v_pemodal_id, 'return_of_capital', v_kembali, p_unit_id,
       case when v_rugi_pemodal > 0
            then 'Pengembalian modal saat settle, dikurangi rugi ' || v_rugi_pemodal
            else 'Otomatis dicatat saat unit di-settle.' end);
  end if;

  update public.units
     set status = 'settled',
         tanggal_settle = now()
   where id = p_unit_id
  returning * into v_unit;

  return v_unit;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Badan usaha — infra untuk perubahan perorangan -> PT
--
--    Pajak WAJIB membaca jenis usaha yang berlaku pada TANGGAL TRANSAKSI,
--    bukan hari ini: kalau badan usaha berubah di tengah tahun buku,
--    transaksi lama tetap dihitung dengan aturan yang berlaku saat itu.
-- ---------------------------------------------------------------------
do $$ begin
  create type public.jenis_usaha as enum ('perorangan', 'cv', 'pt');
exception when duplicate_object then null; end $$;

create table if not exists public.business_entity_config (
  id               uuid primary key default gen_random_uuid(),
  jenis_usaha      public.jenis_usaha not null,
  berlaku_dari     date not null,
  berlaku_sampai   date,
  npwp             text,
  nama_resmi_usaha text,
  catatan          text,
  dicatat_oleh     uuid references public.profiles (id) default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint periode_badan_usaha_masuk_akal
    check (berlaku_sampai is null or berlaku_sampai >= berlaku_dari)
);

create index if not exists business_entity_periode_idx
  on public.business_entity_config (berlaku_dari desc);

drop trigger if exists trg_business_entity_touch on public.business_entity_config;
create trigger trg_business_entity_touch
  before update on public.business_entity_config
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_business_entity_audit on public.business_entity_config;
create trigger trg_business_entity_audit
  after insert or update on public.business_entity_config
  for each row execute function public.log_audit();

insert into public.business_entity_config
  (jenis_usaha, berlaku_dari, catatan)
select 'perorangan', date '2025-01-01',
       'Status awal. Ganti dengan baris baru saat berubah ke CV/PT — jangan '
       'update baris ini, supaya transaksi lama tetap terhitung dengan aturan lamanya.'
where not exists (select 1 from public.business_entity_config);

create or replace function public.jenis_usaha_pada(p_tanggal date)
returns public.jenis_usaha
language sql
stable
security definer
set search_path = public
as $$
  select b.jenis_usaha
  from public.business_entity_config b
  where b.berlaku_dari <= p_tanggal
    and (b.berlaku_sampai is null or b.berlaku_sampai >= p_tanggal)
  order by b.berlaku_dari desc
  limit 1;
$$;

comment on function public.jenis_usaha_pada(date) is
  'Badan usaha yang berlaku pada TANGGAL TRANSAKSI. Perhitungan pajak wajib '
  'memakai ini, bukan status hari ini.';

grant execute on function public.jenis_usaha_pada(date) to authenticated;

alter table public.business_entity_config enable row level security;

drop policy if exists badan_usaha_baca on public.business_entity_config;
create policy badan_usaha_baca on public.business_entity_config
  for select to authenticated
  using (public.orang_dalam() or public.is_pemodal());

drop policy if exists badan_usaha_tulis on public.business_entity_config;
create policy badan_usaha_tulis on public.business_entity_config
  for all to authenticated
  using (public.bisa_tulis()) with check (public.bisa_tulis());
