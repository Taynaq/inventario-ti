import type { SupabaseClient } from '@supabase/supabase-js';

export interface AccessEntry {
  email: string;
  isAdmin: boolean;
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

/** Traduz erros do banco para uma frase que quem administra entende. */
export function accessErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  if (err?.code === '23505') return 'Esse e-mail já está na lista.';
  if (err?.code === '42501') return 'Você não tem permissão para gerenciar acessos.';
  if (/fetch|network|failed to load/i.test(err?.message ?? '')) return 'Sem conexão. Tente de novo.';
  return err?.message ?? 'Não foi possível concluir.';
}

/** Lista de e-mails liberados no modo compartilhado (tabela allowed_emails). */
export class AccessApi {
  constructor(
    private readonly db: SupabaseClient,
    /** E-mail de quem está usando o app. */
    readonly me: string,
  ) {}

  /** Só administradores veem a aba Acessos. Se o SQL de administradores ainda não foi rodado, devolve false. */
  async isAdmin(): Promise<boolean> {
    const { data, error } = await this.db.rpc('is_admin');
    return !error && data === true;
  }

  async list(): Promise<AccessEntry[]> {
    const { data, error } = await this.db
      .from('allowed_emails')
      .select('email, is_admin')
      .order('email', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r) => ({ email: String(r.email), isAdmin: r.is_admin === true }));
  }

  async add(email: string, isAdmin: boolean): Promise<void> {
    const { error } = await this.db
      .from('allowed_emails')
      .insert({ email: normalizeEmail(email), is_admin: isAdmin });
    if (error) throw error;
  }

  async setAdmin(email: string, isAdmin: boolean): Promise<void> {
    const { error } = await this.db.from('allowed_emails').update({ is_admin: isAdmin }).eq('email', email);
    if (error) throw error;
  }

  async remove(email: string): Promise<void> {
    const { error } = await this.db.from('allowed_emails').delete().eq('email', email);
    if (error) throw error;
  }
}
