import type { CategoryId, Equipment, EquipmentDraft, StatusId } from '../types';
import { normalize, parseMoney } from './format';

/** Um pedaço de texto de um PDF, com posição na página. y cresce para cima, como no PDF. */
export interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

/** Tabela lida de um arquivo: uma linha de títulos e as linhas de dados, todas do mesmo tamanho. */
export interface ParsedTable {
  header: string[];
  rows: string[][];
}

export const IMPORT_FIELDS = [
  { id: 'name', label: 'Nome do equipamento', required: true },
  { id: 'category', label: 'Categoria', required: false },
  { id: 'status', label: 'Status', required: false },
  { id: 'owner', label: 'Responsável', required: false },
  { id: 'brand', label: 'Marca e modelo', required: false },
  { id: 'serial', label: 'Número de série', required: false },
  { id: 'tag', label: 'Patrimônio', required: false },
  { id: 'location', label: 'Local', required: false },
  { id: 'buyDate', label: 'Data da compra', required: false },
  { id: 'warrantyEnd', label: 'Garantia até', required: false },
  { id: 'value', label: 'Valor pago', required: false },
  { id: 'notes', label: 'Observações', required: false },
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number]['id'];
/** Para cada campo do app, o número da coluna do arquivo (ou null para não importar). */
export type Mapping = Record<ImportField, number | null>;

export const emptyMapping = (): Mapping => ({
  name: null,
  category: null,
  status: null,
  owner: null,
  brand: null,
  serial: null,
  tag: null,
  location: null,
  buyDate: null,
  warrantyEnd: null,
  value: null,
  notes: null,
});

// ------------------------------------------------------------ reconhecer colunas

/** Nomes que costumam aparecer nos títulos das colunas, sem acento e em minúsculas. */
const ALIASES: Record<ImportField, string[]> = {
  name: ['nome', 'equipamento', 'descricao', 'item', 'produto', 'dispositivo', 'nome do equipamento'],
  category: ['categoria', 'tipo', 'classe', 'grupo'],
  status: ['status', 'situacao', 'estado'],
  owner: ['responsavel', 'usuario', 'colaborador', 'funcionario', 'dono', 'alocado', 'utilizador'],
  brand: ['marca', 'modelo', 'marca modelo', 'marca/modelo', 'fabricante'],
  serial: ['numero de serie', 'n de serie', 'n serie', 'serie', 'serial', 'n/s', 'sn', 'service tag', 'imei'],
  tag: ['patrimonio', 'plaqueta', 'etiqueta', 'tag', 'codigo', 'cod', 'numero do patrimonio', 'n patrimonio'],
  location: ['local', 'localizacao', 'setor', 'departamento', 'area', 'unidade', 'filial', 'sala'],
  buyDate: [
    'data da compra',
    'data de compra',
    'data compra',
    'compra',
    'aquisicao',
    'data de aquisicao',
    'adquirido em',
  ],
  warrantyEnd: [
    'garantia ate',
    'fim da garantia',
    'vencimento da garantia',
    'validade da garantia',
    'garantia',
    'vencimento',
  ],
  value: ['valor pago', 'valor de compra', 'valor', 'preco', 'custo'],
  notes: ['observacoes', 'observacao', 'obs', 'notas', 'anotacoes', 'comentarios'],
};

