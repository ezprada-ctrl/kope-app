"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

/**
 * Halaman pendaratan link undangan / reset password dari email Supabase.
 *
 * Link undangan mengembalikan token di fragment URL (`#access_token=…`).
 * Fragment tidak pernah sampai ke server, jadi halaman ini wajib client
 * component — supabase-js yang membaca fragment lalu menukarnya jadi session.
 */
export default function AturPasswordPage() {
  const router = useRouter();
  const [siap, setSiap] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [proses, setProses] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSiap(true);
      } else {
        setPesan(
          "Link undangan tidak valid atau sudah kedaluwarsa. Minta admin kirim ulang.",
        );
      }
    });
  }, []);

  async function simpan(formData: FormData) {
    const password = String(formData.get("password") ?? "");
    const ulangi = String(formData.get("ulangi") ?? "");

    if (password.length < 8) {
      setPesan("Password minimal 8 karakter.");
      return;
    }
    if (password !== ulangi) {
      setPesan("Konfirmasi password tidak cocok.");
      return;
    }

    setProses(true);
    setPesan(null);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setPesan(error.message);
      setProses(false);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-950 px-4 py-10 text-neutral-100">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Atur password</h1>
        <p className="mt-1 mb-8 text-sm text-neutral-400">
          Buat password untuk akun KOPE kamu.
        </p>

        {siap ? (
          <form action={simpan} className="space-y-4">
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm text-neutral-300"
              >
                Password baru
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label
                htmlFor="ulangi"
                className="mb-1.5 block text-sm text-neutral-300"
              >
                Ulangi password
              </label>
              <input
                id="ulangi"
                name="ulangi"
                type="password"
                autoComplete="new-password"
                required
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
              />
            </div>

            {pesan && (
              <p className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
                {pesan}
              </p>
            )}

            <button
              type="submit"
              disabled={proses}
              className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-neutral-950 transition hover:bg-emerald-400 disabled:opacity-60"
            >
              {proses ? "Menyimpan…" : "Simpan & masuk"}
            </button>
          </form>
        ) : (
          <p className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-300">
            {pesan ?? "Memeriksa link undangan…"}
          </p>
        )}
      </div>
    </main>
  );
}
