import type { Equipment, EquipmentDraft, Filters, StatusFilter, StatusId, CategoryId } from '../types';
import { describeError, type Store } from '../data/store';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  STATUSES,
  STATUS_LABELS,
  isCategoryId,
  isStatusId,
} from '../domain/catalog';
import { applyDraft, createEquipment } from '../domain/equipment';
import { EMPTY_FILTERS, filterEquipment, summarize } from '../domain/filter';
import { formatDate, formatMoney, formatMoneyShort, parseMoney } from '../domain/format';
import { warrantyAlert } from '../domain/warranty';
import { $, esc, toast } from './dom';
import { DashboardView } from './dashboardView';
import { categoryIcon } from './icons';
import { ImportView } from './importView';

export interface ViewOptions {
  /** E-mail de quem está usando (modo compartilhado). */
  account?: string;
  /** Presente no modo compartilhado: mostra o botão "Sair". */
  onSignOut?: () => void;
}

const option = (value: string, label: string): string =>
  `<option value="${esc(value)}">${esc(label)}</option>`;

type Tab = 'lista' | 'painel' | 'importar';

export class InventoryView {
  private items: Equipment[] = [];
  private ready = false;
  private syncFailed = false;
  private filters: Filters = { ...EMPTY_FILTERS };
  private editingId: string | null = null;
  private detailId: string | null = null;
  private armedDelete: string | null = null;
  private armTimer: ReturnType<typeof setTimeout> | undefined;
  private lastFocus: Element | null = null;
  private tab: Tab = 'lista';
  private dash!: DashboardView;
  private importer!: ImportView;

  constructor(
    private readonly store: Store,
    private readonly opts: ViewOptions = {},
  ) {}

  mount(): void {
    $('#app').hidden = false;
    $('#catFilter').innerHTML =
      option('all', 'Todas') + CATEGORIES.map((c) => option(c.id, c.label)).join('');
    $('#f-cat').innerHTML = CATEGORIES.map((c) => option(c.id, c.label)).join('');
    $('#f-status').innerHTML = STATUSES.map((s) => option(s.id, s.label)).join('');
    if (this.opts.onSignOut) {
      const out = $('#signOut');
      out.hidden = false;
      out.addEventListener('click', this.opts.onSignOut);
    }
    this.dash = new DashboardView($('#viewDash'), {
      showList: (f) => this.showList(f),
      add: () => this.openForm(null),
      importFile: () => this.setTab('importar'),
    });
    this.importer = new ImportView(
      $('#viewImport'),
      this.store,
      () => this.items,
      () => this.setTab('lista'),
    );
    this.bind();
    this.render();
    this.store.subscribe(
      (items) => {
        this.items = items;
        this.ready = true;
        this.syncFailed = false;
        this.render();
      },
      () => {
        this.ready = true;
        this.syncFailed = true;
        this.render();
        toast('Sem conexão com o armazenamento.');
      },
    );
  }

  // ---------- eventos ----------

