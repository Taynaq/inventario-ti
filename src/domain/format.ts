const moneyFull = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moneyShort = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

export const formatMoney = (n: number): string => moneyFull.format(n);
export const formatMoneyShort = (n: number): string => moneyShort.format(n);

/** AAAA-MM-DD -> DD/MM/AAAA. Devolve o texto original se não for uma data ISO. */
export function formatDate(iso: string): string {
  if (!iso) return '';
  const p = iso.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
}

/** Minúsculas e sem acentos, para busca tolerante. */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Converte o texto digitado em número. Aceita "3500", "3.500,00", "R$ 3.500,00".
 * Devolve null para vazio ou inválido.
 */
export function parseMoney(input: string): number | null {
  let t = input.replace(/R\$/gi, '').replace(/\s/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Data local no formato AAAA-MM-DD, `days` dias a partir de `from`. */
export function isoDateIn(days: number, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
