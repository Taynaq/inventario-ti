import type { SupabaseClient } from '@supabase/supabase-js';
import { toIncident, type Incident } from '../domain/incident';
import type { StorageLike } from './localStore';
import { StoreError } from './store';

/** Armazenamento dos problemas dos equipamentos. Igual ao Store do inventário, mas para outro tipo de dado. */
export interface IncidentStore {
  readonly kind: 'local' | 'cloud';
  subscribe(onChange: (items: Incident[]) => void, onError: (e: StoreError) => void): () => void;
  save(item: Incident): Promise<void>;
  remove(id: string): Promise<void>;
}

export const INCIDENT_LOCAL_KEY = 'inventario-ti:ocorrencias:v1';
export const INCIDENT_TABLE = 'ocorrencias';

/** Guarda neste navegador (modo sem Supabase). */
export class LocalIncidentStore implements IncidentStore {
  readonly kind = 'local' as const;
  private readonly listeners = new Set<(items: Incident[]) => void>();

  constructor(private readonly storage: StorageLike = localStorage) {}

  private read(): Incident[] {
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(INCIDENT_LOCAL_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed.map(toIncident).filter((b): b is Incident => b !== null) : [];
    } catch {
      return [];
    }
  }

  private write(items: Incident[]): void {
    try {
      this.storage.setItem(INCIDENT_LOCAL_KEY, JSON.stringify(items));
    } catch {
      throw new StoreError('quota', 'Não foi possível gravar no navegador.');
    }
    for (const fn of this.listeners) fn(items);
  }

  subscribe(onChange: (items: Incident[]) => void, _onError?: (e: StoreError) => void): () => void {
    this.listeners.add(onChange);
    onChange(this.read());
    return () => {
      this.listeners.delete(onChange);
    };
  }

  async save(item: Incident): Promise<void> {
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

export function incidentToRow(v: Incident): Row {
  return {
    id: v.id,
    equipment_id: v.equipmentId,
    day: v.day,
    reason: v.reason,
    solution: v.solution,
    resolved: v.resolved,
  };
}

export function incidentFromRow(row: Row): Incident | null {
  const time = (col: string): number => {
    const t = Date.parse(String(row[col] ?? ''));
    return Number.isNaN(t) ? Date.now() : t;
  };
  return toIncident({
    id: row.id,
    equipmentId: row.equipment_id,
    day: row.day,
    reason: row.reason,
    solution: row.solution,
    resolved: row.resolved,
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
    return new StoreError('unknown', 'tabela ocorrencias ausente');
  if (/fetch|network|failed to load/i.test(msg)) return new StoreError('network', msg);
  return new StoreError('unknown', msg);
}

/** Problemas dos equipamentos compartilhados no Supabase, com atualização em tempo real. */
export class CloudIncidentStore implements IncidentStore {
  readonly kind = 'cloud' as const;
  private cache = new Map<string, Incident>();
  private readonly listeners = new Set<(items: Incident[]) => void>();
  private readonly errorHandlers = new Set<(e: StoreError) => void>();
  private channel: ReturnType<SupabaseClient['channel']> | null = null;

  constructor(private readonly db: SupabaseClient) {}

  private emit(): void {
    const items = [...this.cache.values()];
    for (const fn of this.listeners) fn(items);
  }

  private async load(): Promise<void> {
    const { data, error } = await this.db.from(INCIDENT_TABLE).select('*');
    if (error) {
      const err = toStoreError(error);
      for (const fn of this.errorHandlers) fn(err);
      return;
    }
    this.cache = new Map(
      (data ?? [])
        .map((r) => incidentFromRow(r as Row))
        .filter((b): b is Incident => b !== null)
        .map((b) => [b.id, b] as const),
    );
    this.emit();
  }

  private connect(): void {
    this.channel = this.db
      .channel('ocorrencias-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: INCIDENT_TABLE }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as Row).id;
          if (typeof id === 'string') this.cache.delete(id);
        } else {
          const item = incidentFromRow(payload.new as Row);
          if (item) this.cache.set(item.id, item);
        }
        this.emit();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void this.load();
      });
  }

  subscribe(onChange: (items: Incident[]) => void, onError: (e: StoreError) => void): () => void {
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

  async save(item: Incident): Promise<void> {
    const { error } = await this.db.from(INCIDENT_TABLE).upsert(incidentToRow(item));
    if (error) throw toStoreError(error);
    this.cache.set(item.id, item);
    this.emit();
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from(INCIDENT_TABLE).delete().eq('id', id);
    if (error) throw toStoreError(error);
    this.cache.delete(id);
    this.emit();
  }
}
