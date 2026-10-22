import type { BreakdownStore } from '../data/breakdownStore';
import { describeError } from '../data/store';
import {
  EMPTY_BREAKDOWN_FILTERS,
  applyBreakdownDraft,
  createBreakdown,
  filterBreakdowns,
  groupsOf,
  monthLabel,
  monthsOf,
  readBreakdown,
  summarizeBreakdowns,
  type Breakdown,
  type BreakdownFilters,
  type BreakdownInput,
} from '../domain/breakdown';
import { isoDateIn, normalize } from '../domain/format';
import { bars, panel, pct } from './bars';
import { $, esc, toast } from './dom';

type Tab = 'registros' | 'resumo';

const SHORT_MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

const partsText = (n: number): string =>
  n === 0 ? 'Nenhuma peça perdida' : `${n} ${n === 1 ? 'peça perdida' : 'peças perdidas'}`;

/** Tela "Quebra de máquinas": registro do dia, máquina, grupo e peças perdidas, com resumo. */
export class BreakdownView {
  private items: Breakdown[] = [];
  private ready = false;
  private active = false;
  private tab: Tab = 'registros';
  private filters: BreakdownFilters = { ...EMPTY_BREAKDOWN_FILTERS };
  private editingId: string | null = null;
  private lastFocus: Element | null = null;

  constructor(
    private readonly store: BreakdownStore,
    private readonly onSummary: (text: string) => void,
  ) {}

  mount(): void {
    this.bind();
    this.store.subscribe(
      (items) => {
        this.items = items;
        this.ready = true;
        this.render();
      },
      (e) => {
        this.ready = true;
        this.render();
        toast(
          e.message.includes('tabela quebras')
            ? 'A tela de quebras ainda não foi ativada no banco. Rode o SQL do guia.'
            : describeError(e),
        );
      },
    );
  }

  /** Mostra ou esconde a tela (o menu do topo troca entre as telas). */
  setActive(active: boolean): void {
    this.active = active;
    $('#hdrQ').hidden = !active;
    $('#modQ').hidden = !active;
    $('#addQ').hidden = !active || this.tab !== 'registros';
    if (active) this.render();
  }

  // ---------- eventos ----------

