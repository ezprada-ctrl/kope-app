import MarkAllReadButton from "@/components/mark-all-read-button";
import NotificationItem from "@/components/notification-item";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Notifikasi" };

export default async function NotifikasiPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: notifs, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const belumDibaca = (notifs ?? []).filter((n) => !n.dibaca_pada).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Notifikasi</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Setiap uang masuk/keluar dompet bisnis tercatat di sini — supaya
            kamu bisa menyilangkan sendiri dengan realita.
          </p>
        </div>

        <MarkAllReadButton disabled={belumDibaca === 0} />
      </div>

      {error && (
        <p className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          Gagal memuat notifikasi: {error.message}
        </p>
      )}

      {notifs && notifs.length === 0 ? (
        <p className="rounded-xl border border-neutral-900 bg-neutral-900/40 px-4 py-8 text-center text-sm text-neutral-400">
          Belum ada notifikasi.
        </p>
      ) : (
        notifs && (
          <ul className="divide-y divide-neutral-900 rounded-xl border border-neutral-900">
            {notifs.map((n) => (
              <NotificationItem key={n.id} n={n} />
            ))}
          </ul>
        )
      )}
    </div>
  );
}
