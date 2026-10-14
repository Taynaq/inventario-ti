import { CATEGORY_IDS, STATUS_IDS, type CategoryId, type StatusId } from '../types';

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  notebook: 'Notebook',
  desktop: 'Desktop',
  celular: 'Celular',
  tablet: 'Tablet',
  monitor: 'Monitor',
  impressora: 'Impressora',
  rede: 'Rede',
  periferico: 'Periférico',
  servidor: 'Servidor',
  outro: 'Outro',
};

export const STATUS_LABELS: Record<StatusId, string> = {
  uso: 'Em uso',
  estoque: 'Em estoque',
  manutencao: 'Em manutenção',
  baixado: 'Baixado',
};

export const CATEGORIES = CATEGORY_IDS.map((id) => ({ id, label: CATEGORY_LABELS[id] }));
export const STATUSES = STATUS_IDS.map((id) => ({ id, label: STATUS_LABELS[id] }));

export function isCategoryId(v: unknown): v is CategoryId {
  return typeof v === 'string' && (CATEGORY_IDS as readonly string[]).includes(v);
}

export function isStatusId(v: unknown): v is StatusId {
  return typeof v === 'string' && (STATUS_IDS as readonly string[]).includes(v);
}
