import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/auth-js";

/**
 * Next 16: Middleware berganti nama jadi Proxy (file `src/proxy.ts`).
 * Tugasnya: (1) tukar token_hash dari link email (invite/reset/magic link)
 * jadi session, (2) refresh session Supabase, (3) tendang guest ke /login.
 * Otorisasi sebenarnya tetap di RLS Postgres, bukan di sini.
 */
const PUBLIC_PATHS = ["/login", "/auth", "/atur-password"];

const OTP_TYPES: EmailOtpType[] = [
  "invite",
  "recovery",
  "email_change",
  "signup",
  "magiclink",
  "email",
];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Link undangan/reset/magic-link Supabase mendarat di Site URL dengan
  // ?token_hash=...&type=invite di query string (bukan hash fragment lagi).
  // Tangani di sini supaya jalan di path manapun link itu jatuh.
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const typeParam = request.nextUrl.searchParams.get("type");

  if (tokenHash && typeParam && OTP_TYPES.includes(typeParam as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: typeParam as EmailOtpType,
    });

    const url = request.nextUrl.clone();
    url.search = "";

    if (error) {
      url.pathname = "/login";
      url.searchParams.set("error", "link-tidak-valid");
      return NextResponse.redirect(url);
    }

    url.pathname =
      typeParam === "recovery" || typeParam === "invite"
        ? "/atur-password"
        : "/dashboard";

    const redirectResponse = NextResponse.redirect(url);
    // Bawa cookie sesi yang baru saja di-set oleh verifyOtp() ke response redirect.
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    return redirectResponse;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
