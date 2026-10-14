/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL do projeto Supabase. Sem ela o app roda em modo local. */
  readonly VITE_SUPABASE_URL?: string;
  /** Chave pública (anon/publishable) do projeto Supabase. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
