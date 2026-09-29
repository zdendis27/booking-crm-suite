import { cache } from "react";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { PublicSalon } from "@/lib/public-types";

export const getPublicSalon = cache(async (slug: string): Promise<PublicSalon | null> => {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.rpc("public_salon", { p_slug: slug });
  return (data as unknown as PublicSalon | null) ?? null;
});
