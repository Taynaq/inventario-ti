import type { Equipment, Filters, StatusId } from '../types';
import { CATEGORY_LABELS } from './catalog';
import { normalize } from './format';
import { warrantyAlert } from './warranty';

export const EMPTY_FILTERS: Filters = { query: '', status: 'all', category: 'all' };

function searchText(it: Equipment): string {
  return normalize(
    [
      it.name,
      it.brand,
      it.serial,
      it.tag,
      it.owner,
      it.location,
      CATEGORY_LABELS[it.category],
      it.notes,
    ].join(' '),
  );
}

/** Aplica busca, status e categoria e ordena por nome. */
export function filterEquipment(
  items: readonly Equipment[],
  filters: Filters,
  today: Date = new Date(),
): Equipment[] {
  const q = normalize(filters.query).trim();
  return items
    .filter((it) => {
      if (filters.category !== 'all' && it.category !== filters.category) return false;
      if (filters.status === 'garantia') {
        if (!warrantyAlert(it, today)) return false;
      } else if (filters.status !== 'all' && it.status !== filters.status) {
        return false;
      }
      return q === '' || searchText(it).includes(q);
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
}

export interface Summary {
  total: number;
  byStatus: Record<StatusId, number>;
  /** Equipamentos com garantia vencida ou perto de vencer. */
  warranty: number;
  /** Soma dos valores dos equipamentos que não foram baixados. */
  assetValue: number;
}

export function summarize(items: readonly Equipment[], today: Date = new Date()): Summary {
  const s: Summary = {
    total: items.length,
    byStatus: { uso: 0, estoque: 0, manutencao: 0, baixado: 0 },
    warranty: 0,
    assetValue: 0,
  };
  for (const it of items) {
    s.byStatus[it.status]++;
    if (it.status !== 'baixado' && it.value !== null) s.assetValue += it.value;
    if (warrantyAlert(it, today)) s.warranty++;
  }
  return s;
}
