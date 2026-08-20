-- =====================================================================
-- 0019 — settle_unit() dialihkan ke unit_profit_snapshot (tutup Cacat J2)
--
-- Migrasi 0018 membangun engine snapshot (nisbah dikunci saat dana
-- dialokasikan) tapi SENGAJA belum menyambungkannya ke settle_unit() —
-- itu masih membaca profit_share_settings di WAKTU SETTLE, bug yang sama
-- yang ditemukan AUDIT-REPORT.md butir J2. Migrasi ini menutupnya:
--
--   1. settle_unit() sekarang membaca nisbah dari unit_profit_snapshot
--      KALAU ada (dikunci sejak dana dialokasikan — bukan retroaktif).
--   2. Fallback ke profit_share_settings kalau snapshot tidak ada (unit
--      yang deal_type-nya belum punya skema aktif saat dana dialokasikan)
--      — supaya operasional tidak terhenti, sesuai filosofi 0018 sendiri.
--   3. Seed satu profit_schemes + tiers yang setara persis dengan setting
--      global yang aktif sekarang (60% pemodal, sisa 20/80 Owner1/Owner2),
--      supaya capital call BARU mulai hari ini benar-benar terkunci di
--      waktu yang tepat — bukan cuma teori.
--
-- Matematika settle_unit TIDAK berubah untuk unit yang lewat jalur lama —
-- hasilnya identik, cuma sumber tiga angka persentase yang beda:
--   pemodal_percentage       -> persentase pihak 'pemodal_us'
--   owner_admin_percentage   -> rasio 'owner_1' terhadap (owner_1+owner_2)
--   owner_partner_percentage -> rasio 'owner_2' terhadap (owner_1+owner_2)
-- Rasio ini dipilih (bukan persentase absolut dari margin) supaya
-- perhitungan tetap benar walau v_pemodal_id null (unit pool tanpa capital
-- call langsung) — persis perilaku settle_unit() versi 0016.
--
-- Keterbatasan yang disengaja: helper di bawah cuma mengenali TEPAT tiga
-- pihak (pemodal_us/owner_1/owner_2), bentuk skema yang ada sekarang.
-- Skema dengan pihak lain akan gagal LOUD (exception), bukan diam-diam
-- salah hitung — kalau nanti ada bentuk skema baru, settle_unit() ini
-- wajib direvisi dulu, jangan dipaksa jalan.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. profit_split.profit_share_setting_id jadi nullable.
--    NULL artinya settle memakai unit_profit_snapshot, bukan legacy
--    setting — memaksa FK ke profit_share_settings di jalur baru cuma
--    akan membuat rekaman palsu ("seolah dari setting X" padahal bukan).
-- ---------------------------------------------------------------------
alter table public.profit_split
  alter column profit_share_setting_id drop not null;

comment on column public.profit_split.profit_share_setting_id is
  'NULL kalau nisbah berasal dari unit_profit_snapshot (jalur baru, migrasi '
  '0019). Terisi kalau berasal dari profit_share_settings (jalur lama, '
  'fallback saat unit tidak punya snapshot).';

