import LoginForm from "./login-form";
import SessionFromHash from "./session-from-hash";

export const metadata = { title: "Masuk" };

export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const next = typeof params.next === "string" ? params.next : "/dashboard";
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-950 px-4 py-10 text-neutral-100">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">KOPE</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Manajemen keuangan jual-beli iPhone
          </p>
        </div>

        {error === "profil-tidak-ditemukan" && (
          <p className="mb-4 rounded-lg border border-amber-900 bg-amber-950/50 px-3 py-2 text-sm text-amber-200">
            Akun kamu belum punya profil. Hubungi admin.
          </p>
        )}

        {error === "link-tidak-valid" && (
          <p className="mb-4 rounded-lg border border-amber-900 bg-amber-950/50 px-3 py-2 text-sm text-amber-200">
            Link undangan/reset password tidak valid atau sudah kedaluwarsa.
            Minta admin kirim ulang.
          </p>
        )}

        <SessionFromHash />
        <LoginForm next={next} />
      </div>
    </main>
  );
}