const clean = (s: string): string =>
  normalize(s)
    .replace(/[^a-z0-9/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function aliasScore(header: string, alias: string): number {
  const h = clean(header);
  const a = clean(alias);
  if (!h || !a) return 0;
  if (h === a) return 3;
  if (h.startsWith(`${a} `) || h.endsWith(` ${a}`) || h.includes(` ${a} `)) return 2;
  return 0;
}

/** Descobre qual coluna é cada campo, pelos títulos. Cada coluna e cada campo são usados uma vez. */
export function guessMapping(header: readonly string[]): Mapping {
  const pairs: { field: ImportField; col: number; score: number }[] = [];
  for (const field of Object.keys(ALIASES) as ImportField[]) {
    header.forEach((h, col) => {
      const score = Math.max(0, ...ALIASES[field].map((a) => aliasScore(h, a)));
      if (score > 0) pairs.push({ field, col, score });
    });
  }
  pairs.sort((a, b) => b.score - a.score || a.col - b.col);
  const mapping = emptyMapping();
  const usedCols = new Set<number>();
  for (const p of pairs) {
    if (mapping[p.field] !== null || usedCols.has(p.col)) continue;
    mapping[p.field] = p.col;
    usedCols.add(p.col);
  }
  return mapping;
}

const mappedCount = (cells: readonly string[]): number =>
  Object.values(guessMapping(cells)).filter((v) => v !== null).length;

/** Acha a linha de títulos: a que mais se parece com nomes de coluna conhecidos. */
export function pickHeader(rows: readonly (readonly string[])[], limit = 15): number {
  let best = -1;
  let bestScore = 1; // exige pelo menos 2 colunas reconhecidas
  rows.slice(0, limit).forEach((r, i) => {
    const s = mappedCount(r);
    if (s > bestScore) {
      best = i;
      bestScore = s;
    }
  });
  if (best >= 0) return best;
  // Sem nenhum título conhecido: usa a linha com mais células preenchidas.
  let most = 0;
  let mostN = -1;
  rows.slice(0, limit).forEach((r, i) => {
    const n = r.filter((c) => c.trim() !== '').length;
    if (n > mostN) {
      most = i;
      mostN = n;
    }
  });
  return most;
}

// ------------------------------------------------------------------------ CSV

/**
 * Escolhe o separador que mais aparece (fora de aspas) nas primeiras linhas.
 * Olhar várias linhas evita errar quando o arquivo começa com uma linha de título.
 */
function detectDelimiter(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .slice(0, 10);
  const count: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  for (const line of lines) {
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes && ch in count) count[ch] = (count[ch] ?? 0) + 1;
    }
  }
  const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : ',';
}

/** Lê CSV (separado por vírgula, ponto e vírgula ou tab, com ou sem aspas). */
export function parseCsvRows(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const sep = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
}

function buildTable(rows: string[][]): ParsedTable {
  if (rows.length === 0) return { header: [], rows: [] };
  const h = pickHeader(rows);
  const header = rows[h] ?? [];
  const width = Math.max(header.length, ...rows.slice(h + 1).map((r) => r.length));
  const pad = (r: string[]): string[] => Array.from({ length: width }, (_, i) => r[i] ?? '');
  return { header: pad(header), rows: rows.slice(h + 1).map(pad) };
}

export function tableFromCsv(text: string): ParsedTable {
  return buildTable(parseCsvRows(text));
}

// ------------------------------------------------------------------------ PDF

interface Cell {
  x: number;
  w: number;
  text: string;
}

/** Um pedaço de texto e o número da linha (de cima para baixo) em que está. */
interface Placed {
  it: TextItem;
  line: number;
}

interface Line {
  page: number;
  y: number;
  height: number;
  items: TextItem[];
}

/** Agrupa os pedaços de texto em linhas, página por página, de cima para baixo. */
function linesOfItems(items: readonly TextItem[]): Line[] {
  const out: Line[] = [];
  const pages = [...new Set(items.map((i) => i.page))].sort((a, b) => a - b);
  for (const page of pages) {
    const onPage = items
      .filter((i) => i.page === page && i.text.trim() !== '')
      .sort((a, b) => b.y - a.y || a.x - b.x);
    let current: Line | null = null;
    for (const it of onPage) {
      if (current && Math.abs(it.y - current.y) <= Math.max(2, it.height * 0.5)) {
        current.items.push(it);
        current.height = Math.max(current.height, it.height);
      } else {
        current = { page, y: it.y, height: it.height, items: [it] };
        out.push(current);
      }
    }
  }
  return out;
}

/**
 * Descobre se há células com texto quebrado em mais de uma linha (ou centralizado na vertical).
 * Nesse caso os espaços entre linhas formam dois grupos: o curto, dentro de uma linha da tabela, e o
 * longo, entre uma linha da tabela e a seguinte. Devolve o espaço máximo que ainda é "a mesma linha
 * da tabela", ou 0 se não há dois grupos claros.
 */
