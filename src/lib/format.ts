const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const tanggal = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function formatRupiah(value: number | string | null | undefined) {
  if (value === null || value === undefined) return "—";
  return rupiah.format(typeof value === "string" ? Number(value) : value);
}

export function formatTanggal(value: string | null | undefined) {
  if (!value) return "—";
  return tanggal.format(new Date(value));
}

/**
 * Tanggal LOKAL dalam format YYYY-MM-DD, buat kolom date dan default input.
 *
 * Jangan pernah pakai `new Date().toISOString().slice(0, 10)` untuk ini.
 * `toISOString()` mengonversi ke UTC dulu, jadi di WIB (UTC+7) tanggalnya
 * mundur satu hari setiap kali jam lokal masih di bawah 07:00 — biaya yang
 * diinput jam 6 pagi tercatat tanggal kemarin. Dan untuk tanggal yang dibuat
 * dari tengah malam lokal (`new Date(y, m, 1)`) hasilnya SELALU mundur satu
 * hari, bukan cuma kadang-kadang.
 */
export function tanggalLokalISO(d: Date = new Date()) {
  const bulan = String(d.getMonth() + 1).padStart(2, "0");
  const hari = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${bulan}-${hari}`;
}

export function formatPersen(value: number | string | null | undefined) {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}%`;
}
