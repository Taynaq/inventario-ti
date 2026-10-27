import type { BreakdownStore } from '../data/breakdownStore';
import type { RequestStore } from '../data/requestStore';
import type { Store } from '../data/store';
import { EMPTY_BREAKDOWN_FILTERS, filterBreakdowns, type Breakdown } from '../domain/breakdown';
import { countByRequestStatus, mineOf, type AccessRequest } from '../domain/request';
import { warrantyAlert } from '../domain/warranty';
import type { ModuleId } from '../modules';
import type { Equipment } from '../types';
import { esc } from './dom';
import { SECTION_ICONS } from './navIcons';

export type HomeGo = ModuleId | 'acessos';

interface HomeOptions {
  modules: readonly ModuleId[];
  admin: boolean;
  store: Store | null;
  breakdowns: BreakdownStore | null;
  requests: RequestStore | null;
  account: string;
  go: (section: HomeGo) => void;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** Tela inicial: resumo do dia e atalhos para os setores que a pessoa pode usar. */
export class HomeView {
  private equipment: Equipment[] = [];
  private breaks: Breakdown[] = [];
  private requestItems: AccessRequest[] = [];
  private ready = { inv: false, brk: false, sel: false };

  constructor(
    private readonly root: HTMLElement,
    private readonly opts: HomeOptions,
  ) {}

  mount(): void {
    this.root.addEventListener('click', (e) => {
      const id = (e.target as Element).closest<HTMLElement>('[data-go]')?.dataset.go;
      if (id === 'inventario' || id === 'quebras' || id === 'solicitacoes' || id === 'acessos')
        this.opts.go(id);
    });
    const noop = (): void => undefined;
    if (this.opts.store) {
      this.opts.store.subscribe((items) => {
        this.equipment = items;
        this.ready.inv = true;
        this.render();
      }, noop);
    } else this.ready.inv = true;
    if (this.opts.breakdowns) {
      this.opts.breakdowns.subscribe((items) => {
        this.breaks = items;
        this.ready.brk = true;
        this.render();
      }, noop);
    } else this.ready.brk = true;
    if (this.opts.requests) {
      this.opts.requests.subscribe((items) => {
        this.requestItems = items;
        this.ready.sel = true;
        this.render();
      }, noop);
    } else this.ready.sel = true;
    this.render();
  }

  setActive(active: boolean): void {
    this.root.hidden = !active;
    if (active) this.render();
  }

  private render(): void {
    if (this.root.hidden) return;
    const has = (m: ModuleId): boolean => this.opts.modules.includes(m);
    const today = new Date();
    const todayCount = filterBreakdowns(
      this.breaks,
      { ...EMPTY_BREAKDOWN_FILTERS, period: 'today' },
      today,
    ).length;
    const weekCount = filterBreakdowns(
      this.breaks,
      { ...EMPTY_BREAKDOWN_FILTERS, period: '7d' },
      today,
    ).length;
    const warranties = this.equipment.filter((i) => warrantyAlert(i, today) !== null).length;

    const kpis: string[] = [];
    if (has('quebras')) {
      kpis.push(kpi('Quebras hoje', this.ready.brk ? String(todayCount) : '…', todayCount > 0));
    }
    const reqs = this.opts.admin ? this.requestItems : mineOf(this.requestItems, this.opts.account);
    if (has('solicitacoes')) {
      const pending = countByRequestStatus(reqs).pendente;
      kpis.push(
        kpi(
          this.opts.admin ? 'Acessos a criar' : 'Pedidos pendentes',
          this.ready.sel ? String(pending) : '…',
          this.opts.admin && pending > 0,
        ),
      );
    }
    if (has('inventario')) {
      kpis.push(kpi('Equipamentos', this.ready.inv ? String(this.equipment.length) : '…', false));
      kpis.push(kpi('Garantias a vencer', this.ready.inv ? String(warranties) : '…', warranties > 0));
    }

    const tiles: string[] = [];
    if (has('inventario')) {
      tiles.push(
        tile(
          'inventario',
          'Inventário de TI',
          !this.ready.inv
            ? 'Carregando…'
            : this.equipment.length === 0
              ? 'Nenhum equipamento ainda'
              : plural(this.equipment.length, 'equipamento', 'equipamentos'),
        ),
      );
    }
    if (has('quebras')) {
      tiles.push(
        tile(
          'quebras',
          'Quebra de máquinas',
          !this.ready.brk
            ? 'Carregando…'
            : this.breaks.length === 0
              ? 'Nenhuma quebra registrada'
              : `${plural(weekCount, 'quebra', 'quebras')} nos últimos 7 dias`,
        ),
      );
    }
    if (has('solicitacoes')) {
      const n = countByRequestStatus(reqs);
      tiles.push(
        tile(
          'solicitacoes',
          'Solicitação de acessos',
          !this.ready.sel
            ? 'Carregando…'
            : reqs.length === 0
              ? 'Nenhum pedido ainda'
              : plural(n.pendente, 'pedido pendente', 'pedidos pendentes'),
        ),
      );
    }
    if (this.opts.admin) tiles.push(tile('acessos', 'Acessos', 'Quem pode usar o app'));

    this.root.innerHTML =
      (kpis.length
        ? `<p class="lbl">Resumo</p><div class="kpis k${kpis.length}">${kpis.join('')}</div>`
        : '') + `<p class="lbl">Setores</p><div class="tiles-home">${tiles.join('')}</div>`;
  }
}

function kpi(label: string, value: string, alert: boolean): string {
  return `<div class="kpi${alert ? ' alert' : ''}"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`;
}

function tile(id: HomeGo, title: string, sub: string): string {
  return (
    `<button type="button" class="stile" data-go="${id}">` +
    `<span class="sic">${SECTION_ICONS[id]}</span>` +
    `<span class="stx"><b>${esc(title)}</b><small>${esc(sub)}</small></span>` +
    `<span class="chev" aria-hidden="true">›</span></button>`
  );
}