-- ---------------------------------------------------------------------
-- 2. Helper: baca persentase satu pihak dari snapshot_json.
-- ---------------------------------------------------------------------
create or replace function public.persentase_snapshot_pihak(
  p_snapshot jsonb, p_pihak_kode text
)
returns numeric
language sql
immutable
as $$
  select (elem->>'persentase')::numeric
  from jsonb_array_elements(p_snapshot) elem
  where elem->>'pihak_kode' = p_pihak_kode
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- 3. settle_unit — sumber nisbah: snapshot dulu, baru fallback setting.
--    Semua bagian lain (rugi lewat porsi modal, loss_allocation, dst.)
--    disalin apa adanya dari 0016 — tidak disentuh.
-- ---------------------------------------------------------------------
create or replace function public.settle_unit(p_unit_id uuid)
returns public.units
language plpgsql
set search_path = public
as $$
declare
  v_unit           public.units;
  v_setting        public.profit_share_settings;
  v_snapshot       public.unit_profit_snapshot;
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
  v_setting_id     uuid;
  v_pct_pemodal    numeric;
  v_pct_owner1     numeric;
  v_pct_owner2     numeric;
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

  v_pemodal_id := coalesce(
    v_unit.pemodal_id,
    (select l.pemodal_id
       from public.pemodal_ledger l
      where l.unit_id = p_unit_id and l.tipe = 'capital_call'
      order by l.tanggal, l.created_at
      limit 1));

  -- ---- Sumber nisbah: snapshot terkunci, baru fallback setting ----
  select * into v_snapshot
    from public.unit_profit_snapshot
   where unit_id = p_unit_id;

  if found then
    v_pct_pemodal := public.persentase_snapshot_pihak(v_snapshot.snapshot_json, 'pemodal_us');
    v_pct_owner1  := public.persentase_snapshot_pihak(v_snapshot.snapshot_json, 'owner_1');
    v_pct_owner2  := public.persentase_snapshot_pihak(v_snapshot.snapshot_json, 'owner_2');

    if v_pct_pemodal is null or v_pct_owner1 is null or v_pct_owner2 is null then
      raise exception
        'Snapshot nisbah unit ini bukan bentuk pemodal_us/owner_1/owner_2 — '
        'settle_unit() belum mendukung bentuk skema lain. Revisi fungsi ini '
        'dulu sebelum melanjutkan.'
        using errcode = 'check_violation';
    end if;

    v_setting_id := null;
  else
    select * into v_setting
      from public.profit_share_settings
     where effective_date <= now()
     order by effective_date desc, created_at desc
     limit 1;

    if not found then
      raise exception 'Profit share settings belum diatur.'
        using errcode = 'check_violation';
    end if;

    v_pct_pemodal := v_setting.pemodal_percentage;
    v_pct_owner1  := v_setting.owner_admin_percentage;
    v_pct_owner2  := v_setting.owner_partner_percentage;
    v_setting_id  := v_setting.id;
  end if;

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
  -- v_pct_owner1/v_pct_owner2 dipakai sebagai RASIO (bukan persentase
  -- absolut dari margin) supaya benar juga saat v_pemodal_id null (unit
  -- pool tanpa capital call langsung) — persis perilaku versi 0016.
  if v_margin > 0 then
    if v_pemodal_id is null then
      v_pemodal_profit := 0;
    else
      v_pemodal_profit := round(v_margin * v_pct_pemodal / 100, 2);
    end if;
    v_admin_pool  := v_margin - v_pemodal_profit;
    v_admin_final := round(
      v_admin_pool * v_pct_owner1 / nullif(v_pct_owner1 + v_pct_owner2, 0), 2);
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
    p_unit_id, now(), v_margin, v_setting_id,
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
-- 4. v_profit_ringkasan — INNER JOIN ke profit_share_settings akan diam-
--    diam membuang unit yang settle lewat snapshot (profit_share_setting_id
--    NULL). Ganti LEFT JOIN + fallback hitung dari snapshot, kolom yang
--    sama persis (UI tidak perlu berubah).
-- ---------------------------------------------------------------------
create or replace view public.v_profit_ringkasan
with (security_invoker = true) as
select
  ps.unit_id,
  u.model,
  u.kode,
  ps.tanggal_settle,
  ps.margin_bruto,
  ps.pemodal_id,
  ps.pemodal_profit,
  ps.admin_pool_profit,
  ps.admin_final_profit,
  ps.partner_final_profit,
  coalesce(
    s.pemodal_percentage,
    public.persentase_snapshot_pihak(snap.snapshot_json, 'pemodal_us')
  )::numeric(5,2) as pemodal_percentage,
  coalesce(
    s.owner_admin_percentage,
    round(100 * public.persentase_snapshot_pihak(snap.snapshot_json, 'owner_1')
      / nullif(
          public.persentase_snapshot_pihak(snap.snapshot_json, 'owner_1')
          + public.persentase_snapshot_pihak(snap.snapshot_json, 'owner_2'), 0),
      4)
  )::numeric(5,2) as owner_admin_percentage,
  coalesce(
    s.owner_partner_percentage,
    round(100 * public.persentase_snapshot_pihak(snap.snapshot_json, 'owner_2')
      / nullif(
          public.persentase_snapshot_pihak(snap.snapshot_json, 'owner_1')
          + public.persentase_snapshot_pihak(snap.snapshot_json, 'owner_2'), 0),
      4)
  )::numeric(5,2) as owner_partner_percentage
