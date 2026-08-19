"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function tandaiSudahDibaca(id: string) {
  const profile = await requireProfile();
  const supabase = await createClient();

  // RLS (notif_tandai_dibaca) sudah membatasi ke baris milik sendiri;
  // filter profile_id di sini cuma jaga-jaga, bukan satu-satunya penjaga.
  await supabase
    .from("notifications")
    .update({ dibaca_pada: new Date().toISOString() })
    .eq("id", id)
    .eq("profile_id", profile.id);

  revalidatePath("/notifikasi");
  revalidatePath("/dashboard");
}

export async function tandaiSemuaDibaca() {
  const profile = await requireProfile();
  const supabase = await createClient();

  await supabase
    .from("notifications")
    .update({ dibaca_pada: new Date().toISOString() })
    .eq("profile_id", profile.id)
    .is("dibaca_pada", null);

  revalidatePath("/notifikasi");
  revalidatePath("/dashboard");
}