function wrapGap(lines: readonly Line[]): number {
  const gaps: number[] = [];
  let tallest = 0;
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1] as Line;
    const b = lines[i] as Line;
    if (a.page !== b.page) continue;
    gaps.push(a.y - b.y);
    tallest = Math.max(tallest, a.height, b.height);
  }
  if (gaps.length < 4) return 0;
  gaps.sort((x, y) => x - y);
  let best = 0;
  let ratio = 1;
  for (let i = 0; i + 1 < gaps.length; i++) {
    const r = (gaps[i + 1] as number) / Math.max(0.1, gaps[i] as number);
    if (r > ratio) {
      ratio = r;
      best = i;
    }
  }
  const small = gaps[best] as number;
  const large = gaps[best + 1] as number;
  if (ratio < 1.5 || small > tallest * 1.2) return 0;
  // Precisa haver várias quebras de verdade, não só um espaço fora do padrão.
  const bigCount = gaps.length - best - 1;
  if (bigCount < 2) return 0;
  return Math.sqrt(small * large);
}

/**
 * Junta pedaços vizinhos numa célula. O espaço entre palavras é pequeno (cerca de 0,3 da altura da
 * letra); o espaço entre colunas é maior. Texto quebrado em duas linhas fica na mesma célula.
 */
function cellsOfRow(placed: readonly Placed[]): Cell[] {
  const sorted = [...placed].sort((a, b) => a.it.x - b.it.x);
  const clusters: Placed[][] = [];
  let end = -Infinity;
  for (const p of sorted) {
    if (clusters.length > 0 && p.it.x - end <= Math.max(2, p.it.height * 0.5)) {
      (clusters[clusters.length - 1] as Placed[]).push(p);
      end = Math.max(end, p.it.x + p.it.width);
    } else {
      clusters.push([p]);
      end = p.it.x + p.it.width;
    }
  }
  return clusters.map((c) => {
    const x = Math.min(...c.map((p) => p.it.x));
    const x1 = Math.max(...c.map((p) => p.it.x + p.it.width));
    const ordered = [...c].sort((a, b) => a.line - b.line || a.it.x - b.it.x);
    return { x, w: x1 - x, text: ordered.map((p) => p.it.text.trim()).join(' ') };
  });
}

const PAGE_FOOTER = /^(p[aá]gina|pag\.?|page)\s*\d+(\s*(de|\/|of)\s*\d+)?$/i;

/**
 * Reconstrói uma tabela a partir do texto de um PDF.
 * As colunas vêm da posição dos títulos. Cada pedaço de texto das outras linhas vai para a coluna
 * cujo título ele mais cobre, e os pedaços da mesma coluna são juntados.
 */