  private bind(): void {
    $('#tabsQ').addEventListener('click', (e) => {
      const tab = (e.target as Element).closest<HTMLElement>('[data-qtab]')?.dataset.qtab;
      if (tab === 'registros' || tab === 'resumo') this.setTab(tab);
    });
    $<HTMLInputElement>('#qSearch').addEventListener('input', (e) => {
      this.filters.query = (e.target as HTMLInputElement).value;
      this.render();
    });
    $<HTMLSelectElement>('#qMonth').addEventListener('change', (e) => {
      this.filters.month = (e.target as HTMLSelectElement).value;
      this.render();
    });
    $('#qGroups').addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-group]');
      if (!b) return;
      this.filters.group = b.dataset.group ?? 'all';
      this.render();
    });
    $('#qList').addEventListener('click', (e) => {
      const target = e.target as Element;
      const card = target.closest<HTMLElement>('[data-qopen]');
      if (card?.dataset.qopen) return this.openForm(card.dataset.qopen);
      if (target.closest('[data-act="q-clear"]')) this.clearFilters();
    });
    $('#qEmpty').addEventListener('click', (e) => {
      const act = (e.target as Element).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'q-add') this.openForm(null);
      else if (act === 'q-clear') this.clearFilters();
    });
    $('#qViewSum').addEventListener('click', (e) => {
      const go = (e.target as Element).closest<HTMLElement>('[data-go]')?.dataset.go ?? '';
      const [kind, ...rest] = go.split(':');
      const value = decodeURIComponent(rest.join(':'));
      if (kind === 'machine')
        this.filters = { ...EMPTY_BREAKDOWN_FILTERS, month: this.filters.month, query: value };
      else if (kind === 'group')
        this.filters = { ...EMPTY_BREAKDOWN_FILTERS, month: this.filters.month, group: value };
      else if (kind === 'add') return this.openForm(null);
      else return;
      $<HTMLInputElement>('#qSearch').value = this.filters.query;
      this.setTab('registros');
    });
    $('#addQ').addEventListener('click', () => this.openForm(null));
    $('#sheetQ').addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submit();
    });
    $('#qDel').addEventListener('click', () => void this.deleteCurrent());
    $('#sheetQ').addEventListener('click', (e) => {
      if ((e.target as Element).closest('[data-close]')) this.closeForm();
    });
    $('#scrim').addEventListener('click', () => this.closeForm());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeForm();
    });
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
    document.querySelectorAll<HTMLElement>('[data-qtab]').forEach((b) => {
      if (b.dataset.qtab === tab) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    $('#addQ').hidden = !this.active || tab !== 'registros';
    this.render();
    window.scrollTo(0, 0);
  }

  private clearFilters(): void {
    this.filters = { ...EMPTY_BREAKDOWN_FILTERS };
    $<HTMLInputElement>('#qSearch').value = '';
    this.render();
  }

  // ---------- desenho ----------

  private render(): void {
    if (!this.active) return;
    // Filtros que deixaram de existir (por exemplo, o último registro daquele mês foi apagado).
    if (this.filters.month !== 'all' && !monthsOf(this.items).includes(this.filters.month)) {
      this.filters.month = 'all';
    }
    if (
      this.filters.group !== 'all' &&
      !groupsOf(this.items).some((g) => normalize(g) === normalize(this.filters.group))
    ) {
      this.filters.group = 'all';
    }

    const total = this.items.reduce((sum, b) => sum + b.lostParts, 0);
    this.onSummary(
      !this.ready
        ? 'Carregando…'
        : this.items.length === 0
          ? 'Nenhuma quebra registrada'
          : `${this.items.length} ${this.items.length === 1 ? 'registro' : 'registros'} · ${total} peças perdidas`,
    );

    const show = this.ready && this.items.length > 0;
    $('#toolsQ').hidden = !show;
    this.renderChips(show);
    $('#qViewList').hidden = this.tab !== 'registros';
    $('#qViewSum').hidden = this.tab !== 'resumo';
    $('#tabsQ').hidden = !show;
    if (this.tab === 'registros') this.renderList();
    else this.renderSummary();
  }

  private renderChips(show: boolean): void {
    const months = monthsOf(this.items);
    $('#qMonth').innerHTML =
      `<option value="all">Todos os meses</option>` +
      months
        .map(
          (m) =>
            `<option value="${m}"${m === this.filters.month ? ' selected' : ''}>${esc(monthLabel(m))}</option>`,
        )
        .join('');
    const chips = $('#qGroups');
    const groups = groupsOf(this.items);
    chips.hidden = !show || groups.length === 0;
    if (chips.hidden) {
      chips.innerHTML = '';
      return;
    }
    const inMonth = this.items.filter(
      (b) => this.filters.month === 'all' || b.day.startsWith(this.filters.month),
    );
    const count = (g: string): number => inMonth.filter((b) => normalize(b.group) === normalize(g)).length;
    const pressed = (g: string): boolean =>
      g === 'all' ? this.filters.group === 'all' : normalize(this.filters.group) === normalize(g);
    chips.innerHTML = [{ id: 'all', label: 'Todos os grupos', n: inMonth.length }]
      .concat(groups.map((g) => ({ id: g, label: g, n: count(g) })))
      .map(
        (d) =>
          `<button type="button" class="chip" data-group="${esc(d.id)}" aria-pressed="${pressed(d.id)}">` +
          `${esc(d.label)} <span class="n">${d.n}</span></button>`,
      )
      .join('');
  }

  private cardHtml(b: Breakdown): string {
    const [, m, d] = b.day.split('-');
    return (
      `<li><button type="button" class="card" data-qopen="${esc(b.id)}">` +
      `<span class="tile daytile"><b>${esc(d)}</b><i>${esc(SHORT_MONTHS[Number(m) - 1] ?? '')}</i></span>` +
      `<span class="body"><span class="row1"><span class="name">${esc(b.machine)}</span>` +
      (b.group ? `<span class="tagno">${esc(b.group)}</span>` : '') +
      `</span><span class="sub parts">${esc(partsText(b.lostParts))}</span>` +
      (b.notes ? `<span class="sub">${esc(b.notes)}</span>` : '') +
      `</span></button></li>`
    );
  }

  private renderList(): void {
    const list = $('#qList');
    const empty = $('#qEmpty');
    if (!this.ready) {
      list.innerHTML = '<li class="skel"></li>';
      empty.hidden = true;
      return;
    }
    if (this.items.length === 0) {
      list.innerHTML = '';
      empty.hidden = false;
      empty.innerHTML =
        '<h2>Nenhuma quebra registrada</h2><p>Registre o dia, a máquina, o grupo e as peças perdidas.</p>' +
        '<div class="actions"><button type="button" class="btn primary" data-act="q-add">Registrar quebra</button></div>';
      return;
    }
    const rows = filterBreakdowns(this.items, this.filters);
    if (rows.length === 0) {
      list.innerHTML = '';
      empty.hidden = false;
      empty.innerHTML =
        '<h2>Nada encontrado</h2><p>Nenhum registro com esses filtros.</p>' +
        '<div class="actions"><button type="button" class="btn" data-act="q-clear">Limpar filtros</button></div>';
      return;
    }
    empty.hidden = true;
    list.innerHTML = rows.map((b) => this.cardHtml(b)).join('');
  }

  private renderSummary(): void {
    const root = $('#qViewSum');
    if (!this.ready) {
      root.innerHTML = '<div class="skel"></div>';
      return;
    }
    const rows = filterBreakdowns(this.items, this.filters);
    if (rows.length === 0) {
      root.innerHTML =
        '<div class="empty"><h2>O resumo aparece quando houver registros</h2>' +
        '<p>Registre uma quebra ou mude os filtros.</p>' +
        '<div class="actions"><button type="button" class="btn primary" data-go="add:">Registrar quebra</button></div></div>';
      return;
    }
    const s = summarizeBreakdowns(rows);
    const topParts = s.byMachine[0];
    const topBreaks = s.breaksByMachine[0];
    const period = this.filters.month === 'all' ? 'Todo o período' : monthLabel(this.filters.month);
    const kpis =
      `<section class="kpis" aria-label="Resumo">` +
      `<div class="hero"><p class="lbl">Peças perdidas</p><p class="hero-n">${s.lostParts}</p>` +
      `<p class="panel-note">${esc(period)} · ${s.records} ${s.records === 1 ? 'quebra' : 'quebras'}</p></div>` +
      `<div class="tiles">` +
      `<div class="tile-k"><p class="lbl">Mais peças perdidas</p><p class="tile-n tile-t">${esc(topParts?.label ?? '—')}</p>` +
      `<p class="panel-note">${topParts ? `${topParts.n} peças · ${pct(topParts.n, s.lostParts)}` : ''}</p></div>` +
      `<div class="tile-k"><p class="lbl">Mais quebras</p><p class="tile-n tile-t">${esc(topBreaks?.label ?? '—')}</p>` +
      `<p class="panel-note">${topBreaks ? `${topBreaks.n} ${topBreaks.n === 1 ? 'vez' : 'vezes'}` : ''}</p></div>` +
      `</div></section>`;
    root.innerHTML =
      kpis +
      panel('Peças perdidas por máquina', 'Toque para ver os registros.', bars(s.byMachine, 'machine')) +
      panel('Peças perdidas por grupo', 'Toque para ver os registros.', bars(s.byGroup, 'group')) +
      panel('Quebras por máquina', 'Quantas vezes cada máquina quebrou.', bars(s.breaksByMachine, null)) +
      panel('Peças perdidas por dia', 'Os dias mais recentes.', bars(s.byDay, null));
  }

  // ---------- formulário ----------

  private fillDatalist(selector: string, values: string[]): void {
    $(selector).innerHTML = values.map((v) => `<option value="${esc(v)}"></option>`).join('');
  }

  private openForm(id: string | null): void {
    const it = id ? this.items.find((x) => x.id === id) : undefined;
    this.editingId = it?.id ?? null;
    $('#qTitle').textContent = it ? 'Editar registro' : 'Novo registro';
    const set = (sel: string, value: string): void => {
      $<HTMLInputElement>(sel).value = value;
    };
    set('#q-day', it?.day ?? isoDateIn(0));
    set('#q-machine', it?.machine ?? '');
    set('#q-group', it?.group ?? '');
    set('#q-parts', it ? String(it.lostParts) : '');
    set('#q-notes', it?.notes ?? '');
    $('#qErr').textContent = '';
    $('#qDel').hidden = !it;
    const machines = [...new Set(this.items.map((b) => b.machine))].sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    );
    this.fillDatalist('#dl-machines', machines);
    this.fillDatalist('#dl-groups', groupsOf(this.items));

    if ($('#scrim').hidden) this.lastFocus = document.activeElement;
    $('#scrim').hidden = false;
    $('#sheetQ').hidden = false;
    $('#app').inert = true;
    document.documentElement.classList.add('locked');
    $(it ? '#q-parts' : '#q-machine').focus();
  }

  private closeForm(): void {
    if ($('#sheetQ').hidden) return;
    $('#sheetQ').hidden = true;
    $('#scrim').hidden = true;
    $('#app').inert = false;
    document.documentElement.classList.remove('locked');
    if (this.lastFocus instanceof HTMLElement) this.lastFocus.focus();
  }

  private async submit(): Promise<void> {
    const field = (sel: string): string => $<HTMLInputElement>(sel).value;
    const input: BreakdownInput = {
      day: field('#q-day'),
      machine: field('#q-machine'),
      group: field('#q-group'),
      parts: field('#q-parts'),
      notes: field('#q-notes'),
    };
    const read = readBreakdown(input);
    if ('error' in read) {
      $('#qErr').textContent = read.error;
      $(`#q-${read.focus}`).focus();
      return;
    }
    const prev = this.editingId ? this.items.find((x) => x.id === this.editingId) : undefined;
    const item = prev ? applyBreakdownDraft(prev, read.draft) : createBreakdown(read.draft);
    const btn = $<HTMLButtonElement>('#qSave');
    btn.disabled = true;
    try {
      await this.store.save(item);
      this.closeForm();
      toast(prev ? 'Alterações salvas' : 'Registro adicionado');
    } catch (e) {
      $('#qErr').textContent = describeError(e);
    } finally {
      btn.disabled = false;
    }
  }

  private async deleteCurrent(): Promise<void> {
    const id = this.editingId;
    if (!id) return;
    if (!window.confirm('Excluir este registro de quebra?')) return;
    try {
      await this.store.remove(id);
      this.closeForm();
      toast('Registro excluído');
    } catch (e) {
      toast(describeError(e));
    }
  }
}
