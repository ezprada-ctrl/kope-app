/**
 * Nama cookie penanda catatan /dev sudah dibuka.
 *
 * Ditaruh di sini, bukan di `dev/actions.ts`, karena file bertanda
 * "use server" hanya boleh mengekspor fungsi async — mengekspor konstanta
 * dari sana bikin seluruh modulnya gagal dikompilasi.
 */
export const COOKIE_DEV = "dev_notes_terbuka";