from public.profit_split ps
join public.units u on u.id = ps.unit_id
left join public.profit_share_settings s on s.id = ps.profit_share_setting_id
left join public.unit_profit_snapshot snap on snap.unit_id = ps.unit_id;

-- ---------------------------------------------------------------------
-- 5. Seed skema mudharabah setara persis dengan setting global aktif
--    (60% pemodal, sisa 20/80 Owner1/Owner2 — lihat 0005_views_and_seed.sql)
--    supaya capital call baru mulai sekarang benar-benar terkunci lewat
--    engine, bukan cuma tersedia secara teori.
--
--    tanggal_mulai akad diambil dari nama file dokumen yang sudah
--    ditandatangani ("...M. IKRAM_2025-05-07_16.27_signed.pdf", lihat
--    AUDIT-REPORT.md) — BUKAN dibaca dari isi dokumennya (belum dibuka).
--    Verifikasi tanggal ini dan lampirkan dokumen_url setelah dicek.
--    berlaku_dari skema sengaja tanggal migrasi ini dijalankan, bukan
--    dibackdate — skema ini baru resmi mengunci mulai sekarang.
--
--    Aman dijalankan ulang: guard `where not exists` di bawah membuat
--    seluruh chain insert jadi no-op kalau kontraknya sudah ada.
-- ---------------------------------------------------------------------
with kontrak as (
  insert into public.contracts (
    jenis_akad, nama, pihak_pertama, pihak_kedua, tanggal_mulai, catatan
  )
  select
    'mudharabah',
    'Akad Mudharabah — Pemodal & KOPE (seed migrasi 0019)',
    (select id from public.parties where kode = 'pemodal_us'),
    (select id from public.parties where kode = 'owner_1'),
    date '2025-05-07',
    'tanggal_mulai dari nama file dokumen akad yang sudah ditandatangani, '
    'BELUM diverifikasi isinya. dokumen_url belum dilampirkan.'
  where not exists (
    select 1 from public.contracts
    where nama = 'Akad Mudharabah — Pemodal & KOPE (seed migrasi 0019)'
  )
  returning id
),
skema as (
  insert into public.profit_schemes (
    nama_skema, keterangan, basis_perhitungan, deal_type_target, status,
    berlaku_dari, contract_id, whitelist_biaya, disetujui_oleh, disetujui_pada
  )
  select
    'Mudharabah — seed dari profit_share_settings (migrasi 0019)',
    'Setara persis dengan profit_share_settings aktif saat migrasi ini '
    'dijalankan: 60% pemodal, sisa 20/80 Owner1/Owner2. Ganti/arsipkan '
    'kalau nisbah sebenarnya berbeda dari ini.',
    'gross_margin', 'mudharabah', 'active',
    current_date, kontrak.id, '[]'::jsonb,
    (select id from public.profiles where role = 'super_admin' limit 1), now()
  from kontrak
  returning id
)
insert into public.profit_scheme_tiers (scheme_id, level, pihak_id, persentase, urutan)
select skema.id, 1, p.id, v.persentase, v.urutan
from skema
cross join (values
  ('pemodal_us', 60::numeric, 1),
  ('owner_1',     8::numeric, 2),
  ('owner_2',    32::numeric, 3)
) as v(kode, persentase, urutan)
join public.parties p on p.kode = v.kode;
