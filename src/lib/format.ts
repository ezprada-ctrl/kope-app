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

export function formatPersen(value: number | string | null | undefined) {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}%`;
}
