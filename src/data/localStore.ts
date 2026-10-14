import type { Equipment } from '../types';
import { toEquipment } from '../domain/equipment';
import { StoreError, type EquipmentPatch, type Store } from './store';

export const LOCAL_KEY = 'inventario-ti:v1';

/** O pedaço de `Storage` que o LocalStore usa (facilita testar com um objeto falso). */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** Guarda tudo neste navegador. Usado quando o Supabase não está configurado. */
export class LocalStore implements Store {
  readonly kind = 'local' as const;
  private readonly listeners = new Set<(items: Equipment[]) => void>();

  constructor(private readonly storage: StorageLike = localStorage) {}

  private read(): Equipment[] {
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(LOCAL_KEY) ?? '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.map(toEquipment).filter((e): e is Equipment => e !== null);
    } catch {
      return [];
    }
  }

  private write(items: Equipment[]): void {
    try {
      this.storage.setItem(LOCAL_KEY, JSON.stringify(items));
    } catch {
      throw new StoreError('quota', 'Não foi possível gravar no navegador.');
    }
    this.emit(items);
  }

  private emit(items: Equipment[]): void {
    for (const fn of this.listeners) fn(items);
  }

  /** O armazenamento local não tem erro de rede; `_onError` existe só para seguir o contrato de Store. */
  subscribe(onChange: (items: Equipment[]) => void, _onError?: (e: StoreError) => void): () => void {
    this.listeners.add(onChange);
    onChange(this.read());
    // Outra aba do mesmo navegador alterou os dados.
    const onStorage = (e: StorageEvent): void => {
      if (e.key === LOCAL_KEY) onChange(this.read());
    };
    if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
    return () => {
      this.listeners.delete(onChange);
      if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
    };
  }

  async save(item: Equipment): Promise<void> {
    const items = this.read();
    const i = items.findIndex((x) => x.id === item.id);
    if (i >= 0) items[i] = item;
    else items.push(item);
    this.write(items);
  }

  async saveMany(incoming: readonly Equipment[]): Promise<void> {
    const items = this.read();
    for (const item of incoming) {
      const i = items.findIndex((x) => x.id === item.id);
      if (i >= 0) items[i] = item;
      else items.push(item);
    }
    this.write(items);
  }

  async patch(id: string, fields: EquipmentPatch): Promise<void> {
    const items = this.read();
    const i = items.findIndex((x) => x.id === id);
    const current = items[i];
    if (!current) return;
    items[i] = { ...current, ...fields };
    this.write(items);
  }

  async remove(id: string): Promise<void> {
    this.write(this.read().filter((x) => x.id !== id));
  }

  async removeMany(ids: readonly string[]): Promise<void> {
    const drop = new Set(ids);
    this.write(this.read().filter((x) => !drop.has(x.id)));
  }
}
