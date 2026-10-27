import { normalize } from './format';

/** Lojas que podem pedir acesso. Para trocar os nomes, edite esta lista. */
export const STORES: readonly string[] = Array.from(
  { length: 10 },
  (_, i) => `Loja ${String(i + 1).padStart(2, '0')}`,
);

/** Setores sugeridos. A pessoa também pode digitar outro. */
export const SECTORS: readonly string[] = [
  'Vendas',
  'Caixa',
  'Estoque',
  'Gerência',
  'Financeiro',
  'RH',
  'Administrativo',
  'Marketing',
  'TI',
];

/** Acessos sugeridos. A pessoa também pode digitar outro. */
export const ACCESS_SUGGESTIONS: readonly string[] = [
  'TOTVS Moda',
  'E-mail',
  'Rede / computador',
  'Central de Gestão',
  'Outro',
];

export type RequestStatus = 'pendente' | 'feito' | 'cancelado';

export const REQUEST_STATUSES: { id: RequestStatus; label: string }[] = [
  { id: 'pendente', label: 'Pendente' },
  { id: 'feito', label: 'Feito' },
  { id: 'cancelado', label: 'Cancelado' },
];

/** Um pedido de criação de acesso para uma pessoa. */
export interface AccessRequest {
  id: string;
  store: string;
  sector: string;
  personName: string;
  /** Qual acesso é pedido (TOTVS Moda, e-mail…). */
  access: string;
  /** Observações de quem pediu. */
  notes: string;
  status: RequestStatus;
  /** Observações da TI (por exemplo, o usuário criado). */
  tiNotes: string;
  /** E-mail de quem fez o pedido (vazio no modo local). */
  requestedBy: string;
  /** Quando foi marcado como feito (milissegundos), ou null. */
  doneAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface RequestInput {
  store: string;
  sector: string;
  personName: string;
  access: string;
  notes: string;
}

export type RequestDraft = RequestInput;

export type RequestRead = { draft: RequestDraft } | { error: string; focus: keyof RequestInput };

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const isStatus = (v: unknown): v is RequestStatus => REQUEST_STATUSES.some((s) => s.id === v);

export const requestStatusLabel = (s: RequestStatus): string =>
  REQUEST_STATUSES.find((x) => x.id === s)?.label ?? s;

export function toRequest(raw: unknown): AccessRequest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  const personName = str(r.personName).trim();
  if (!id || !personName) return null;
  const now = Date.now();
  return {
    id,
    store: str(r.store).trim(),
    sector: str(r.sector).trim(),
    personName,
    access: str(r.access).trim(),
    notes: str(r.notes),
    status: isStatus(r.status) ? r.status : 'pendente',
    tiNotes: str(r.tiNotes),
    requestedBy: str(r.requestedBy),
    doneAt: typeof r.doneAt === 'number' && Number.isFinite(r.doneAt) ? r.doneAt : null,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : now,
  };
}

/** Confere o que a pessoa digitou no formulário. */
export function readRequest(input: RequestInput): RequestRead {
  const store = input.store.trim();
  if (!store) return { error: 'Escolha a loja.', focus: 'store' };
  const sector = input.sector.trim();
  if (!sector) return { error: 'Informe o setor ou a área.', focus: 'sector' };
  const personName = input.personName.trim();
  if (!personName) return { error: 'Informe o nome da pessoa.', focus: 'personName' };
  return {
    draft: {
      store,
      sector,
      personName,
      access: input.access.trim(),
      notes: input.notes.trim(),
    },
  };
}

export function createRequest(
  draft: RequestDraft,
  requestedBy = '',
  now: number = Date.now(),
  id: string = crypto.randomUUID(),
): AccessRequest {
  return {
    ...draft,
    id,
    status: 'pendente',
    tiNotes: '',
    requestedBy,
    doneAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function applyRequestDraft(
  prev: AccessRequest,
  draft: RequestDraft,
  now: number = Date.now(),
): AccessRequest {
  return { ...prev, ...draft, updatedAt: now };
}

/** Muda a situação (e as observações da TI). "Feito" guarda o momento; os outros apagam. */
export function setRequestStatus(
  prev: AccessRequest,
  status: RequestStatus,
  tiNotes: string = prev.tiNotes,
  now: number = Date.now(),
): AccessRequest {
  const doneAt = status === 'feito' ? (prev.status === 'feito' ? (prev.doneAt ?? now) : now) : null;
  return { ...prev, status, tiNotes: tiNotes.trim(), doneAt, updatedAt: now };
}

export interface RequestFilters {
  query: string;
  status: 'all' | RequestStatus;
  /** 'all' ou o nome da loja. */
  store: string;
}

export const EMPTY_REQUEST_FILTERS: RequestFilters = { query: '', status: 'all', store: 'all' };

const searchText = (s: AccessRequest): string =>
  normalize([s.personName, s.store, s.sector, s.access, s.notes, s.tiNotes, s.requestedBy].join(' '));

/** Aplica busca, situação e loja. Pendentes primeiro (os mais antigos antes), depois os mais recentes. */
export function filterRequests(items: readonly AccessRequest[], f: RequestFilters): AccessRequest[] {
  const q = normalize(f.query.trim());
  return items
    .filter(
      (s) =>
        (f.status === 'all' || s.status === f.status) &&
        (f.store === 'all' || normalize(s.store) === normalize(f.store)) &&
        (q === '' || searchText(s).includes(q)),
    )
    .sort((a, b) => {
      const ap = a.status === 'pendente';
      const bp = b.status === 'pendente';
      if (ap !== bp) return ap ? -1 : 1;
      return ap ? a.createdAt - b.createdAt : b.createdAt - a.createdAt;
    });
}

export function countByRequestStatus(items: readonly AccessRequest[]): Record<RequestStatus, number> {
  const out: Record<RequestStatus, number> = { pendente: 0, feito: 0, cancelado: 0 };
  for (const s of items) out[s.status] += 1;
  return out;
}

/** Só os pedidos feitos por esta conta (no modo local, que não tem conta, devolve todos). */
export function mineOf(items: readonly AccessRequest[], account: string): AccessRequest[] {
  if (!account) return [...items];
  const a = account.toLowerCase();
  return items.filter((s) => s.requestedBy.toLowerCase() === a);
}
