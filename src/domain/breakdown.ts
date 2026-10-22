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

export type PeriodId = 'all' | 'today' | '7d' | '30d' | 'month' | 'lastmonth' | 'custom';

export const PERIODS: { id: PeriodId; label: string }[] = [
  { id: 'all', label: 'Tudo' },
  { id: 'today', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: 'month', label: 'Este mês' },
  { id: 'lastmonth', label: 'Mês passado' },
  { id: 'custom', label: 'Escolher datas' },
];

export interface BreakdownFilters {
  query: string;
  /** 'all' ou o nome do grupo. */
  group: string;
  period: PeriodId;
  /** Datas AAAA-MM-DD do período "Escolher datas" (vazio = sem limite). */
  from: string;
  to: string;
}

export const EMPTY_BREAKDOWN_FILTERS: BreakdownFilters = {
  query: '',
  group: 'all',
  period: 'all',
  from: '',
  to: '',
};

export interface DayRange {
  /** AAAA-MM-DD, ou vazio para "sem início". */
  from: string;
  /** AAAA-MM-DD, ou vazio para "sem fim". */
  to: string;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');
const isoOf = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Soma dias a uma data AAAA-MM-DD. */
export function addDays(day: string, n: number): string {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/** Transforma o período escolhido em datas de início e fim (inclusive). */
export function periodRange(
  f: Pick<BreakdownFilters, 'period' | 'from' | 'to'>,
  today: Date = new Date(),
): DayRange {
  const now = isoOf(today);
  switch (f.period) {
    case 'today':
      return { from: now, to: now };
    case '7d':
      return { from: addDays(now, -6), to: now };
    case '30d':
      return { from: addDays(now, -29), to: now };
    case 'month': {
      const first = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-01`;
      return { from: first, to: isoOf(new Date(today.getFullYear(), today.getMonth() + 1, 0)) };
    }
    case 'lastmonth': {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return { from: isoOf(first), to: isoOf(new Date(today.getFullYear(), today.getMonth(), 0)) };
    }
    case 'custom':
      return { from: f.from, to: f.to };
    default:
      return { from: '', to: '' };
  }
}

/** Texto do período para títulos, como "19/10 a 25/10". */
export function rangeLabel(r: DayRange): string {
  const br = (d: string): string => d.split('-').reverse().join('/');
  if (!r.from && !r.to) return 'Todo o período';
  if (r.from && r.from === r.to) return br(r.from);
  if (r.from && r.to) return `${br(r.from)} a ${br(r.to)}`;
  return r.from ? `A partir de ${br(r.from)}` : `Até ${br(r.to)}`;
}

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

/** Aplica busca, grupo e período. Mais recentes primeiro. */
export function filterBreakdowns(
  items: readonly Breakdown[],
  f: BreakdownFilters,
  today: Date = new Date(),
): Breakdown[] {
  const q = normalize(f.query).trim();
  const group = normalize(f.group);
  const range = periodRange(f, today);
  return items
    .filter((b) => {
      if (f.group !== 'all' && normalize(b.group) !== group) return false;
      if (range.from && b.day < range.from) return false;
      if (range.to && b.day > range.to) return false;
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

export interface DaySummary {
  day: string;
  /** Quantidade de quebras (registros) no dia. */
  breaks: number;
  /** Máquinas diferentes que quebraram no dia. */
  machines: string[];
  lostParts: number;
}

/** Um resumo por dia, do mais recente para o mais antigo. */
export function summarizeDays(items: readonly Breakdown[]): DaySummary[] {
  const byDay = new Map<string, { breaks: number; machines: Map<string, string>; parts: number }>();
  for (const b of items) {
    const d = byDay.get(b.day) ?? { breaks: 0, machines: new Map<string, string>(), parts: 0 };
    d.breaks += 1;
    d.parts += b.lostParts;
    const key = normalize(b.machine);
    if (!d.machines.has(key)) d.machines.set(key, b.machine);
    byDay.set(b.day, d);
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, d]) => ({
      day,
      breaks: d.breaks,
      machines: [...d.machines.values()].sort((a, b) => a.localeCompare(b, 'pt-BR')),
      lostParts: d.parts,
    }));
}

export interface PeriodKpis {
  breaks: number;
  machines: number;
  lostParts: number;
  daysWithBreaks: number;
}

export function periodKpis(items: readonly Breakdown[]): PeriodKpis {
  const machines = new Set(items.map((b) => normalize(b.machine)));
  const days = new Set(items.map((b) => b.day));
  return {
    breaks: items.length,
    machines: machines.size,
    lostParts: items.reduce((sum, b) => sum + b.lostParts, 0),
    daysWithBreaks: days.size,
  };
}

/** Dias que o gráfico mostra no máximo. */
export const MAX_CHART_DAYS = 31;

/**
 * Série diária para o gráfico, do dia mais antigo ao mais recente. Quando o período cabe em
 * 31 dias, os dias sem quebra aparecem com zero. Senão, mostra só os 31 dias mais recentes com quebra.
 */
export function dailySeries(
  days: readonly DaySummary[],
  range: DayRange,
): { points: DaySummary[]; truncated: boolean } {
  if (days.length === 0) return { points: [], truncated: false };
  const oldest = days[days.length - 1]?.day ?? '';
  const newest = days[0]?.day ?? '';
  const from = range.from || oldest;
  const to = range.to || newest;
  const span = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  if (span >= 1 && span <= MAX_CHART_DAYS) {
    const byDay = new Map(days.map((d) => [d.day, d] as const));
    const points: DaySummary[] = [];
    for (let i = 0; i < span; i++) {
      const day = addDays(from, i);
      points.push(byDay.get(day) ?? { day, breaks: 0, machines: [], lostParts: 0 });
    }
    return { points, truncated: false };
  }
  const recent = days.slice(0, MAX_CHART_DAYS).reverse();
  return { points: recent, truncated: days.length > MAX_CHART_DAYS };
}
