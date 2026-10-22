import type { Count } from '../domain/dashboard';
import { esc } from './dom';

export const pct = (n: number, total: number): string =>
  total > 0 ? `${Math.round((n / total) * 100)}%` : '0%';

/** Linhas de barras horizontais: um tom só, tamanho proporcional, valor ao lado. */
export function bars(counts: Count[], goPrefix: string | null): string {
  const max = Math.max(1, ...counts.map((c) => c.n));
  const total = counts.reduce((sum, c) => sum + c.n, 0);
  return `<ul class="bars">${counts
    .map((c) => {
      const width = c.n === 0 ? 0 : Math.max(2, (c.n / max) * 100);
      const inner =
        `<span class="bl">${esc(c.label)}</span>` +
        `<span class="track"><span class="fill" style="width:${width}%"></span></span>` +
        `<span class="bn">${c.n}</span>`;
      const title = `${c.label}: ${c.n} (${pct(c.n, total)})`;
      const go =
        goPrefix !== null && c.key !== '' && c.n > 0 ? `${goPrefix}:${encodeURIComponent(c.key)}` : '';
      return go
        ? `<li><button type="button" class="barrow" data-go="${esc(go)}" title="${esc(title)}">${inner}</button></li>`
        : `<li><div class="barrow" title="${esc(title)}">${inner}</div></li>`;
    })
    .join('')}</ul>`;
}

export function panel(title: string, note: string, body: string): string {
  return `<section class="panel"><h2>${esc(title)}</h2>${note ? `<p class="panel-note">${esc(note)}</p>` : ''}${body}</section>`;
}
