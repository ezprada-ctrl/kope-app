"use client";

import { useEffect, useSyncExternalStore } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Sebagian link email Supabase (invite/reset password lewat
 * `{{ .ConfirmationURL }}` klasik) menaruh hasilnya di FRAGMENT URL, bukan
 * query string. Fragment tidak pernah sampai ke server (termasuk proxy.ts) —
 * hanya browser yang bisa membacanya.
 *
 * Dua kemungkinan isi fragment:
 *   sukses : #access_token=...&type=recovery
 *   gagal  : #error=access_denied&error_code=otp_expired&error_description=...
 */

// Fragment tidak berubah setelah halaman dimuat, jadi subscribe-nya no-op.
const langgananKosong = () => () => {};
const bacaHashClient = () => window.location.hash;
const bacaHashServer = () => "";

function pesanDariError(params: URLSearchParams): string | null {
  const errorCode = params.get("error_code");
  if (!params.get("error") && !errorCode) return null;

  if (errorCode === "otp_expired") {
    return "Link sudah kedaluwarsa atau sudah pernah dipakai. Tiap link cuma bisa diklik sekali — minta admin kirim ulang.";
  }
  return (params.get("error_description") ?? "Link tidak valid.").replace(
    /\+/g,
    " ",
  );
}

export default function SessionFromHash() {
  const hash = useSyncExternalStore(
    langgananKosong,
    bacaHashClient,
    bacaHashServer,
  );

  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const pesanError = pesanDariError(params);
  const punyaToken = params.get("access_token") !== null;
  const type = params.get("type");

  useEffect(() => {
    if (!punyaToken) return;

    const tujuan =
      type === "recovery" || type === "invite" ? "/atur-password" : "/dashboard";

    // supabase-js menukar fragment jadi session sendiri (detectSessionInUrl);
    // kita cuma menunggu event-nya lalu mengarahkan.
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (
        session &&
        (event === "PASSWORD_RECOVERY" ||
          event === "SIGNED_IN" ||
          event === "INITIAL_SESSION")
      ) {
        window.location.replace(tujuan);
      }
    });

    return () => subscription.unsubscribe();
  }, [punyaToken, type]);

  if (!pesanError) return null;

  return (
    <p className="mb-4 rounded-lg border border-amber-900 bg-amber-950/50 px-3 py-2 text-sm text-amber-200">
      {pesanError}
    </p>
  );
}
