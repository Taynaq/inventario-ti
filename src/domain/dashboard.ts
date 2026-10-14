import type { Equipment, StatusId } from '../types';
import { CATEGORY_LABELS, STATUSES } from './catalog';
import { normalize } from './format';
import { daysUntil, warrantyAlert } from './warranty';

export interface Count {
  /** Identificador para filtrar a lista. Vazio quando o item não filtra nada. */
  key: string;
  label: string;
  n: number;
}

export interface WarrantyItem {
  item: Equipment;
  /** Dias até o fim da garantia (negativo se já venceu). */
  days: number;
}

export interface Dashboard {
  total: number;
  /** Equipamentos que não foram baixados. */
  active: number;
  inMaintenance: number;
  assetValue: number;
  /** Quantos equipamentos ativos não têm valor informado. */
  withoutValue: number;
  byStatus: Count[];
  byCategory: Count[];
  byLocation: Count[];
  byOwner: Count[];
  age: Count[];
  /** Garantias vencidas ou perto de vencer, da mais atrasada para a mais distante. */
  warranty: WarrantyItem[];
  warrantyExpired: number;
}

/** Mostra os maiores e junta o resto em "Outros". */
export function foldTop(counts: Count[], max = 6): Count[] {
  if (counts.length <= max) return counts;
  const head = counts.slice(0, max - 1);
  const rest = counts.slice(max - 1);
  return [...head, { key: '', label: `Outros (${rest.length})`, n: rest.reduce((sum, c) => sum + c.n, 0) }];
}

/** Agrupa ignorando maiúsculas e acentos. Vazio vira `emptyLabel` e não filtra a lista. */
function groupText(items: readonly Equipment[], pick: (e: Equipment) => string, emptyLabel: string): Count[] {
  const groups = new Map<string, Count>();
  for (const it of items) {
    const raw = pick(it).trim();
    const key = normalize(raw);
    const g = groups.get(key);
    if (g) g.n++;
    else groups.set(key, { key: raw ? raw : '', label: raw || emptyLabel, n: 1 });
  }
  return [...groups.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'pt-BR'));
}

const AGE_BUCKETS = [
  { id: 'lt1', label: 'Menos de 1 ano' },
  { id: '1to3', label: '1 a 3 anos' },
  { id: '3to5', label: '3 a 5 anos' },
  { id: 'gte5', label: '5 anos ou mais' },
  { id: 'none', label: 'Sem data de compra' },
] as const;

function ageBucket(buyDate: string, today: Date): (typeof AGE_BUCKETS)[number]['id'] {
  const d = buyDate ? daysUntil(buyDate, today) : null;
  if (d === null) return 'none';
  const years = Math.max(0, -d) / 365.25;
  if (years < 1) return 'lt1';
  if (years < 3) return '1to3';
  if (years < 5) return '3to5';
  return 'gte5';
}

export function buildDashboard(items: readonly Equipment[], today: Date = new Date()): Dashboard {
  const active = items.filter((e) => e.status !== 'baixado');

  const statusN: Record<StatusId, number> = { uso: 0, estoque: 0, manutencao: 0, baixado: 0 };
  for (const it of items) statusN[it.status]++;

  const category = new Map<string, number>();
  for (const it of active) category.set(it.category, (category.get(it.category) ?? 0) + 1);

  const ageN = new Map<string, number>();
  for (const it of active) {
    const b = ageBucket(it.buyDate, today);
    ageN.set(b, (ageN.get(b) ?? 0) + 1);
  }

  const warranty: WarrantyItem[] = [];
  for (const it of items) {
    if (!warrantyAlert(it, today)) continue;
    const days = daysUntil(it.warrantyEnd, today);
    if (days !== null) warranty.push({ item: it, days });
  }
  warranty.sort((a, b) => a.days - b.days);

  return {
    total: items.length,
    active: active.length,
    inMaintenance: statusN.manutencao,
    assetValue: active.reduce((sum, e) => sum + (e.value ?? 0), 0),
    withoutValue: active.filter((e) => e.value === null).length,
    byStatus: STATUSES.map((s) => ({ key: s.id, label: s.label, n: statusN[s.id] })),
    byCategory: [...category.entries()]
      .map(([key, n]) => ({ key, label: CATEGORY_LABELS[key as keyof typeof CATEGORY_LABELS] ?? key, n }))
      .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'pt-BR')),
    byLocation: foldTop(groupText(active, (e) => e.location, 'Sem local')),
    byOwner: foldTop(groupText(active, (e) => e.owner, 'Sem responsável')),
    age: AGE_BUCKETS.map((b) => ({ key: '', label: b.label, n: ageN.get(b.id) ?? 0 })),
    warranty,
    warrantyExpired: warranty.filter((w) => w.days < 0).length,
  };
}
