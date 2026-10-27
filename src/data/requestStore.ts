import type { SupabaseClient } from '@supabase/supabase-js';
import { toRequest, type AccessRequest } from '../domain/request';
import type { StorageLike } from './localStore';
import { StoreError } from './store';

/** Armazenamento dos pedidos de acesso. Igual ao Store do inventário, mas para outro tipo de dado. */
export interface RequestStore {
  readonly kind: 'local' | 'cloud';
  subscribe(onChange: (items: AccessRequest[]) => void, onError: (e: StoreError) => void): () => void;
  save(item: AccessRequest): Promise<void>;
  remove(id: string): Promise<void>;
}

export const REQUEST_LOCAL_KEY = 'central-gestao:solicitacoes:v1';
export const REQUEST_TABLE = 'solicitacoes';

/** Guarda neste navegador (modo sem Supabase). */
export class LocalRequestStore implements RequestStore {
  readonly kind = 'local' as const;
  private readonly listeners = new Set<(items: AccessRequest[]) => void>();

  constructor(private readonly storage: StorageLike = localStorage) {}

  private read(): AccessRequest[] {
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(REQUEST_LOCAL_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed.map(toRequest).filter((b): b is AccessRequest => b !== null) : [];
    } catch {
      return [];
    }
  }

  private write(items: AccessRequest[]): void {
    try {
      this.storage.setItem(REQUEST_LOCAL_KEY, JSON.stringify(items));
    } catch {
      throw new StoreError('quota', 'Não foi possível gravar no navegador.');
    }
    for (const fn of this.listeners) fn(items);
  }

  subscribe(onChange: (items: AccessRequest[]) => void, _onError?: (e: StoreError) => void): () => void {
    this.listeners.add(onChange);
    onChange(this.read());
    return () => {
      this.listeners.delete(onChange);
    };
  }

  async save(item: AccessRequest): Promise<void> {
    const items = this.read();
    const i = items.findIndex((x) => x.id === item.id);
    if (i >= 0) items[i] = item;
    else items.push(item);
    this.write(items);
  }

  async remove(id: string): Promise<void> {
    this.write(this.read().filter((x) => x.id !== id));
  }
}

type Row = Record<string, unknown>;

export function requestToRow(v: AccessRequest): Row {
  return {
    id: v.id,
    store: v.store,
    sector: v.sector,
    person_name: v.personName,
    access: v.access,
    notes: v.notes,
    status: v.status,
    ti_notes: v.tiNotes,
    requested_by: v.requestedBy,
    done_at: v.doneAt === null ? null : new Date(v.doneAt).toISOString(),
  };
}

export function requestFromRow(row: Row): AccessRequest | null {
  const time = (col: string): number => {
    const t = Date.parse(String(row[col] ?? ''));
    return Number.isNaN(t) ? Date.now() : t;
  };
  const done = Date.parse(String(row.done_at ?? ''));
  return toRequest({
    id: row.id,
    store: row.store,
    sector: row.sector,
    personName: row.person_name,
    access: row.access,
    notes: row.notes,
    status: row.status,
    tiNotes: row.ti_notes,
    requestedBy: row.requested_by,
    doneAt: Number.isNaN(done) ? null : done,
    createdAt: time('created_at'),
    updatedAt: time('updated_at'),
  });
}

function toStoreError(e: unknown): StoreError {
  const err = e as { code?: string; message?: string } | null;
  const msg = err?.message ?? 'Erro desconhecido';
  if (err?.code === '42501' || err?.code === 'PGRST301') return new StoreError('denied', msg);
  // Tabela ainda não criada: o SQL do Supabase não foi rodado.
  if (err?.code === '42P01' || err?.code === 'PGRST205')
    return new StoreError('unknown', 'tabela solicitacoes ausente');
  if (/fetch|network|failed to load/i.test(msg)) return new StoreError('network', msg);
  return new StoreError('unknown', msg);
}

/** Pedidos de acesso compartilhados no Supabase, com atualização em tempo real. */
export class CloudRequestStore implements RequestStore {
  readonly kind = 'cloud' as const;
  private cache = new Map<string, AccessRequest>();
  private readonly listeners = new Set<(items: AccessRequest[]) => void>();
  private readonly errorHandlers = new Set<(e: StoreError) => void>();
  private channel: ReturnType<SupabaseClient['channel']> | null = null;

  constructor(private readonly db: SupabaseClient) {}

  private emit(): void {
    const items = [...this.cache.values()];
    for (const fn of this.listeners) fn(items);
  }

  private async load(): Promise<void> {
    const { data, error } = await this.db.from(REQUEST_TABLE).select('*');
    if (error) {
      const err = toStoreError(error);
      for (const fn of this.errorHandlers) fn(err);
      return;
    }
    this.cache = new Map(
      (data ?? [])
        .map((r) => requestFromRow(r as Row))
        .filter((b): b is AccessRequest => b !== null)
        .map((b) => [b.id, b] as const),
    );
    this.emit();
  }

  private connect(): void {
    this.channel = this.db
      .channel('solicitacoes-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: REQUEST_TABLE }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as Row).id;
          if (typeof id === 'string') this.cache.delete(id);
        } else {
          const item = requestFromRow(payload.new as Row);
          if (item) this.cache.set(item.id, item);
        }
        this.emit();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void this.load();
      });
  }

  subscribe(onChange: (items: AccessRequest[]) => void, onError: (e: StoreError) => void): () => void {
    this.listeners.add(onChange);
    this.errorHandlers.add(onError);
    if (!this.channel) this.connect();
    void this.load();
    return () => {
      this.listeners.delete(onChange);
      this.errorHandlers.delete(onError);
      if (this.listeners.size === 0 && this.channel) {
        void this.db.removeChannel(this.channel);
        this.channel = null;
      }
    };
  }

  async save(item: AccessRequest): Promise<void> {
    // Pedido novo entra como insert; pedido que já existe é atualizado (só a administração pode).
    // Evita o upsert, porque a regra de inserção do banco só aceita pedidos novos da própria conta.
    const row = requestToRow(item);
    const { error } = this.cache.has(item.id)
      ? await this.db.from(REQUEST_TABLE).update(row).eq('id', item.id)
      : await this.db.from(REQUEST_TABLE).insert(row);
    if (error) throw toStoreError(error);
    this.cache.set(item.id, item);
    this.emit();
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from(REQUEST_TABLE).delete().eq('id', id);
    if (error) throw toStoreError(error);
    this.cache.delete(id);
    this.emit();
  }
}
