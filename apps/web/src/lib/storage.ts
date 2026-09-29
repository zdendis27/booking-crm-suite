import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./supabase/env";

export function mediaUrl(path: string | null | undefined): string | null {
  return path ? `${supabaseUrl}/storage/v1/object/public/salon-media/${path}` : null;
}

export async function uploadSalonMedia(sb: SupabaseClient, salonId: string, file: File, name: string): Promise<string> {
  if (file.size > 6 * 1024 * 1024) throw new Error("Soubor je příliš velký (maximum 6 MB).");
  if (!file.type.startsWith("image/")) throw new Error("Nahrát lze jen obrázek.");
  const extension = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${salonId}/${name}-${Date.now()}.${extension}`;
  const { error } = await sb.storage.from("salon-media").upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
  if (error) throw new Error(error.message);
  return path;
}
