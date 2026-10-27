import type { RequestStore } from '../data/requestStore';
import { describeError } from '../data/store';
import { formatDate } from '../domain/format';
import {
  ACCESS_SUGGESTIONS,
  EMPTY_REQUEST_FILTERS,
  REQUEST_STATUSES,
  SECTORS,
  STORES,
  applyRequestDraft,
  countByRequestStatus,
  createRequest,
  filterRequests,
  mineOf,
  readRequest,
  requestStatusLabel,
  setRequestStatus,
  type AccessRequest,
  type RequestFilters,
  type RequestStatus,
} from '../domain/request';
import { $, esc, toast } from './dom';

type Tab = 'minhas' | 'fila';

const PILL: Record<RequestStatus, string> = { pendente: 'warn', feito: 'ok', cancelado: 'off' };

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

const day = (ms: number): string => formatDate(new Date(ms).toISOString().slice(0, 10));

const pill = (s: RequestStatus): string =>
  `<span class="pill ${PILL[s]}">${esc(requestStatusLabel(s))}</span>`;

/**
 * Tela "Solicitação de acessos". Quem tem a tela pede o acesso de uma pessoa (loja, setor, nome).
 * A administração (TI) vê a fila de todos os pedidos e marca como feito. Quem pediu vê só os próprios.
 */
export class RequestView {
  private items: AccessRequest[] = [];
  private ready = false;
  private active = false;
  private tab: Tab = 'minhas';
  private filters: RequestFilters = { ...EMPTY_REQUEST_FILTERS, status: 'pendente' };
  private editingId: string | null = null;
  private lastFocus: Element | null = null;

