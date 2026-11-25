import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl } from "./config";

let client: SupabaseClient | null = null;

/** Cliente de Supabase para el navegador (una sola instancia). */
export function supabaseBrowser(): SupabaseClient {
  client ??= createClient(supabaseUrl, supabaseKey);
  return client;
}
