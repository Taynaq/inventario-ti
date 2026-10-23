import { formatDate, normalize } from './format';

/** Um pedido de cadastro de vendedor(a), com os mesmos campos da tela PESFM009 do TOTVS Moda. */
export type SellerStatus = 'pendente' | 'criado' | 'cancelado';

export const SELLER_STATUSES: { id: SellerStatus; label: string }[] = [
  { id: 'pendente', label: 'Pendente' },
  { id: 'criado', label: 'Criado no TOTVS' },
  { id: 'cancelado', label: 'Cancelado' },
];

export interface SellerRequest {
  id: string;
  /** Nome da vendedora (campo ao lado do código no PESFM009). */
  name: string;
  /** Vendedor: Código. */
  sellerCode: string;
  /** Vendedor: Pessoa (código da pessoa já cadastrada no TOTVS). */
  personCode: string;
  /** Informação do vendedor: Empresa. */
  company: string;
  /** Informação do vendedor: Cód. auxiliar. */
  auxCode: string;
  /** Informação do vendedor: Tipo vendedor. */
  sellerType: string;
  /** Informação do vendedor: Inativo. */
  inactive: boolean;
  /** Tabela comissão: Tabela. */
  commTable: string;
  /** Tabela comissão: Dt. início (AAAA-MM-DD ou vazio). */
  commStart: string;
  /** Tabela comissão: Dt. fim (AAAA-MM-DD ou vazio). */
  commEnd: string;
  status: SellerStatus;
  notes: string;
  /** E-mail de quem fez o pedido (vazio no modo local). */
  requestedBy: string;
  createdAt: number;
  updatedAt: number;
}

export type SellerDraft = Omit<SellerRequest, 'id' | 'createdAt' | 'updatedAt' | 'requestedBy'>;

export interface SellerInput {
  name: string;
  sellerCode: string;
  personCode: string;
  company: string;
  auxCode: string;
  sellerType: string;
  inactive: boolean;
  commTable: string;
  commStart: string;
  commEnd: string;
  status: string;
  notes: string;
}

export type SellerRead = { draft: SellerDraft } | { error: string; focus: keyof SellerInput };

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const isIsoDay = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const isStatus = (v: unknown): v is SellerStatus => SELLER_STATUSES.some((s) => s.id === v);

export const statusLabel = (s: SellerStatus): string => SELLER_STATUSES.find((x) => x.id === s)?.label ?? s;

export function toSeller(raw: unknown): SellerRequest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  const name = str(r.name).trim();
  if (!id || !name) return null;
  const day = (v: unknown): string => {
    const s = str(v).slice(0, 10);
    return isIsoDay(s) ? s : '';
  };
  const now = Date.now();
  return {
    id,
    name,
    sellerCode: str(r.sellerCode).trim(),
    personCode: str(r.personCode).trim(),
    company: str(r.company).trim(),
    auxCode: str(r.auxCode).trim(),
    sellerType: str(r.sellerType).trim(),
    inactive: r.inactive === true,
    commTable: str(r.commTable).trim(),
    commStart: day(r.commStart),
    commEnd: day(r.commEnd),
    status: isStatus(r.status) ? r.status : 'pendente',
    notes: str(r.notes),
    requestedBy: str(r.requestedBy),
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : now,
  };
}

/** Confere o que a pessoa digitou no formulário. */
export function readSeller(input: SellerInput): SellerRead {
  const name = input.name.trim();
  if (!name) return { error: 'Informe o nome da vendedora.', focus: 'name' };
  const start = input.commStart.trim();
  const end = input.commEnd.trim();
  if (start && !isIsoDay(start)) return { error: 'Data de início da comissão inválida.', focus: 'commStart' };
  if (end && !isIsoDay(end)) return { error: 'Data de fim da comissão inválida.', focus: 'commEnd' };
  if (start && end && end < start) {
    return { error: 'A data fim da comissão não pode ser antes do início.', focus: 'commEnd' };
  }
  return {
    draft: {
      name,
      sellerCode: input.sellerCode.trim(),
      personCode: input.personCode.trim(),
      company: input.company.trim(),
      auxCode: input.auxCode.trim(),
      sellerType: input.sellerType.trim(),
      inactive: input.inactive,
      commTable: input.commTable.trim(),
      commStart: start,
      commEnd: end,
      status: isStatus(input.status) ? input.status : 'pendente',
      notes: input.notes.trim(),
    },
  };
}

export function createSeller(
  draft: SellerDraft,
  requestedBy = '',
  now: number = Date.now(),
  id: string = crypto.randomUUID(),
): SellerRequest {
  return { ...draft, id, requestedBy, createdAt: now, updatedAt: now };
}

export function applySellerDraft(
  prev: SellerRequest,
  draft: SellerDraft,
  now: number = Date.now(),
): SellerRequest {
  return { ...prev, ...draft, updatedAt: now };
}

export interface SellerFilters {
  query: string;
  /** 'all' ou um SellerStatus. */
  status: 'all' | SellerStatus;
}

export const EMPTY_SELLER_FILTERS: SellerFilters = { query: '', status: 'all' };

const searchText = (s: SellerRequest): string =>
  normalize(
    [s.name, s.sellerCode, s.personCode, s.company, s.sellerType, s.commTable, s.notes, s.requestedBy].join(
      ' ',
    ),
  );

/** Aplica busca e status. Pendentes primeiro, depois os mais recentes. */
export function filterSellers(items: readonly SellerRequest[], f: SellerFilters): SellerRequest[] {
  const q = normalize(f.query.trim());
  const rank = (s: SellerRequest): number => (s.status === 'pendente' ? 0 : 1);
  return items
    .filter((s) => (f.status === 'all' || s.status === f.status) && (q === '' || searchText(s).includes(q)))
    .sort((a, b) => rank(a) - rank(b) || b.createdAt - a.createdAt);
}

export function countByStatus(items: readonly SellerRequest[]): Record<SellerStatus, number> {
  const out: Record<SellerStatus, number> = { pendente: 0, criado: 0, cancelado: 0 };
  for (const s of items) out[s.status] += 1;
  return out;
}

/** Texto na ordem da tela PESFM009, para copiar e conferir enquanto cadastra no TOTVS. */
export function sellerToText(s: SellerRequest): string {
  const dash = (v: string): string => v || '—';
  return [
    'PESFM009 - Manutenção de Vendedor',
    '',
    'VENDEDOR',
    `Código: ${dash(s.sellerCode)}`,
    `Nome: ${s.name}`,
    `Pessoa: ${dash(s.personCode)}`,
    '',
    'INFORMAÇÃO DO VENDEDOR',
    `Empresa: ${dash(s.company)}`,
    `Cód. auxiliar: ${dash(s.auxCode)}`,
    `Tipo vendedor: ${dash(s.sellerType)}`,
    `Inativo: ${s.inactive ? 'Sim' : 'Não'}`,
    '',
    'TABELA COMISSÃO',
    `Tabela: ${dash(s.commTable)}`,
    `Dt. início: ${s.commStart ? formatDate(s.commStart) : '—'}`,
    `Dt. fim: ${s.commEnd ? formatDate(s.commEnd) : '—'}`,
    ...(s.notes ? ['', `Observações: ${s.notes}`] : []),
  ].join('\n');
}
