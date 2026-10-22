import type { Equipment, Filters, StatusFilter } from '../types';
import { buildDashboard } from '../domain/dashboard';
import { isCategoryId } from '../domain/catalog';
import { formatDate, formatMoneyShort } from '../domain/format';
import { bars, pct, panel } from './bars';
import { esc } from './dom';

export interface DashboardActions {
  /** Abre a lista já filtrada. */
  showList: (filters: Partial<Filters>) => void;
  add: () => void;
  importFile: () => void;
}

/** Quantas garantias aparecem no painel antes de "ver todas". */
const WARRANTY_SHOWN = 6;

export class DashboardView {
  constructor(
    private readonly root: HTMLElement,
    actions: DashboardActions,
  ) {
    root.addEventListener('click', (e) => {
      const el = (e.target as Element).closest<HTMLElement>('[data-go],[data-act]');
      if (!el) return;
      if (el.dataset.act === 'add') return actions.add();
      if (el.dataset.act === 'import') return actions.importFile();
      const [kind, ...rest] = (el.dataset.go ?? '').split(':');
      const value = decodeURIComponent(rest.join(':'));
      if (kind === 'status') actions.showList({ status: value as StatusFilter });
      else if (kind === 'category' && isCategoryId(value)) actions.showList({ category: value });
      else if (kind === 'query') actions.showList({ query: value });
      else if (kind === 'garantia') actions.showList({ status: 'garantia' });
    });
  }

  render(items: readonly Equipment[], ready: boolean): void {
    if (!ready) {
      this.root.innerHTML = '<div class="skel"></div>';
      return;
    }
    const d = buildDashboard(items);
    if (d.total === 0) {
      this.root.innerHTML =
        '<div class="empty"><h2>O painel aparece quando houver equipamentos</h2>' +
        '<p>Cadastre um equipamento ou importe sua lista de um PDF ou CSV.</p>' +
        '<div class="actions"><button type="button" class="btn primary" data-act="add">Adicionar equipamento</button>' +
        '<button type="button" class="btn" data-act="import">Importar de PDF ou CSV</button></div></div>';
      return;
    }

    const baixados = d.total - d.active;
    const kpis =
      `<section class="kpis" aria-label="Resumo">` +
      `<div class="hero"><p class="lbl">Equipamentos cadastrados</p><p class="hero-n">${d.total}</p>` +
      `<p class="panel-note">${d.active} ativos${baixados > 0 ? ` · ${baixados} baixados` : ''}</p></div>` +
      `<div class="tiles">` +
      `<div class="tile-k"><p class="lbl">Valor em ativos</p><p class="tile-n">${d.assetValue > 0 ? formatMoneyShort(d.assetValue) : '—'}</p>` +
      `<p class="panel-note">${d.withoutValue > 0 ? `${d.withoutValue} sem valor informado` : 'Todos com valor'}</p></div>` +
      `<div class="tile-k"><p class="lbl">Em manutenção</p><p class="tile-n">${d.inMaintenance}</p>` +
      `<p class="panel-note">${d.inMaintenance === 0 ? 'Nenhum parado' : pct(d.inMaintenance, d.total) + ' do total'}</p></div>` +
      `</div></section>`;

    const statusTotal = d.byStatus.reduce((sum, s) => sum + s.n, 0);
    const stack =
      `<div class="stack" role="img" aria-label="${esc(d.byStatus.map((s) => `${s.label}: ${s.n}`).join(', '))}">` +
      d.byStatus
        .filter((s) => s.n > 0)
        .map(
          (s) =>
            `<span class="seg s-${s.key}" style="flex:${s.n}" title="${esc(`${s.label}: ${s.n}`)}"></span>`,
        )
        .join('') +
      `</div>` +
      `<ul class="legend">${d.byStatus
        .map(
          (s) =>
            `<li><button type="button" class="legend-btn" data-go="status:${s.key}"${s.n === 0 ? ' disabled' : ''}>` +
            `<i class="led s-${s.key}"></i><span class="legend-l">${esc(s.label)}</span>` +
            `<span class="bn">${s.n}</span><span class="legend-p">${pct(s.n, statusTotal)}</span></button></li>`,
        )
        .join('')}</ul>`;

    const warranty =
      d.warranty.length === 0
        ? '<p class="muted">Nenhuma garantia vencida ou perto de vencer.</p>'
        : `<ul class="wlist">${d.warranty
            .slice(0, WARRANTY_SHOWN)
            .map((w) => {
              const late = w.days < 0;
              const text = late
                ? `Venceu há ${-w.days} ${-w.days === 1 ? 'dia' : 'dias'}`
                : w.days === 0
                  ? 'Vence hoje'
                  : `Vence em ${w.days} ${w.days === 1 ? 'dia' : 'dias'}`;
              return (
                `<li><button type="button" class="wrow" data-go="garantia:1">` +
                `<span class="wname">${esc(w.item.name)}</span>` +
                `<span class="wdate">${esc(formatDate(w.item.warrantyEnd))}</span>` +
                `<span class="pill ${late ? 'bad' : 'warn'}">${esc(text)}</span></button></li>`
              );
            })
            .join('')}</ul>` +
          (d.warranty.length > WARRANTY_SHOWN
            ? `<button type="button" class="link" data-go="garantia:1">Ver as ${d.warranty.length} garantias</button>`
            : '');

    this.root.innerHTML =
      kpis +
      panel('Situação', 'Todos os equipamentos. Toque para ver a lista.', stack) +
      panel('Garantias que pedem atenção', 'Vencidas ou com até 60 dias.', warranty) +
      panel('Por categoria', 'Só equipamentos ativos (sem os baixados).', bars(d.byCategory, 'category')) +
      panel('Por local', 'Só equipamentos ativos.', bars(d.byLocation, 'query')) +
      panel('Por responsável', 'Só equipamentos ativos.', bars(d.byOwner, 'query')) +
      panel('Idade dos equipamentos', 'Pela data da compra, só ativos.', bars(d.age, null));
  }
}
