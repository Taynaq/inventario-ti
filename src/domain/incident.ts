import type { Equipment } from '../types';
import type { Count } from './dashboard';
import { normalize } from './format';

/** Um problema que um equipamento teve. Fica no histórico mesmo depois de resolvido. */
export interface Incident {
  id: string;
  equipmentId: string;
  /** Dia do problema, AAAA-MM-DD. */
  day: string;
  /** Por que aconteceu (ex.: queda de energia). */
  reason: string;
  /** O que foi feito para resolver. */
  solution: string;
  resolved: boolean;
  createdAt: number;
  updatedAt: number;
}

export type IncidentDraft = Omit<Incident, 'id' | 'equipmentId' | 'createdAt' | 'updatedAt'>;

export interface IncidentInput {
  day: string;
  reason: string;
  solution: string;
  resolved: boolean;
}

export type IncidentRead = { draft: IncidentDraft } | { error: string; focus: keyof IncidentInput };

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const isIsoDay = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export function toIncident(raw: unknown): Incident | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  const equipmentId = str(r.equipmentId);
  const day = str(r.day).slice(0, 10);
  const reason = str(r.reason).trim();
  if (!id || !equipmentId || !isIsoDay(day) || !reason) return null;
  const now = Date.now();
  return {
    id,
    equipmentId,
    day,
    reason,
    solution: str(r.solution),
    resolved: r.resolved === true,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : now,
  };
}

/** Confere o que a pessoa digitou no formulário do problema. */
export function readIncident(input: IncidentInput): IncidentRead {
  const day = input.day.trim();
  if (!isIsoDay(day)) return { error: 'Informe o dia do problema.', focus: 'day' };
  const reason = input.reason.trim();
  if (!reason) return { error: 'Informe o motivo do problema.', focus: 'reason' };
  return { draft: { day, reason, solution: input.solution.trim(), resolved: input.resolved } };
}

export function createIncident(
  equipmentId: string,
  draft: IncidentDraft,
  now: number = Date.now(),
  id: string = crypto.randomUUID(),
): Incident {
  return { ...draft, id, equipmentId, createdAt: now, updatedAt: now };
}

export function applyIncidentDraft(prev: Incident, draft: IncidentDraft, now: number = Date.now()): Incident {
  return { ...prev, ...draft, updatedAt: now };
}

/** Problemas de um equipamento, do mais recente para o mais antigo. */
export function incidentsOf(items: readonly Incident[], equipmentId: string): Incident[] {
  return items
    .filter((i) => i.equipmentId === equipmentId)
    .sort((a, b) => b.day.localeCompare(a.day) || b.createdAt - a.createdAt);
}

export interface IncidentCount {
  total: number;
  open: number;
}

/** Quantos problemas cada equipamento já teve, e quantos ainda estão em aberto. */
export function countByEquipment(items: readonly Incident[]): Map<string, IncidentCount> {
  const out = new Map<string, IncidentCount>();
  for (const i of items) {
    const c = out.get(i.equipmentId) ?? { total: 0, open: 0 };
    c.total += 1;
    if (!i.resolved) c.open += 1;
    out.set(i.equipmentId, c);
  }
  return out;
}

export const problemsText = (n: number): string => `${n} ${n === 1 ? 'problema' : 'problemas'}`;

/** Motivos já usados, para sugerir ao digitar (mais frequentes primeiro). */
export function reasonSuggestions(items: readonly Incident[]): string[] {
  const seen = new Map<string, { label: string; n: number }>();
  for (const i of items) {
    const key = normalize(i.reason);
    const cur = seen.get(key);
    if (cur) cur.n += 1;
    else seen.set(key, { label: i.reason, n: 1 });
  }
  return [...seen.values()]
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'pt-BR'))
    .map((x) => x.label);
}

/** Equipamentos com mais problemas (contando também os já resolvidos). */
export function topProblemEquipment(
  incidents: readonly Incident[],
  equipment: readonly Equipment[],
  max = 6,
): Count[] {
  const counts = countByEquipment(incidents);
  return equipment
    .map((e) => ({ key: e.name, label: e.name, n: counts.get(e.id)?.total ?? 0 }))
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'pt-BR'))
    .slice(0, max);
}
