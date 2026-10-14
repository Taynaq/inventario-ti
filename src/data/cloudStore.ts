import type { SupabaseClient } from '@supabase/supabase-js';
import type { Equipment } from '../types';
import { toEquipment } from '../domain/equipment';
import { StoreError, type EquipmentPatch, type Store } from './store';

export const TABLE = 'equipamentos';

/** Campo do app -> coluna do banco. */
const COLUMN: Record<Exclude<keyof Equipment, 'id' | 'createdAt' | 'updatedAt'>, string> = {
  name: 'name',
  category: 'category',
  status: 'status',
  owner: 'owner',
  brand: 'brand',
  serial: 'serial',
  tag: 'tag',
  location: 'location',
  buyDate: 'buy_date',
  warrantyEnd: 'warranty_end',
  value: 'value',
  notes: 'notes',
  example: 'is_example',
};
const DATE_FIELDS = new Set(['buyDate', 'warrantyEnd']);

type Row = Record<string, unknown>;

/** Converte campos do app em colunas. Datas vazias viram null. */
export function toRow(fields: EquipmentPatch & { id?: string }): Row {
  const row: Row = {};
  if (fields.id !== undefined) row.id = fields.id;
  for (const [key, col] of Object.entries(COLUMN)) {
    const value = (fields as Row)[key];
    if (value === undefined) continue;
    row[col] = DATE_FIELDS.has(key) && value === '' ? null : value;
  }
  return row;
}

/** Converte uma linha do banco em Equipment. */
export function fromRow(row: Row): Equipment | null {
  const field = (col: string): unknown => row[col] ?? undefined;
  const time = (col: string): number => {
    const t = Date.parse(String(row[col] ?? ''));
    return Number.isNaN(t) ? Date.now() : t;
  };
  return toEquipment({
    id: row.id,
    name: row.name,
    category: row.category,
    status: row.status,
    owner: field('owner'),
    brand: field('brand'),
    serial: field('serial'),
    tag: field('tag'),
    location: field('location'),
    buyDate: field('buy_date'),
    warrantyEnd: field('warranty_end'),
    value: row.value === null || row.value === undefined ? null : Number(row.value),
    notes: field('notes'),
    example: row.is_example === true,
    createdAt: time('created_at'),
    updatedAt: time('updated_at'),
  });
}

function toStoreError(e: unknown): StoreError {
  const err = e as { code?: string; message?: string; name?: string } | null;
  const msg = err?.message ?? 'Erro desconhecido';
  if (err?.code === '42501' || err?.code === 'PGRST301') return new StoreError('denied', msg);
  if (err?.code === '53100') return new StoreError('quota', msg);
  if (/fetch|network|failed to load/i.test(msg)) return new StoreError('network', msg);
  return new StoreError('unknown', msg);
}

/**
 * Dados compartilhados no Supabase (Postgres). Mudanças feitas por outras
 * pessoas chegam em tempo real. As regras de acesso ficam no banco (RLS).
 */
export class CloudStore implements Store {
  readonly kind = 'cloud' as const;
  private cache = new Map<string, Equipment>();
  private readonly listeners = new Set<(items: Equipment[]) => void>();
  private readonly errorHandlers = new Set<(e: StoreError) => void>();
  private channel: ReturnType<SupabaseClient['channel']> | null = null;

  constructor(private readonly db: SupabaseClient) {}

  private emit(): void {
    const items = [...this.cache.values()];
    for (const fn of this.listeners) fn(items);
  }

  private fail(e: unknown): void {
    const err = toStoreError(e);
    for (const fn of this.errorHandlers) fn(err);
  }

  private async load(): Promise<void> {
    const { data, error } = await this.db.from(TABLE).select('*');
    if (error) return this.fail(error);
    this.cache = new Map(
      (data ?? [])
        .map((r) => fromRow(r as Row))
        .filter((e): e is Equipment => e !== null)
        .map((e) => [e.id, e] as const),
    );
    this.emit();
  }

  private connect(): void {
    this.channel = this.db
      .channel('equipamentos-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as Row).id;
          if (typeof id === 'string') this.cache.delete(id);
        } else {
          const item = fromRow(payload.new as Row);
          if (item) this.cache.set(item.id, item);
        }
        this.emit();
      })
      // Ao (re)conectar, recarrega para não perder mudanças feitas enquanto estava offline.
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void this.load();
      });
  }

  subscribe(onChange: (items: Equipment[]) => void, onError: (e: StoreError) => void): () => void {
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

  async save(item: Equipment): Promise<void> {
    const { error } = await this.db.from(TABLE).upsert(toRow(item));
    if (error) throw toStoreError(error);
    this.cache.set(item.id, item);
    this.emit();
  }

  async saveMany(items: readonly Equipment[]): Promise<void> {
    // Em blocos, para não estourar o tamanho de uma requisição.
    for (let i = 0; i < items.length; i += 200) {
      const chunk = items.slice(i, i + 200);
      const { error } = await this.db.from(TABLE).upsert(chunk.map((it) => toRow(it)));
      if (error) throw toStoreError(error);
      for (const it of chunk) this.cache.set(it.id, it);
    }
    this.emit();
  }

  async patch(id: string, fields: EquipmentPatch): Promise<void> {
    const { error } = await this.db.from(TABLE).update(toRow(fields)).eq('id', id);
    if (error) throw toStoreError(error);
    const current = this.cache.get(id);
    if (current) {
      this.cache.set(id, { ...current, ...fields });
      this.emit();
    }
  }

  async remove(id: string): Promise<void> {
    await this.removeMany([id]);
  }

  async removeMany(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await this.db
      .from(TABLE)
      .delete()
      .in('id', [...ids]);
    if (error) throw toStoreError(error);
    for (const id of ids) this.cache.delete(id);
    this.emit();
  }
}
