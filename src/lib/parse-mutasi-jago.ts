import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const BULAN: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  mei: 5,
  may: 5,
  jun: 6,
  jul: 7,
  agu: 8,
  ags: 8,
  aug: 8,
  sep: 9,
  okt: 10,
  oct: 10,
  nov: 11,
  des: 12,
  dec: 12,
};

const DATE_RE = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/;
const TIME_RE = /^\d{1,2}:\d{2}$/;
// Nominal transaksi selalu bertanda (+/-); saldo berjalan tidak. Dua token
// berurutan yang cocok pola ini gak pernah muncul di tempat lain pada PDF
// mutasi Jago (ID transaksi punya huruf, catatan gak diawali +/-).
const AMOUNT_RE = /^[+-]\d[\d.,]*$/;
const BALANCE_RE = /^\d[\d.,]*$/;

export type MutasiRecord = {
  /** yyyymmdd, untuk perbandingan tanggal tanpa isu timezone. */
  dateNum: number;
  tanggalLabel: string;
  waktuLabel: string | null;
  balance: number;
};

function parseAngkaIndo(raw: string): number {
  return Number(raw.replace(/\./g, "").replace(",", "."));
}

function parseTanggal(raw: string): { dateNum: number; label: string } | null {
  const m = DATE_RE.exec(raw);
  if (!m) return null;
  const [, dayStr, monStr, yearStr] = m;
  const month = BULAN[monStr.toLowerCase()];
  if (!month) return null;
  return {
    dateNum: Number(yearStr) * 10000 + month * 100 + Number(dayStr),
    label: raw,
  };
}

/**
 * Ekstrak pasangan (tanggal, saldo berjalan) dari tiap baris transaksi di
 * PDF "Pockets Transactions History" Bank Jago. Cukup mengandalkan urutan
 * item teks apa adanya (tanpa cluster koordinat) — untuk PDF ini urutan
 * raw-nya sudah baris-per-baris logis: tanggal, waktu, ..., nominal,
 * saldo — jadi state machine sederhana berbasis dua anchor (tanggal, lalu
 * pasangan nominal+saldo) cukup dan tidak butuh parser tabel x/y penuh.
 */
export async function parseMutasiJagoPdf(
  data: Uint8Array,
): Promise<MutasiRecord[]> {
  const doc = await getDocument({ data }).promise;
  const records: MutasiRecord[] = [];

  let currentDate: { dateNum: number; label: string } | null = null;
  let currentTime: string | null = null;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const tokens = content.items
      .map((it) => ("str" in it ? it.str.trim() : ""))
      .filter((s) => s.length > 0);

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];

      const tgl = parseTanggal(tok);
      if (tgl) {
        currentDate = tgl;
        currentTime = null;
        if (i + 1 < tokens.length && TIME_RE.test(tokens[i + 1])) {
          currentTime = tokens[i + 1];
          i += 1;
        }
        continue;
      }

      if (
        currentDate &&
        AMOUNT_RE.test(tok) &&
        i + 1 < tokens.length &&
        BALANCE_RE.test(tokens[i + 1])
      ) {
        records.push({
          dateNum: currentDate.dateNum,
          tanggalLabel: currentDate.label,
          waktuLabel: currentTime,
          balance: parseAngkaIndo(tokens[i + 1]),
        });
        i += 1;
      }
    }
  }

  return records;
}

/**
 * Cari saldo berjalan dari transaksi terakhir pada/sebelum `targetISO`
 * (format YYYY-MM-DD). `records` gak wajib terurut sempurna — kandidat
 * terakhir yang ditemukan di antara yang cocok tanggal selalu dipakai,
 * dan urutan PDF asli sudah kronologis per hari.
 */
export function cariSaldoPadaTanggal(
  records: MutasiRecord[],
  targetISO: string,
): MutasiRecord | null {
  const [y, m, d] = targetISO.split("-").map(Number);
  if (!y || !m || !d) return null;
  const targetNum = y * 10000 + m * 100 + d;

  let best: MutasiRecord | null = null;
  for (const r of records) {
    if (r.dateNum <= targetNum) best = r;
  }
  return best;
}
