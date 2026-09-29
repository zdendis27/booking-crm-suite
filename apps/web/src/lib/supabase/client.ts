import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@repo/db";
import { supabaseKey, supabaseUrl } from "./env";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function getSupabase() {
  if (!client) {
    client = createBrowserClient<Database>(supabaseUrl, supabaseKey);
  }
  return client;
}
