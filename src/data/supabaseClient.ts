import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** A chave "anon"/"publishable" é pública por desenho: quem protege os dados é o RLS (veja supabase/schema.sql). */
export function createSupabase(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}