export function tableFromTextItems(items: readonly TextItem[]): ParsedTable {
  const lines = linesOfItems(items);
  if (lines.length === 0) return { header: [], rows: [] };

  // Linhas da tabela: uma ou mais linhas de texto, conforme o espaçamento.
  const limit = wrapGap(lines);
  const tableRows: Placed[][] = [];
  lines.forEach((ln, idx) => {
    const prev = lines[idx - 1];
    const sameRow = prev !== undefined && limit > 0 && prev.page === ln.page && prev.y - ln.y <= limit;
    if (!sameRow) tableRows.push([]);
    const row = tableRows[tableRows.length - 1] as Placed[];
    for (const it of ln.items) row.push({ it, line: idx });
  });

  const h = pickHeader(tableRows.map((r) => cellsOfRow(r).map((c) => c.text)));
  const headerCells = cellsOfRow(tableRows[h] ?? []);
  const header = headerCells.map((c) => c.text);
  if (header.length === 0) return { header: [], rows: [] };

  const tol = 4;
  const columnOf = (it: TextItem): number => {
    const x0 = it.x;
    const x1 = it.x + it.width;
    // Quanto do título de cada coluna este texto cobre (0 a 1).
    const covers = headerCells.map((hc) => {
      const overlap = Math.min(x1, hc.x + hc.w) - Math.max(x0, hc.x);
      return hc.w > 0 ? Math.max(0, overlap) / hc.w : 0;
    });
    const top = Math.max(...covers);
    if (top > 0) {
      const close = covers.flatMap((c, i) => (c >= top - 0.05 ? [i] : []));
      // Em caso de empate, vale a coluna em cujo título o texto começa.
      const startsInside = close.find((i) => {
        const hc = headerCells[i] as Cell;
        return x0 >= hc.x - tol && x0 <= hc.x + hc.w + tol;
      });
      return startsInside ?? (close[0] as number);
    }
    // Não toca em nenhum título (ex.: "R$" ao lado do valor): vai para o título mais próximo.
    let col = 0;
    let best = Infinity;
    headerCells.forEach((hc, i) => {
      const dist = Math.max(hc.x - x1, x0 - (hc.x + hc.w), 0);
      if (dist < best) {
        best = dist;
        col = i;
      }
    });
    return col;
  };

  const normHeader = header.map(clean).join('|');
  const rows: string[][] = [];
  for (const tableRow of tableRows.slice(h + 1)) {
    const row = header.map(() => '');
    for (const { it } of [...tableRow].sort((a, b) => a.line - b.line || a.it.x - b.it.x)) {
      const i = columnOf(it);
      const text = it.text.trim();
      row[i] = row[i] ? `${row[i]} ${text}` : text;
    }
    const filled = row.filter((v) => v !== '').length;
    if (filled === 0) continue;
    if (filled === 1 && PAGE_FOOTER.test(row.find((v) => v !== '') ?? '')) continue;
    if (row.map(clean).join('|') === normHeader) continue; // título repetido em outra página
    const prev = rows[rows.length - 1];
    // Texto que quebrou em duas linhas: sem nada na primeira coluna e só uma célula.
    if (prev && row[0] === '' && filled === 1) {
      const i = row.findIndex((v) => v !== '');
      prev[i] = `${prev[i]} ${row[i]}`.trim();
      continue;
    }
    rows.push(row);
  }
  return { header, rows };
}

// ------------------------------------------------------- converter em equipamentos

/** Aceita 2026-10-13, 13/10/2026, 13-10-2026, 13.10.2026 e 13/10/26. Devolve AAAA-MM-DD ou vazio. */
export function parseDate(input: string): string {
  const t = input.trim();
  let y: number;
  let m: number;
  let d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
    if (!match) return '';
    d = Number(match[1]);
    m = Number(match[2]);
    y = Number(match[3]);
    if (match[3]?.length === 2) y += y < 70 ? 2000 : 1900;
  }
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const CATEGORY_WORDS: [CategoryId, string[]][] = [
  ['notebook', ['notebook', 'laptop', 'macbook', 'thinkpad', 'latitude', 'ideapad', 'vostro', 'inspiron']],
  ['celular', ['celular', 'smartphone', 'iphone', 'galaxy', 'telefone', 'moto g', 'redmi', 'xiaomi']],
  ['tablet', ['tablet', 'ipad']],
  ['monitor', ['monitor', 'display', 'televisor']],
  ['impressora', ['impressora', 'printer', 'multifuncional', 'laserjet', 'plotter', 'scanner']],
  [
    'rede',
    [
      'roteador',
      'router',
      'switch',
      'access point',
      'firewall',
      'modem',
      'rede',
      'wifi',
      'wi fi',
      'patch panel',
    ],
  ],
  ['periferico', ['mouse', 'teclado', 'headset', 'webcam', 'fone', 'dock', 'hub', 'periferico', 'nobreak']],
  ['servidor', ['servidor', 'server', 'nas', 'storage', 'rack']],
  ['desktop', ['desktop', 'computador', 'optiplex', 'all in one', 'mini pc', 'cpu', 'pc']],
];

