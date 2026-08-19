@AGENTS.md

# KOPE — catatan project

Aplikasi manajemen keuangan bisnis jual-beli iPhone. Spec: `spek-aplikasi-keuangan-iphone-business.md`.
Rencana fase: `claude-code-starter-prompt.md`. Bahasa UI & komentar: Indonesia.

## Supabase

- Project ref: `gzhlbikjmzwqsrnqpthr` (org KOPE, ap-south-1, free tier)
- Migrasi di `supabase/migrations/`, sudah diterapkan lewat SQL Editor
- Tidak ada Supabase CLI / Docker di mesin ini — migrasi baru dijalankan manual
  lewat SQL Editor dashboard

## Aturan yang tidak boleh dilanggar

- Uang selalu `numeric(18,2)` di Postgres. Jangan pernah `float`, dan jangan
  hitung ulang nilai finansial di client lalu tulis balik ke DB — kolom
  `hpp_total`, `margin`, `fee_net_kurir`, `selisih` semua GENERATED di DB.
- Tidak ada hard-delete data finansial. Koreksi = insert baris baru dengan
  `koreksi_dari_id` menunjuk baris asal.
- Otorisasi sebenarnya ada di RLS Postgres, bukan di kode Next.js. `requireRole()`
  cuma untuk UX; kalau menambah tabel, wajib tambah policy-nya juga.
- Admin satu-satunya role yang boleh insert/update. Partner & investor read-only.
- Investor hanya boleh melihat unit dengan `investor_id = auth.uid()`.

## Next.js 16

- Middleware bernama `proxy.ts` (di `src/`), bukan `middleware.ts`.
- `cookies()`, `params`, `searchParams` semuanya async.
- Route types: jalankan `npx next typegen` setelah menambah route baru.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
