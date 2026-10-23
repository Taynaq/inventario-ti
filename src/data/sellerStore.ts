import type { SupabaseClient } from '@supabase/supabase-js';
import { toSeller, type SellerRequest } from '../domain/seller';
import type { StorageLike } from './localStore';
import { StoreError } from './store';

/** Armazenamento dos pedidos de cadastro de vendedores. Igual ao Store do inventário, mas para outro tipo de dado. */
export interface SellerStore {
  readonly kind: 'local' | 'cloud';
  subscribe(onChange: (items: SellerRequest[]) => void, onError: (e: StoreError) => void): () => void;
  save(item: SellerRequest): Promise<void>;
  remove(id: string): Promise<void>;
}

export const SELLER_LOCAL_KEY = 'central-gestao:vendedores:v1';
export const SELLER_TABLE = 'vendedores';

/** Guarda neste navegador (modo sem Supabase). */
export class LocalSellerStore implements SellerStore {
  readonly kind = 'local' as const;
  private readonly listeners = new Set<(items: SellerRequest[]) => void>();

  constructor(private readonly storage: StorageLike = localStorage) {}

  private read(): SellerRequest[] {
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(SELLER_LOCAL_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed.map(toSeller).filter((b): b is SellerRequest => b !== null) : [];
    } catch {
      return [];
    }
  }

  private write(items: SellerRequest[]): void {
    try {
      this.storage.setItem(SELLER_LOCAL_KEY, JSON.stringify(items));
    } catch {
      throw new StoreError('quota', 'Não foi possível gravar no navegador.');
    }
    for (const fn of this.listeners) fn(items);
  }

  subscribe(onChange: (items: SellerRequest[]) => void, _onError?: (e: StoreError) => void): () => void {
    this.listeners.add(onChange);
    onChange(this.read());
    return () => {
      this.listeners.delete(onChange);
    };
  }

  async save(item: SellerRequest): Promise<void> {
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

export function sellerToRow(v: SellerRequest): Row {
  return {
    id: v.id,
    name: v.name,
    seller_code: v.sellerCode,
    person_code: v.personCode,
    company: v.company,
    aux_code: v.auxCode,
    seller_type: v.sellerType,
    inactive: v.inactive,
    comm_table: v.commTable,
    comm_start: v.commStart || null,
    comm_end: v.commEnd || null,
    status: v.status,
    notes: v.notes,
    requested_by: v.requestedBy,
  };
}

export function sellerFromRow(row: Row): SellerRequest | null {
  const time = (col: string): number => {
    const t = Date.parse(String(row[col] ?? ''));
    return Number.isNaN(t) ? Date.now() : t;
  };
  return toSeller({
    id: row.id,
    name: row.name,
    sellerCode: row.seller_code,
    personCode: row.person_code,
    company: row.company,
    auxCode: row.aux_code,
    sellerType: row.seller_type,
    inactive: row.inactive,
    commTable: row.comm_table,
    commStart: row.comm_start,
    commEnd: row.comm_end,
    status: row.status,
    notes: row.notes,
    requestedBy: row.requested_by,
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
    return new StoreError('unknown', 'tabela vendedores ausente');
  if (/fetch|network|failed to load/i.test(msg)) return new StoreError('network', msg);
  return new StoreError('unknown', msg);
}

/** Pedidos de cadastro de vendedores compartilhados no Supabase, com atualização em tempo real. */
export class CloudSellerStore implements SellerStore {
  readonly kind = 'cloud' as const;
  private cache = new Map<string, SellerRequest>();
  private readonly listeners = new Set<(items: SellerRequest[]) => void>();
  private readonly errorHandlers = new Set<(e: StoreError) => void>();
  private channel: ReturnType<SupabaseClient['channel']> | null = null;

  constructor(private readonly db: SupabaseClient) {}

  private emit(): void {
    const items = [...this.cache.values()];
    for (const fn of this.listeners) fn(items);
  }

  private async load(): Promise<void> {
    const { data, error } = await this.db.from(SELLER_TABLE).select('*');
    if (error) {
      const err = toStoreError(error);
      for (const fn of this.errorHandlers) fn(err);
      return;
    }
    this.cache = new Map(
      (data ?? [])
        .map((r) => sellerFromRow(r as Row))
        .filter((b): b is SellerRequest => b !== null)
        .map((b) => [b.id, b] as const),
    );
    this.emit();
  }

  private connect(): void {
    this.channel = this.db
      .channel('vendedores-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: SELLER_TABLE }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as Row).id;
          if (typeof id === 'string') this.cache.delete(id);
        } else {
          const item = sellerFromRow(payload.new as Row);
          if (item) this.cache.set(item.id, item);
        }
        this.emit();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void this.load();
      });
  }

  subscribe(onChange: (items: SellerRequest[]) => void, onError: (e: StoreError) => void): () => void {
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

  async save(item: SellerRequest): Promise<void> {
    const { error } = await this.db.from(SELLER_TABLE).upsert(sellerToRow(item));
    if (error) throw toStoreError(error);
    this.cache.set(item.id, item);
    this.emit();
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from(SELLER_TABLE).delete().eq('id', id);
    if (error) throw toStoreError(error);
    this.cache.delete(id);
    this.emit();
  }
}