  private bind(): void {
    $<HTMLInputElement>('#q').addEventListener('input', (e) => {
      this.filters.query = (e.target as HTMLInputElement).value;
      this.renderList();
    });
    $<HTMLSelectElement>('#catFilter').addEventListener('change', (e) => {
      const v = (e.target as HTMLSelectElement).value;
      this.filters.category = isCategoryId(v) ? v : 'all';
      this.renderList();
    });
    $('#catChips').addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-cat]');
      if (!b) return;
      const v = b.dataset.cat;
      this.filters.category = isCategoryId(v) ? v : 'all';
      $<HTMLSelectElement>('#catFilter').value = this.filters.category;
      this.renderHead();
      this.renderList();
    });
    $('#chips').addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-status]');
      if (!b) return;
      this.filters.status = (b.dataset.status ?? 'all') as StatusFilter;
      this.renderHead();
      this.renderList();
    });
    $('#list').addEventListener('click', (e) => {
      const target = e.target as Element;
      const card = target.closest<HTMLElement>('[data-open]');
      if (card?.dataset.open) return this.openDetail(card.dataset.open);
      if (target.closest('[data-act="clear"]')) this.clearFilters();
    });
    document.addEventListener('click', (e) => {
      const target = e.target as Element;
      if (target.closest('[data-close]')) return this.closeSheets();
      const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'add') this.openForm(null);
      else if (act === 'import') this.setTab('importar');
      else if (act === 'rm-examples') void this.removeExamples();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeSheets();
    });
    $('#tabs').addEventListener('click', (e) => {
      const tab = (e.target as Element).closest<HTMLElement>('[data-tab]')?.dataset.tab;
      if (tab === 'lista' || tab === 'painel' || tab === 'importar') this.setTab(tab);
    });
    $('#addBtn').addEventListener('click', () => this.openForm(null));
    $('#scrim').addEventListener('click', () => this.closeSheets());
    $('#sheetForm').addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submitForm();
    });
    $('#editBtn').addEventListener('click', () => {
      if (this.detailId) this.openForm(this.detailId);
    });
    $('#delBtn').addEventListener('click', () => void this.deleteCurrent());
    $('#detailBody').addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-setstatus]');
      const st = b?.dataset.setstatus;
      if (isStatusId(st)) void this.setStatus(st);
    });
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
    document.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => {
      if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    $('#viewList').hidden = tab !== 'lista';
    $('#viewDash').hidden = tab !== 'painel';
    $('#viewImport').hidden = tab !== 'importar';
    $('#addBtn').hidden = tab === 'importar';
    this.render();
    window.scrollTo(0, 0);
  }

  /** Abre a lista já filtrada (usado pelos toques no painel). */
  private showList(partial: Partial<Filters>): void {
    this.filters = { ...EMPTY_FILTERS, ...partial };
    $<HTMLInputElement>('#q').value = this.filters.query;
    $<HTMLSelectElement>('#catFilter').value = this.filters.category;
    this.setTab('lista');
  }

  private clearFilters(): void {
    this.filters = { ...EMPTY_FILTERS };
    $<HTMLInputElement>('#q').value = '';
    $<HTMLSelectElement>('#catFilter').value = 'all';
    this.render();
  }

  // ---------- desenho ----------

  private render(): void {
    this.renderHead();
    this.renderList();
    this.renderFoot();
    this.dash.render(this.items, this.ready);
    this.importer.update();
    if (!$('#sheetDetail').hidden) this.renderDetail();
  }

  private renderHead(): void {
    const s = summarize(this.items);
    if (this.filters.status === 'garantia' && s.warranty === 0) this.filters.status = 'all';

    $('#summary').textContent = !this.ready
      ? 'Carregando…'
      : s.total === 0
        ? 'Nenhum equipamento ainda'
        : `${s.total} ${s.total === 1 ? 'equipamento' : 'equipamentos'}` +
          (s.assetValue > 0 ? ` · ${formatMoneyShort(s.assetValue)} em ativos` : '');

    const show = this.ready && s.total > 0 && this.tab === 'lista';
    $('#tools').hidden = !show;
    const chips = $('#chips');
    chips.hidden = !show;
    const catChips = $('#catChips');
    catChips.hidden = !show;
    if (!show) {
      chips.innerHTML = '';
      catChips.innerHTML = '';
      return;
    }
    // Filtro por tipo: só aparecem os tipos que existem na lista.
    const counts = new Map<string, number>();
    for (const it of this.items) counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
    if (this.filters.category !== 'all' && !counts.has(this.filters.category)) this.filters.category = 'all';
    catChips.innerHTML = [
      { id: 'all', label: 'Todos os tipos', n: s.total },
      ...CATEGORIES.filter((c) => counts.has(c.id)).map((c) => ({
        id: c.id,
        label: c.label,
        n: counts.get(c.id) ?? 0,
      })),
    ]
      .map(
        (d) =>
          `<button type="button" class="chip" data-cat="${d.id}" aria-pressed="${this.filters.category === d.id}">` +
          `${esc(d.label)} <span class="n">${d.n}</span></button>`,
      )
      .join('');
    const defs: { id: StatusFilter; label: string; n: number; led: string }[] = [
      { id: 'all', label: 'Todos', n: s.total, led: '' },
      ...STATUSES.map((st) => ({ id: st.id, label: st.label, n: s.byStatus[st.id], led: `s-${st.id}` })),
    ];
    if (s.warranty > 0) defs.push({ id: 'garantia', label: 'Garantia', n: s.warranty, led: 's-warn' });
    chips.innerHTML = defs
      .map(
        (d) =>
          `<button type="button" class="chip" data-status="${d.id}" aria-pressed="${this.filters.status === d.id}">` +
          (d.led ? `<i class="led ${d.led}"></i>` : '') +
          `${esc(d.label)} <span class="n">${d.n}</span></button>`,
      )
      .join('');
  }

  private cardHtml(it: Equipment): string {
    const w = warrantyAlert(it);
    const sub = [CATEGORY_LABELS[it.category], it.brand].filter(Boolean).join(' · ');
    const who = [it.owner, it.location].filter(Boolean).join(' · ');
    return (
      `<li><button type="button" class="card" data-open="${esc(it.id)}">` +
      `<span class="tile">${categoryIcon(it.category)}</span>` +
      `<span class="body">` +
      `<span class="row1"><span class="name">${esc(it.name)}</span>` +
      `<span class="led-label"><i class="led s-${it.status}"></i>${esc(STATUS_LABELS[it.status])}</span></span>` +
      `<span class="sub">${esc(sub)}</span>` +
      `<span class="sub">${who ? esc(who) : 'Sem responsável'}</span>` +
      `<span class="row3">` +
      (it.tag ? `<span class="tagno">${esc(it.tag)}</span>` : '') +
      (w ? `<span class="pill ${w.kind}">${esc(w.text)}</span>` : '') +
      (it.example ? `<span class="pill ex">Exemplo</span>` : '') +
      `</span></span></button></li>`
    );
  }

  private renderList(): void {
    const list = $('#list');
    const empty = $('#empty');
    const note = $('#note');
    if (!this.ready) {
      list.innerHTML = '<li class="skel"></li><li class="skel"></li><li class="skel"></li>';
      empty.hidden = true;
      note.hidden = true;
      return;
    }
    if (this.items.length === 0) {
      list.innerHTML = '';
      note.hidden = true;
      empty.hidden = false;
      empty.innerHTML =
        '<h2>Cadastre o primeiro equipamento</h2>' +
        '<p>Notebooks, celulares, monitores, impressoras e o que mais você controla ficam aqui, com responsável, série, patrimônio e garantia. Só o nome é obrigatório.</p>' +
        '<div class="actions"><button type="button" class="btn primary" data-act="add">Adicionar equipamento</button>' +
        '<button type="button" class="btn" data-act="import">Importar de PDF ou CSV</button></div>';
      return;
    }
    empty.hidden = true;
    note.hidden = !this.items.some((x) => x.example);
    const rows = filterEquipment(this.items, this.filters);
    list.innerHTML =
      rows.length === 0
        ? '<li class="nores"><strong>Nada encontrado</strong><span>Tente outro termo ou limpe os filtros.</span>' +
          '<button type="button" class="link" data-act="clear">Limpar filtros</button></li>'
        : rows.map((it) => this.cardHtml(it)).join('');
  }

  private renderFoot(): void {
    let text = '';
    if (this.ready) {
      if (this.syncFailed)
        text = 'Sem conexão com o armazenamento. Os dados exibidos podem estar desatualizados.';
      else if (this.store.kind === 'cloud') {
        text = `Dados compartilhados com a equipe${this.opts.account ? ` · ${this.opts.account}` : ''}.`;
      } else {
        text = 'Dados salvos só neste navegador. Limpar os dados do navegador apaga o inventário.';
      }
    }
    $('#foot').textContent = text;
  }

  // ---------- painéis ----------

  private showSheet(sheet: HTMLElement): void {
    if ($('#scrim').hidden) this.lastFocus = document.activeElement;
    $('#scrim').hidden = false;
    sheet.hidden = false;
    $('#app').inert = true;
    document.documentElement.classList.add('locked');
  }

  private closeSheets(): void {
    if ($('#scrim').hidden) return;
    $('#sheetForm').hidden = true;
    $('#sheetDetail').hidden = true;
    $('#scrim').hidden = true;
    $('#app').inert = false;
    document.documentElement.classList.remove('locked');
    this.armedDelete = null;
    if (this.lastFocus instanceof HTMLElement) this.lastFocus.focus();
  }

  private fillDatalist(selector: string, key: 'owner' | 'location'): void {
    const values = [...new Set(this.items.map((it) => it[key].trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    );
    $(selector).innerHTML = values.map((v) => `<option value="${esc(v)}"></option>`).join('');
  }

  private openForm(id: string | null): void {
    const it = id ? this.items.find((x) => x.id === id) : undefined;
    this.editingId = it?.id ?? null;
    $('#formTitle').textContent = it ? 'Editar equipamento' : 'Novo equipamento';
    const set = (sel: string, value: string): void => {
      $<HTMLInputElement>(sel).value = value;
    };
    set('#f-name', it?.name ?? '');
    set('#f-cat', it?.category ?? 'notebook');
    set('#f-status', it?.status ?? 'uso');
    set('#f-owner', it?.owner ?? '');
    set('#f-brand', it?.brand ?? '');
    set('#f-serial', it?.serial ?? '');
    set('#f-tag', it?.tag ?? '');
    set('#f-loc', it?.location ?? '');
    set('#f-buy', it?.buyDate ?? '');
    set('#f-warranty', it?.warrantyEnd ?? '');
    set('#f-value', it?.value != null ? String(it.value).replace('.', ',') : '');
    set('#f-notes', it?.notes ?? '');
    $<HTMLDetailsElement>('#more').open = Boolean(
      it &&
      (it.brand ||
        it.serial ||
        it.tag ||
        it.location ||
        it.buyDate ||
        it.warrantyEnd ||
        it.value !== null ||
        it.notes),
    );
    $('#formErr').textContent = '';
    this.fillDatalist('#dl-owners', 'owner');
    this.fillDatalist('#dl-locs', 'location');
    $('#sheetDetail').hidden = true;
    this.showSheet($('#sheetForm'));
    if (!it) requestAnimationFrame(() => $('#f-name').focus());
  }

  private openDetail(id: string): void {
    if (!this.items.some((x) => x.id === id)) return;
    this.detailId = id;
    this.armedDelete = null;
    this.renderDetail();
    this.showSheet($('#sheetDetail'));
    $('#detailClose').focus();
  }

  private renderDetail(): void {
    const it = this.items.find((x) => x.id === this.detailId);
    if (!it) return this.closeSheets();
    $('#detailTitle').textContent = it.name;
    const sub = [CATEGORY_LABELS[it.category], it.brand].filter(Boolean).join(' · ');
    $('#detailSub').textContent = sub;
    $('#detailSub').hidden = !sub;

    const w = warrantyAlert(it);
    const rows: [string, string][] = [];
    if (it.tag) rows.push(['Patrimônio', `<span class="mono">${esc(it.tag)}</span>`]);
    if (it.serial) rows.push(['Nº de série', `<span class="mono">${esc(it.serial)}</span>`]);
    if (it.owner) rows.push(['Responsável', esc(it.owner)]);
    if (it.location) rows.push(['Local', esc(it.location)]);
    if (it.buyDate) rows.push(['Compra', esc(formatDate(it.buyDate))]);
    if (it.warrantyEnd) {
      rows.push([
        'Garantia até',
        esc(formatDate(it.warrantyEnd)) + (w ? ` <span class="pill ${w.kind}">${esc(w.text)}</span>` : ''),
      ]);
    }
    if (it.value !== null) rows.push(['Valor', esc(formatMoney(it.value))]);
    if (it.notes) rows.push(['Observações', `<span class="pre">${esc(it.notes)}</span>`]);

    const seg = STATUSES.map(
      (s) =>
        `<button type="button" data-setstatus="${s.id}" aria-pressed="${it.status === s.id}"><i class="led s-${s.id}"></i>${esc(s.label)}</button>`,
    ).join('');
    const dl = rows.length
      ? `<dl class="dl">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`
      : '<p class="muted">Sem detalhes ainda. Toque em Editar para completar.</p>';
    $('#detailBody').innerHTML =
      `<div><p class="lbl">Status</p><div class="seg">${seg}</div></div>` +
      (it.example ? '<p class="muted">Este é um equipamento de exemplo.</p>' : '') +
      dl;

    const armed = this.armedDelete === it.id;
    $('#delBtn').textContent = armed ? 'Toque de novo para excluir' : 'Excluir';
    $('#delBtn').classList.toggle('armed', armed);
  }

  // ---------- ações ----------

  private readDraft(): { draft: EquipmentDraft } | { error: string; focus: string; openMore?: boolean } {
    const val = (sel: string): string => $<HTMLInputElement>(sel).value.trim();
    const name = val('#f-name');
    if (!name) return { error: 'Informe o nome do equipamento.', focus: '#f-name' };
    const valueText = val('#f-value');
    const value = parseMoney(valueText);
    if (valueText && value === null) {
      return {
        error: 'Valor inválido. Use apenas números, por exemplo 3.500,00.',
        focus: '#f-value',
        openMore: true,
      };
    }
    return {
      draft: {
        name,
        category: val('#f-cat') as CategoryId,
        status: val('#f-status') as StatusId,
        owner: val('#f-owner'),
        brand: val('#f-brand'),
        serial: val('#f-serial'),
        tag: val('#f-tag'),
        location: val('#f-loc'),
        buyDate: val('#f-buy'),
        warrantyEnd: val('#f-warranty'),
        value,
        notes: val('#f-notes'),
      },
    };
  }

  private async submitForm(): Promise<void> {
    const read = this.readDraft();
    if ('error' in read) {
      if (read.openMore) $<HTMLDetailsElement>('#more').open = true;
      $('#formErr').textContent = read.error;
      $(read.focus).focus();
      return;
    }
    const prev = this.editingId ? this.items.find((x) => x.id === this.editingId) : undefined;
    const item = prev ? applyDraft(prev, read.draft) : createEquipment(read.draft);
    const btn = $<HTMLButtonElement>('#saveBtn');
    btn.disabled = true;
    try {
      await this.store.save(item);
      this.closeSheets();
      toast(prev ? 'Alterações salvas' : 'Equipamento adicionado');
    } catch (e) {
      $('#formErr').textContent = describeError(e);
    } finally {
      btn.disabled = false;
    }
  }

  private async setStatus(status: StatusId): Promise<void> {
    const it = this.items.find((x) => x.id === this.detailId);
    if (!it || it.status === status) return;
    try {
      await this.store.patch(it.id, { status, updatedAt: Date.now() });
      toast(`Status: ${STATUS_LABELS[status]}`);
    } catch (e) {
      toast(describeError(e));
    }
  }

  private async deleteCurrent(): Promise<void> {
    const id = this.detailId;
    if (!id) return;
    if (this.armedDelete !== id) {
      // Primeiro toque só arma; o segundo exclui. Desarma sozinho depois de 4 s.
      this.armedDelete = id;
      this.renderDetail();
      clearTimeout(this.armTimer);
      this.armTimer = setTimeout(() => {
        this.armedDelete = null;
        if (!$('#sheetDetail').hidden) this.renderDetail();
      }, 4000);
      return;
    }
    try {
      await this.store.remove(id);
      this.armedDelete = null;
      this.closeSheets();
      toast('Equipamento excluído');
    } catch (e) {
      toast(describeError(e));
    }
  }

  private async removeExamples(): Promise<void> {
    try {
      await this.store.removeMany(this.items.filter((x) => x.example).map((x) => x.id));
      toast('Exemplos removidos');
    } catch (e) {
      toast(describeError(e));
    }
  }
}
