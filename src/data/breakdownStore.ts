import type { SupabaseClient } from '@supabase/supabase-js';
import { toBreakdown, type Breakdown } from '../domain/breakdown';
import type { StorageLike } from './localStore';
import { StoreError } from './store';

/** Armazenamento dos registros de quebra. Igual ao Store do inventário, mas para outro tipo de dado. */
export interface BreakdownStore {
  readonly kind: 'local' | 'cloud';
  subscribe(onChange: (items: Breakdown[]) => void, onError: (e: StoreError) => void): () => void;
  save(item: Breakdown): Promise<void>;
  remove(id: string): Promise<void>;
}

export const BREAKDOWN_LOCAL_KEY = 'central-gestao:quebras:v1';
export const BREAKDOWN_TABLE = 'quebras';

/** Guarda neste navegador (modo sem Supabase). */
export class LocalBreakdownStore implements BreakdownStore {
  readonly kind = 'local' as const;
  private readonly listeners = new Set<(items: Breakdown[]) => void>();

  constructor(private readonly storage: StorageLike = localStorage) {}

  private read(): Breakdown[] {
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(BREAKDOWN_LOCAL_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed.map(toBreakdown).filter((b): b is Breakdown => b !== null) : [];
    } catch {
      return [];
    }
  }

  private write(items: Breakdown[]): void {
    try {
      this.storage.setItem(BREAKDOWN_LOCAL_KEY, JSON.stringify(items));
    } catch {
      throw new StoreError('quota', 'Não foi possível gravar no navegador.');
    }
    for (const fn of this.listeners) fn(items);
  }

  subscribe(onChange: (items: Breakdown[]) => void, _onError?: (e: StoreError) => void): () => void {
    this.listeners.add(onChange);
    onChange(this.read());
    return () => {
      this.listeners.delete(onChange);
    };
  }

  async save(item: Breakdown): Promise<void> {
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

export function breakdownToRow(b: Breakdown): Row {
  return { id: b.id, day: b.day, machine: b.machine, grp: b.group, lost_parts: b.lostParts, notes: b.notes };
}

export function breakdownFromRow(row: Row): Breakdown | null {
  const time = (col: string): number => {
    const t = Date.parse(String(row[col] ?? ''));
    return Number.isNaN(t) ? Date.now() : t;
  };
  return toBreakdown({
    id: row.id,
    day: row.day,
    machine: row.machine,
    group: row.grp,
    lostParts: row.lost_parts,
    notes: row.notes,
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
    return new StoreError('unknown', 'tabela quebras ausente');
  if (/fetch|network|failed to load/i.test(msg)) return new StoreError('network', msg);
  return new StoreError('unknown', msg);
}

/** Registros de quebra compartilhados no Supabase, com atualização em tempo real. */
export class CloudBreakdownStore implements BreakdownStore {
  readonly kind = 'cloud' as const;
  private cache = new Map<string, Breakdown>();
  private readonly listeners = new Set<(items: Breakdown[]) => void>();
  private readonly errorHandlers = new Set<(e: StoreError) => void>();
  private channel: ReturnType<SupabaseClient['channel']> | null = null;

  constructor(private readonly db: SupabaseClient) {}

  private emit(): void {
    const items = [...this.cache.values()];
    for (const fn of this.listeners) fn(items);
  }

  private async load(): Promise<void> {
    const { data, error } = await this.db.from(BREAKDOWN_TABLE).select('*');
    if (error) {
      const err = toStoreError(error);
      for (const fn of this.errorHandlers) fn(err);
      return;
    }
    this.cache = new Map(
      (data ?? [])
        .map((r) => breakdownFromRow(r as Row))
        .filter((b): b is Breakdown => b !== null)
        .map((b) => [b.id, b] as const),
    );
    this.emit();
  }

  private connect(): void {
    this.channel = this.db
      .channel('quebras-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: BREAKDOWN_TABLE }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as Row).id;
          if (typeof id === 'string') this.cache.delete(id);
        } else {
          const item = breakdownFromRow(payload.new as Row);
          if (item) this.cache.set(item.id, item);
        }
        this.emit();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void this.load();
      });
  }

  subscribe(onChange: (items: Breakdown[]) => void, onError: (e: StoreError) => void): () => void {
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

  async save(item: Breakdown): Promise<void> {
    const { error } = await this.db.from(BREAKDOWN_TABLE).upsert(breakdownToRow(item));
    if (error) throw toStoreError(error);
    this.cache.set(item.id, item);
    this.emit();
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from(BREAKDOWN_TABLE).delete().eq('id', id);
    if (error) throw toStoreError(error);
    this.cache.delete(id);
    this.emit();
  }
}
