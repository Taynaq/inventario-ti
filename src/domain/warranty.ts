import type { Equipment } from '../types';

/** Quantos dias faltam para a data (negativo se já passou). null se a data é inválida. */
export function daysUntil(iso: string, today: Date = new Date()): number | null {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  const end = new Date(y, m - 1, d);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

export interface WarrantyAlert {
  kind: 'warn' | 'bad';
  text: string;
}

/** Dias de antecedência para avisar que a garantia está acabando. */
export const WARRANTY_WARNING_DAYS = 60;

/** Aviso de garantia. Equipamentos baixados e sem data de garantia não geram aviso. */
export function warrantyAlert(
  item: Pick<Equipment, 'status' | 'warrantyEnd'>,
  today: Date = new Date(),
): WarrantyAlert | null {
  if (!item.warrantyEnd || item.status === 'baixado') return null;
  const d = daysUntil(item.warrantyEnd, today);
  if (d === null) return null;
  if (d < 0) return { kind: 'bad', text: 'Garantia vencida' };
  if (d === 0) return { kind: 'warn', text: 'Garantia vence hoje' };
  if (d <= WARRANTY_WARNING_DAYS) {
    return { kind: 'warn', text: `Garantia: ${d} ${d === 1 ? 'dia' : 'dias'}` };
  }
  return null;
}
