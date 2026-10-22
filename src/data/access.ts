import type { SupabaseClient } from '@supabase/supabase-js';
import { MODULE_IDS, isModuleId, type ModuleId } from '../modules';

export interface AccessEntry {
  email: string;
  isAdmin: boolean;
  /** Telas que a pessoa pode usar (administradores usam todas). */
  modules: ModuleId[];
}

/** Lê a lista de telas vinda do banco, ignorando nomes desconhecidos. */
export const parseModules = (raw: unknown): ModuleId[] => (Array.isArray(raw) ? raw.filter(isModuleId) : []);

export const ALL_MODULES: readonly ModuleId[] = MODULE_IDS;

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

  /**
   * Telas que a pessoa que está logada pode usar. Se o SQL novo ainda não foi rodado,
   * devolve só o inventário, que era a única tela antes.
   */
  async myModules(): Promise<ModuleId[]> {
    const { data, error } = await this.db.rpc('my_modules');
    if (error) return ['inventario'];
    return parseModules(data);
  }

  async list(): Promise<AccessEntry[]> {
    const { data, error } = await this.db
      .from('allowed_emails')
      .select('email, is_admin, modules')
      .order('email', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      email: String(r.email),
      isAdmin: r.is_admin === true,
      modules: parseModules(r.modules),
    }));
  }

  async add(email: string, isAdmin: boolean, modules: readonly ModuleId[]): Promise<void> {
    const { error } = await this.db
      .from('allowed_emails')
      .insert({ email: normalizeEmail(email), is_admin: isAdmin, modules: [...modules] });
    if (error) throw error;
  }

  async setModules(email: string, modules: readonly ModuleId[]): Promise<void> {
    const { error } = await this.db
      .from('allowed_emails')
      .update({ modules: [...modules] })
      .eq('email', email);
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