/** Chuta a categoria pelo texto. */
export function guessCategory(text: string): CategoryId {
  const t = ` ${clean(text)} `;
  for (const [id, words] of CATEGORY_WORDS) {
    if (words.some((w) => t.includes(` ${w} `) || (t.includes(` ${w}`) && w.length > 4))) return id;
  }
  return 'outro';
}

/** Chuta o status pelo texto. Sem pistas, considera em uso. */
export function guessStatus(text: string): StatusId {
  const t = clean(text);
  if (t.includes('manut')) return 'manutencao';
  if (/(estoque|reserva|disponivel|guardado)/.test(t)) return 'estoque';
  if (/(baix|descart|inativ|sucata|vendid|perdid|roubad)/.test(t)) return 'baixado';
  return 'uso';
}

export interface DraftsResult {
  drafts: EquipmentDraft[];
  /** Linhas ignoradas por não terem nome. */
  skippedNoName: number;
  /** Datas e valores que não deu para entender (foram deixados em branco). */
  warnings: number;
}

export function toDrafts(
  rows: readonly (readonly string[])[],
  mapping: Mapping,
  header: readonly string[] = [],
): DraftsResult {
  // Colunas do arquivo que não viraram nenhum campo: vão para as observações, para não perder nada.
  const used = new Set(Object.values(mapping).filter((v): v is number => v !== null));
  const extraCols = header.map((_, i) => i).filter((i) => !used.has(i));
  const drafts: EquipmentDraft[] = [];
  let skippedNoName = 0;
  let warnings = 0;
  const pick = (row: readonly string[], f: ImportField): string => {
    const col = mapping[f];
    return col === null ? '' : (row[col] ?? '').trim();
  };
  for (const row of rows) {
    const name = pick(row, 'name');
    if (!name) {
      skippedNoName++;
      continue;
    }
    const brand = pick(row, 'brand');
    const catText = pick(row, 'category');
    const fromColumn = catText ? guessCategory(catText) : 'outro';
    const date = (f: 'buyDate' | 'warrantyEnd'): string => {
      const raw = pick(row, f);
      const iso = parseDate(raw);
      if (raw && !iso) warnings++;
      return iso;
    };
    const valueText = pick(row, 'value');
    const value = parseMoney(valueText);
    if (valueText && value === null) warnings++;
    drafts.push({
      name,
      category: fromColumn !== 'outro' ? fromColumn : guessCategory(`${name} ${brand}`),
      status: guessStatus(pick(row, 'status')),
      owner: pick(row, 'owner'),
      brand,
      serial: pick(row, 'serial'),
      tag: pick(row, 'tag'),
      location: pick(row, 'location'),
      buyDate: date('buyDate'),
      warrantyEnd: date('warrantyEnd'),
      value,
      notes: [
        pick(row, 'notes'),
        ...extraCols.flatMap((i) => {
          const v = (row[i] ?? '').trim();
          const title = (header[i] ?? '').trim() || `Coluna ${i + 1}`;
          return v ? [`${title}: ${v}`] : [];
        }),
      ]
        .filter(Boolean)
        .join('\n'),
    });
  }
  return { drafts, skippedNoName, warnings };
}

/** Separa o que é novo do que já existe (mesmo patrimônio ou mesmo número de série). */
export function splitDuplicates(
  existing: readonly Pick<Equipment, 'tag' | 'serial'>[],
  drafts: readonly EquipmentDraft[],
): { fresh: EquipmentDraft[]; duplicates: EquipmentDraft[] } {
  const tags = new Set(existing.map((e) => clean(e.tag)).filter(Boolean));
  const serials = new Set(existing.map((e) => clean(e.serial)).filter(Boolean));
  const fresh: EquipmentDraft[] = [];
  const duplicates: EquipmentDraft[] = [];
  for (const d of drafts) {
    const tag = clean(d.tag);
    const serial = clean(d.serial);
    if ((tag && tags.has(tag)) || (serial && serials.has(serial))) {
      duplicates.push(d);
      continue;
    }
    if (tag) tags.add(tag);
    if (serial) serials.add(serial);
    fresh.push(d);
  }
  return { fresh, duplicates };
}
