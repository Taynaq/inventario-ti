import { foldTop, type Count } from './dashboard';
import { normalize } from './format';

/** Um registro de quebra de máquina. */
export interface Breakdown {
  id: string;
  /** Dia da quebra, AAAA-MM-DD. */
  day: string;
  machine: string;
  group: string;
  /** Quantidade de peças perdidas. */
  lostParts: number;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export type BreakdownDraft = Omit<Breakdown, 'id' | 'createdAt' | 'updatedAt'>;

export interface BreakdownFilters {
  query: string;
  /** 'all' ou o nome do grupo. */
  group: string;
  /** 'all' ou AAAA-MM. */
  month: string;
}

export const EMPTY_BREAKDOWN_FILTERS: BreakdownFilters = { query: '', group: 'all', month: 'all' };

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const isIsoDay = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Lê um objeto vindo de fora (navegador, banco). Sem id, dia ou máquina, devolve null. */
export function toBreakdown(raw: unknown): Breakdown | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  const day = str(r.day).slice(0, 10);
  const machine = str(r.machine).trim();
  if (!id || !isIsoDay(day) || !machine) return null;
  const parts = Number(r.lostParts);
  const now = Date.now();
  return {
    id,
    day,
    machine,
    group: str(r.group).trim(),
    lostParts: Number.isFinite(parts) && parts >= 0 ? Math.round(parts) : 0,
    notes: str(r.notes),
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : now,
  };
}

export interface BreakdownInput {
  day: string;
  machine: string;
  group: string;
  parts: string;
  notes: string;
}

export type BreakdownRead = { draft: BreakdownDraft } | { error: string; focus: keyof BreakdownInput };

/** Confere o que a pessoa digitou no formulário. */
export function readBreakdown(input: BreakdownInput): BreakdownRead {
  const day = input.day.trim();
  if (!isIsoDay(day)) return { error: 'Informe o dia da quebra.', focus: 'day' };
  const machine = input.machine.trim();
  if (!machine) return { error: 'Informe o nome da máquina.', focus: 'machine' };
  const partsText = input.parts.trim();
  const parts = partsText === '' ? 0 : Number(partsText.replace(',', '.'));
  if (!Number.isFinite(parts) || parts < 0 || !Number.isInteger(parts)) {
    return { error: 'Peças perdidas precisa ser um número inteiro, como 22.', focus: 'parts' };
  }
  return {
    draft: { day, machine, group: input.group.trim(), lostParts: parts, notes: input.notes.trim() },
  };
}

export function createBreakdown(
  draft: BreakdownDraft,
  now: number = Date.now(),
  id: string = crypto.randomUUID(),
): Breakdown {
  return { ...draft, id, createdAt: now, updatedAt: now };
}

export function applyBreakdownDraft(
  prev: Breakdown,
  draft: BreakdownDraft,
  now: number = Date.now(),
): Breakdown {
  return { ...prev, ...draft, updatedAt: now };
}

const searchText = (b: Breakdown): string => normalize([b.machine, b.group, b.notes].join(' '));

/** Aplica busca, grupo e mês. Mais recentes primeiro. */
export function filterBreakdowns(items: readonly Breakdown[], f: BreakdownFilters): Breakdown[] {
  const q = normalize(f.query).trim();
  const group = normalize(f.group);
  return items
    .filter((b) => {
      if (f.group !== 'all' && normalize(b.group) !== group) return false;
      if (f.month !== 'all' && !b.day.startsWith(f.month)) return false;
      return q === '' || searchText(b).includes(q);
    })
    .sort((a, b) => b.day.localeCompare(a.day) || b.createdAt - a.createdAt);
}

/** Meses que têm registros (AAAA-MM), do mais recente para o mais antigo. */
export function monthsOf(items: readonly Breakdown[]): string[] {
  return [...new Set(items.map((b) => b.day.slice(0, 7)))].sort().reverse();
}

const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  const name = MONTHS[Number(m) - 1];
  return name && y ? `${name} de ${y}` : month;
}

/** Grupos que aparecem nos registros, sem repetir por maiúsculas ou acento. */
export function groupsOf(items: readonly Breakdown[]): string[] {
  const seen = new Map<string, string>();
  for (const b of items) {
    const g = b.group.trim();
    if (g && !seen.has(normalize(g))) seen.set(normalize(g), g);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
}

export interface BreakdownSummary {
  records: number;
  lostParts: number;
  /** Peças perdidas por máquina, da que mais perdeu para a que menos perdeu. */
  byMachine: Count[];
  byGroup: Count[];
  /** Peças perdidas por dia, dos dias mais recentes. */
  byDay: Count[];
  /** Quebras (registros) por máquina. */
  breaksByMachine: Count[];
}

function sumBy(
  items: readonly Breakdown[],
  pick: (b: Breakdown) => string,
  empty: string,
  weight: boolean,
): Count[] {
  const groups = new Map<string, Count>();
  for (const b of items) {
    const raw = pick(b).trim();
    const key = normalize(raw);
    const n = weight ? b.lostParts : 1;
    const g = groups.get(key);
    if (g) g.n += n;
    else groups.set(key, { key: raw, label: raw || empty, n });
  }
  return [...groups.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'pt-BR'));
}

export function summarizeBreakdowns(items: readonly Breakdown[], maxBars = 8): BreakdownSummary {
  const byDay = new Map<string, number>();
  for (const b of items) byDay.set(b.day, (byDay.get(b.day) ?? 0) + b.lostParts);
  const days: Count[] = [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 10)
    .map(([day, n]) => ({ key: day, label: day.split('-').reverse().slice(0, 2).join('/'), n }));
  return {
    records: items.length,
    lostParts: items.reduce((sum, b) => sum + b.lostParts, 0),
    byMachine: foldTop(
      sumBy(items, (b) => b.machine, 'Sem máquina', true),
      maxBars,
    ),
    byGroup: foldTop(
      sumBy(items, (b) => b.group, 'Sem grupo', true),
      maxBars,
    ),
    byDay: days,
    breaksByMachine: foldTop(
      sumBy(items, (b) => b.machine, 'Sem máquina', false),
      maxBars,
    ),
  };
}