  constructor(
    private readonly store: RequestStore,
    private readonly account: string,
    private readonly admin: boolean,
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
          e.message.includes('tabela solicitacoes')
            ? 'A tela de solicitações ainda não foi ativada no banco. Rode o SQL do guia.'
            : describeError(e),
        );
      },
    );
  }

  setActive(active: boolean): void {
    this.active = active;
    $('#hdrS').hidden = !active;
    $('#modS').hidden = !active;
    this.syncFab();
    if (active) this.render();
  }

  private syncFab(): void {
    $('#addS').hidden = !this.active || this.tab !== 'minhas';
  }

  // ---------- eventos ----------

  private bind(): void {
    $('#tabsS').hidden = !this.admin;
    $('#tabsS').addEventListener('click', (e) => {
      const tab = (e.target as Element).closest<HTMLElement>('[data-rtab]')?.dataset.rtab;
      if (tab === 'minhas' || tab === 'fila') this.setTab(tab);
    });
    $<HTMLInputElement>('#sSearch').addEventListener('input', (e) => {
      this.filters.query = (e.target as HTMLInputElement).value;
      this.render();
    });
    $('#sStatus').addEventListener('click', (e) => {
      const id = (e.target as Element).closest<HTMLElement>('[data-sstatus]')?.dataset.sstatus;
      if (id === 'all' || REQUEST_STATUSES.some((s) => s.id === id)) {
        this.filters.status = id as RequestFilters['status'];
        this.render();
      }
    });
    $('#sStores').addEventListener('click', (e) => {
      const id = (e.target as Element).closest<HTMLElement>('[data-sstore]')?.dataset.sstore;
      if (id) {
        this.filters.store = decodeURIComponent(id);
        this.render();
      }
    });
    $('#sList').addEventListener('click', (e) => {
      const id = (e.target as Element).closest<HTMLElement>('[data-ropen]')?.dataset.ropen;
      if (id) this.openForm(id);
    });
    $('#sEmpty').addEventListener('click', (e) => {
      if ((e.target as Element).closest('[data-act="s-add"]')) this.openForm(null);
    });
    $('#sViewQueue').addEventListener('click', (e) => {
      const t = e.target as Element;
      const done = t.closest<HTMLElement>('[data-rdone]')?.dataset.rdone;
      if (done) return void this.markDone(done);
      const open = t.closest<HTMLElement>('[data-ropen]')?.dataset.ropen;
      if (open) return this.openForm(open);
      if (t.closest('[data-act="s-clear"]')) this.clearFilters();
    });
    $('#addS').addEventListener('click', () => this.openForm(null));
    $('#sheetS').addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submit();
    });
    $('#sDel').addEventListener('click', () => void this.deleteCurrent());
    $('#sheetS').addEventListener('click', (e) => {
      if ((e.target as Element).closest('[data-close]')) this.closeForm();
    });
    $('#scrim').addEventListener('click', () => this.closeForm());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeForm();
    });
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
    document.querySelectorAll<HTMLElement>('[data-rtab]').forEach((b) => {
      if (b.dataset.rtab === tab) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    this.syncFab();
    this.render();
  }

  private clearFilters(): void {
    this.filters = { ...EMPTY_REQUEST_FILTERS };
    $<HTMLInputElement>('#sSearch').value = '';
    this.render();
  }

  // ---------- telas ----------

  private render(): void {
    if (!this.active) return;
    const queue = this.admin && this.tab === 'fila';
    $('#sViewMine').hidden = queue;
    $('#sViewQueue').hidden = !queue;
    $('#toolsS').hidden = !queue;
    $('#sStatus').hidden = !queue;
    $('#sStores').hidden = !queue;
    this.renderSummary();
    if (queue) {
      this.renderFilters();
      this.renderQueue();
    } else this.renderMine();
  }

  private renderSummary(): void {
    if (!this.ready) return this.onSummary('Carregando…');
    const queue = this.admin && this.tab === 'fila';
    const list = queue ? this.items : mineOf(this.items, this.account);
    const pending = countByRequestStatus(list).pendente;
    if (list.length === 0) {
      return this.onSummary(queue ? 'Nenhum pedido na fila' : 'Você ainda não fez pedidos');
    }
    const p = `${pending} ${pending === 1 ? 'pendente' : 'pendentes'}`;
    this.onSummary(`${p} · ${list.length} no total`);
  }

  private renderFilters(): void {
    const n = countByRequestStatus(this.items);
    $('#sStatus').innerHTML = [{ id: 'all', label: 'Todos', n: this.items.length }]
      .concat(REQUEST_STATUSES.map((s) => ({ id: s.id as string, label: s.label, n: n[s.id] })))
      .map(
        (c) =>
          `<button type="button" class="chip" data-sstatus="${c.id}" aria-pressed="${this.filters.status === c.id}">${esc(c.label)} <span class="n">${c.n}</span></button>`,
      )
      .join('');
    const used = [...new Set(this.items.map((i) => i.store).filter(Boolean))];
    const stores = [...STORES, ...used.filter((u) => !STORES.includes(u))];
    const count = (st: string): number => this.items.filter((i) => i.store === st).length;
    $('#sStores').innerHTML = [
      `<button type="button" class="chip" data-sstore="all" aria-pressed="${this.filters.store === 'all'}">Todas as lojas</button>`,
    ]
      .concat(
        stores.map(
          (st) =>
            `<button type="button" class="chip" data-sstore="${encodeURIComponent(st)}" aria-pressed="${this.filters.store === st}">${esc(st)} <span class="n">${count(st)}</span></button>`,
        ),
      )
      .join('');
  }

  private cardHtml(v: AccessRequest): string {
    const where = [v.store, v.sector].filter(Boolean).join(' · ');
    return (
      `<li><button type="button" class="card" data-ropen="${esc(v.id)}">` +
      `<span class="tile stile-s">${esc(initials(v.personName))}</span>` +
      `<span class="body"><span class="row1"><span class="name">${esc(v.personName)}</span>${pill(v.status)}</span>` +
      (where ? `<span class="sub">${esc(where)}</span>` : '') +
      (v.access ? `<span class="sub">${esc(v.access)}</span>` : '') +
      `<span class="sub">Pedido em ${esc(day(v.createdAt))}` +
      (v.doneAt ? ` · feito em ${esc(day(v.doneAt))}` : '') +
      `</span></span></button></li>`
    );
  }

  private renderMine(): void {
    const list = $('#sList');
    const empty = $('#sEmpty');
    if (!this.ready) {
      list.innerHTML = '<li class="skel"></li>';
      empty.hidden = true;
      return;
    }
    const mine = mineOf(this.items, this.account).sort((a, b) => b.createdAt - a.createdAt);
    if (mine.length === 0) {
      list.innerHTML = '';
      empty.hidden = false;
      empty.innerHTML =
        '<h2>Nenhum pedido ainda</h2><p>Peça o acesso de uma pessoa: escolha a loja, o setor e informe o nome. A TI vê o pedido e avisa aqui quando estiver feito.</p>' +
        '<div class="actions"><button type="button" class="btn primary" data-act="s-add">Nova solicitação</button></div>';
      return;
    }
    empty.hidden = true;
    list.innerHTML = mine.map((v) => this.cardHtml(v)).join('');
  }

  private renderQueue(): void {
    const root = $('#sViewQueue');
    if (!this.ready) {
      root.innerHTML = '<div class="skel"></div>';
      return;
    }
    if (this.items.length === 0) {
      root.innerHTML =
        '<div class="empty"><h2>Nenhum pedido na fila</h2><p>Os pedidos de acesso feitos pelas lojas aparecem aqui.</p></div>';
      return;
    }
    const rows = filterRequests(this.items, this.filters);
    if (rows.length === 0) {
      root.innerHTML =
        '<div class="empty"><h2>Nada encontrado</h2><p>Nenhum pedido com esses filtros.</p>' +
        '<div class="actions"><button type="button" class="btn" data-act="s-clear">Limpar filtros</button></div></div>';
      return;
    }
    const body = rows
      .map(
        (v) =>
          `<li class="rq-row">` +
          `<button type="button" class="rq-main" data-ropen="${esc(v.id)}">` +
          `<span class="rq-who"><b>${esc(v.personName)}</b><small>${esc(v.access || 'Sem acesso informado')}</small></span>` +
          `<span class="rq-store" data-l="Loja">${esc(v.store || '—')}</span>` +
          `<span class="rq-sector" data-l="Setor">${esc(v.sector || '—')}</span>` +
          `<span class="rq-date" data-l="Pedido">${esc(day(v.createdAt))}${v.requestedBy ? `<small>${esc(v.requestedBy)}</small>` : ''}</span>` +
          `<span class="rq-st">${pill(v.status)}</span></button>` +
          (v.status === 'pendente'
            ? `<button type="button" class="btn rq-done" data-rdone="${esc(v.id)}">Feito</button>`
            : '') +
          `</li>`,
      )
      .join('');
    root.innerHTML =
      `<div class="rq-head" aria-hidden="true"><span>Pessoa</span><span>Loja</span><span>Setor</span><span>Pedido</span><span>Situação</span></div>` +
      `<ul class="rq">${body}</ul>`;
  }

  // ---------- formulário ----------

  private openForm(id: string | null): void {
    const it = id ? this.items.find((x) => x.id === id) : undefined;
    this.editingId = it?.id ?? null;
    const canEdit = !it || this.admin;
    $('#sTitle').textContent = it ? 'Solicitação de acesso' : 'Nova solicitação de acesso';
    const set = (sel: string, value: string): void => {
      $<HTMLInputElement>(sel).value = value;
    };
    const stores = it?.store && !STORES.includes(it.store) ? [...STORES, it.store] : [...STORES];
    $<HTMLSelectElement>('#s-store').innerHTML =
      '<option value="">Escolha a loja</option>' +
      stores.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    set('#s-store', it?.store ?? '');
    set('#s-sector', it?.sector ?? '');
    set('#s-name', it?.personName ?? '');
    set('#s-access', it?.access ?? '');
    set('#s-notes', it?.notes ?? '');
    const used = (pick: (r: AccessRequest) => string, base: readonly string[]): string[] => [
      ...new Set([...base, ...this.items.map(pick).filter(Boolean)]),
    ];
    const opts = (list: string[]): string => list.map((v) => `<option value="${esc(v)}"></option>`).join('');
    $('#dl-sectors').innerHTML = opts(used((r) => r.sector, SECTORS));
    $('#dl-access').innerHTML = opts(used((r) => r.access, ACCESS_SUGGESTIONS));
    for (const sel of ['#s-store', '#s-sector', '#s-name', '#s-access', '#s-notes']) {
      $<HTMLInputElement>(sel).disabled = !canEdit;
    }

    // Resposta da TI: a TI edita; quem pediu só lê.
    $('#sTi').hidden = !it;
    $<HTMLSelectElement>('#s-status').innerHTML = REQUEST_STATUSES.map(
      (s) => `<option value="${s.id}">${esc(s.label)}</option>`,
    ).join('');
    set('#s-status', it?.status ?? 'pendente');
    set('#s-ti', it?.tiNotes ?? '');
    $<HTMLInputElement>('#s-status').disabled = !this.admin;
    $<HTMLInputElement>('#s-ti').disabled = !this.admin;

    $('#sBy').textContent = it
      ? [
          it.requestedBy
            ? `Pedido feito por ${it.requestedBy} em ${day(it.createdAt)}.`
            : `Pedido em ${day(it.createdAt)}.`,
          it.doneAt ? `Feito em ${day(it.doneAt)}.` : '',
        ]
          .filter(Boolean)
          .join(' ')
      : '';
    $('#sErr').textContent = '';
    $('#sDel').hidden = !it || !this.admin;
    $('#sSave').hidden = !canEdit;
    $('#sSave').textContent = it ? 'Salvar' : 'Enviar';

    if ($('#scrim').hidden) this.lastFocus = document.activeElement;
    $('#scrim').hidden = false;
    $('#sheetS').hidden = false;
    $('#app').inert = true;
    document.documentElement.classList.add('locked');
    if (canEdit) $(it ? '#s-ti' : '#s-store').focus();
  }

  private closeForm(): void {
    if ($('#sheetS').hidden) return;
    $('#sheetS').hidden = true;
    $('#scrim').hidden = true;
    $('#app').inert = false;
    document.documentElement.classList.remove('locked');
    if (this.lastFocus instanceof HTMLElement) this.lastFocus.focus();
  }

  private async submit(): Promise<void> {
    const f = (sel: string): string => $<HTMLInputElement>(sel).value;
    const read = readRequest({
      store: f('#s-store'),
      sector: f('#s-sector'),
      personName: f('#s-name'),
      access: f('#s-access'),
      notes: f('#s-notes'),
    });
    if ('error' in read) {
      $('#sErr').textContent = read.error;
      const ids: Record<string, string> = {
        store: '#s-store',
        sector: '#s-sector',
        personName: '#s-name',
      };
      $(ids[read.focus] ?? '#s-store').focus();
      return;
    }
    const prev = this.editingId ? this.items.find((x) => x.id === this.editingId) : undefined;
    let item: AccessRequest;
    if (prev) {
      const status = f('#s-status') as RequestStatus;
      item = setRequestStatus(applyRequestDraft(prev, read.draft), status, f('#s-ti'));
    } else item = createRequest(read.draft, this.account.toLowerCase());
    const btn = $<HTMLButtonElement>('#sSave');
    btn.disabled = true;
    try {
      await this.store.save(item);
      this.closeForm();
      toast(prev ? 'Alterações salvas' : 'Solicitação enviada');
    } catch (e) {
      $('#sErr').textContent = describeError(e);
    } finally {
      btn.disabled = false;
    }
  }

  private async markDone(id: string): Promise<void> {
    const prev = this.items.find((x) => x.id === id);
    if (!prev || prev.status === 'feito') return;
    try {
      await this.store.save(setRequestStatus(prev, 'feito'));
      toast(`Acesso de ${prev.personName} marcado como feito`);
    } catch (e) {
      toast(describeError(e));
    }
  }

  private async deleteCurrent(): Promise<void> {
    const id = this.editingId;
    if (!id) return;
    if (!window.confirm('Excluir esta solicitação?')) return;
    try {
      await this.store.remove(id);
      this.closeForm();
      toast('Solicitação excluída');
    } catch (e) {
      toast(describeError(e));
    }
  }
}
