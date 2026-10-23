import type { SellerStore } from '../data/sellerStore';
import { describeError } from '../data/store';
import {
  EMPTY_SELLER_FILTERS,
  SELLER_STATUSES,
  applySellerDraft,
  countByStatus,
  createSeller,
  filterSellers,
  readSeller,
  sellerToText,
  statusLabel,
  type SellerFilters,
  type SellerInput,
  type SellerRequest,
  type SellerStatus,
} from '../domain/seller';
import { $, esc, toast } from './dom';

const PILL: Record<SellerStatus, string> = { pendente: 'warn', criado: 'ok', cancelado: 'off' };

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

/** Tela "Cadastro de vendedores": pedidos com os campos do PESFM009 (TOTVS Moda) e andamento. */
export class SellerView {
  private items: SellerRequest[] = [];
  private ready = false;
  private active = false;
  private filters: SellerFilters = { ...EMPTY_SELLER_FILTERS };
  private editingId: string | null = null;
  private lastFocus: Element | null = null;

  constructor(
    private readonly store: SellerStore,
    private readonly account: string,
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
          e.message.includes('tabela vendedores')
            ? 'A tela de vendedores ainda não foi ativada no banco. Rode o SQL do guia.'
            : describeError(e),
        );
      },
    );
  }

  setActive(active: boolean): void {
    this.active = active;
    $('#hdrS').hidden = !active;
    $('#modS').hidden = !active;
    $('#addS').hidden = !active;
    if (active) this.render();
  }

  private bind(): void {
    $<HTMLInputElement>('#sSearch').addEventListener('input', (e) => {
      this.filters.query = (e.target as HTMLInputElement).value;
      this.render();
    });
    $('#sStatus').addEventListener('click', (e) => {
      const id = (e.target as Element).closest<HTMLElement>('[data-sstatus]')?.dataset.sstatus;
      if (id === 'all' || SELLER_STATUSES.some((s) => s.id === id)) {
        this.filters.status = id as SellerFilters['status'];
        this.render();
      }
    });
    $('#sList').addEventListener('click', (e) => {
      const target = e.target as Element;
      const card = target.closest<HTMLElement>('[data-sopen]');
      if (card?.dataset.sopen) return this.openForm(card.dataset.sopen);
      if (target.closest('[data-act="s-clear"]')) this.clearFilters();
    });
    $('#sEmpty').addEventListener('click', (e) => {
      const act = (e.target as Element).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 's-add') this.openForm(null);
      else if (act === 's-clear') this.clearFilters();
    });
    $('#addS').addEventListener('click', () => this.openForm(null));
    $('#sheetS').addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submit();
    });
    $('#sDel').addEventListener('click', () => void this.deleteCurrent());
    $('#sCopy').addEventListener('click', () => void this.copyCurrent());
    $('#sheetS').addEventListener('click', (e) => {
      if ((e.target as Element).closest('[data-close]')) this.closeForm();
    });
    $('#scrim').addEventListener('click', () => this.closeForm());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeForm();
    });
  }

  private clearFilters(): void {
    this.filters = { ...EMPTY_SELLER_FILTERS };
    $<HTMLInputElement>('#sSearch').value = '';
    this.render();
  }

  // ---------- telas ----------

  private render(): void {
    if (!this.active) return;
    const n = countByStatus(this.items);
    this.onSummary(
      !this.ready
        ? 'Carregando…'
        : this.items.length === 0
          ? 'Nenhum pedido ainda'
          : `${n.pendente} ${n.pendente === 1 ? 'pendente' : 'pendentes'} · ${this.items.length} no total`,
    );
    const chips = $('#sStatus');
    chips.hidden = this.items.length === 0;
    chips.innerHTML = [{ id: 'all', label: 'Todos', n: this.items.length }]
      .concat(SELLER_STATUSES.map((s) => ({ id: s.id as string, label: s.label, n: n[s.id] })))
      .map(
        (c) =>
          `<button type="button" class="chip" data-sstatus="${c.id}" aria-pressed="${this.filters.status === c.id}">${esc(c.label)} <span class="n">${c.n}</span></button>`,
      )
      .join('');
    this.renderList();
  }

  private cardHtml(v: SellerRequest): string {
    const bits = [v.sellerCode && `Cód. ${v.sellerCode}`, v.company && `Empresa ${v.company}`, v.sellerType]
      .filter(Boolean)
      .join(' · ');
    return (
      `<li><button type="button" class="card" data-sopen="${esc(v.id)}">` +
      `<span class="tile stile-s">${esc(initials(v.name))}</span>` +
      `<span class="body"><span class="row1"><span class="name">${esc(v.name)}</span>` +
      `<span class="pill ${PILL[v.status]}">${esc(statusLabel(v.status))}</span></span>` +
      (bits ? `<span class="sub">${esc(bits)}</span>` : '') +
      (v.requestedBy ? `<span class="sub">Pedido de ${esc(v.requestedBy)}</span>` : '') +
      `</span></button></li>`
    );
  }

  private renderList(): void {
    const list = $('#sList');
    const empty = $('#sEmpty');
    if (!this.ready) {
      list.innerHTML = '<li class="skel"></li>';
      empty.hidden = true;
      return;
    }
    if (this.items.length === 0) {
      list.innerHTML = '';
      empty.hidden = false;
      empty.innerHTML =
        '<h2>Nenhum pedido de vendedor</h2><p>Registre os dados da vendedora na ordem da tela PESFM009 do TOTVS Moda e acompanhe o que já foi criado.</p>' +
        '<div class="actions"><button type="button" class="btn primary" data-act="s-add">Novo pedido</button></div>';
      return;
    }
    const rows = filterSellers(this.items, this.filters);
    if (rows.length === 0) {
      list.innerHTML = '';
      empty.hidden = false;
      empty.innerHTML =
        '<h2>Nada encontrado</h2><p>Nenhum pedido com esses filtros.</p>' +
        '<div class="actions"><button type="button" class="btn" data-act="s-clear">Limpar filtros</button></div>';
      return;
    }
    empty.hidden = true;
    list.innerHTML = rows.map((v) => this.cardHtml(v)).join('');
  }

  // ---------- formulário ----------

  private openForm(id: string | null): void {
    const it = id ? this.items.find((x) => x.id === id) : undefined;
    this.editingId = it?.id ?? null;
    $('#sTitle').textContent = it ? 'Pedido de vendedor' : 'Novo pedido de vendedor';
    const set = (sel: string, value: string): void => {
      $<HTMLInputElement>(sel).value = value;
    };
    set('#s-name', it?.name ?? '');
    set('#s-code', it?.sellerCode ?? '');
    set('#s-person', it?.personCode ?? '');
    set('#s-company', it?.company ?? '');
    set('#s-aux', it?.auxCode ?? '');
    set('#s-type', it?.sellerType ?? '');
    $<HTMLInputElement>('#s-inactive').checked = it?.inactive ?? false;
    set('#s-ctable', it?.commTable ?? '');
    set('#s-cstart', it?.commStart ?? '');
    set('#s-cend', it?.commEnd ?? '');
    $<HTMLSelectElement>('#s-status').innerHTML = SELLER_STATUSES.map(
      (s) => `<option value="${s.id}">${esc(s.label)}</option>`,
    ).join('');
    set('#s-status', it?.status ?? 'pendente');
    set('#s-notes', it?.notes ?? '');
    $('#sBy').textContent = it?.requestedBy ? `Pedido feito por ${it.requestedBy}.` : '';
    $('#sErr').textContent = '';
    $('#sDel').hidden = !it;
    $('#sCopy').hidden = !it;
    const types = [...new Set(this.items.map((v) => v.sellerType).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    );
    $('#dl-stypes').innerHTML = types.map((t) => `<option value="${esc(t)}"></option>`).join('');

    if ($('#scrim').hidden) this.lastFocus = document.activeElement;
    $('#scrim').hidden = false;
    $('#sheetS').hidden = false;
    $('#app').inert = true;
    document.documentElement.classList.add('locked');
    $('#s-name').focus();
  }

  private closeForm(): void {
    if ($('#sheetS').hidden) return;
    $('#sheetS').hidden = true;
    $('#scrim').hidden = true;
    $('#app').inert = false;
    document.documentElement.classList.remove('locked');
    if (this.lastFocus instanceof HTMLElement) this.lastFocus.focus();
  }

  private input(): SellerInput {
    const f = (sel: string): string => $<HTMLInputElement>(sel).value;
    return {
      name: f('#s-name'),
      sellerCode: f('#s-code'),
      personCode: f('#s-person'),
      company: f('#s-company'),
      auxCode: f('#s-aux'),
      sellerType: f('#s-type'),
      inactive: $<HTMLInputElement>('#s-inactive').checked,
      commTable: f('#s-ctable'),
      commStart: f('#s-cstart'),
      commEnd: f('#s-cend'),
      status: f('#s-status'),
      notes: f('#s-notes'),
    };
  }

  private async submit(): Promise<void> {
    const read = readSeller(this.input());
    if ('error' in read) {
      $('#sErr').textContent = read.error;
      const ids: Record<string, string> = {
        name: '#s-name',
        commStart: '#s-cstart',
        commEnd: '#s-cend',
      };
      $(ids[read.focus] ?? '#s-name').focus();
      return;
    }
    const prev = this.editingId ? this.items.find((x) => x.id === this.editingId) : undefined;
    const item = prev ? applySellerDraft(prev, read.draft) : createSeller(read.draft, this.account);
    const btn = $<HTMLButtonElement>('#sSave');
    btn.disabled = true;
    try {
      await this.store.save(item);
      this.closeForm();
      toast(prev ? 'Alterações salvas' : 'Pedido adicionado');
    } catch (e) {
      $('#sErr').textContent = describeError(e);
    } finally {
      btn.disabled = false;
    }
  }

  private async copyCurrent(): Promise<void> {
    const read = readSeller(this.input());
    const base = this.editingId ? this.items.find((x) => x.id === this.editingId) : undefined;
    if (!base || 'error' in read) return;
    const text = sellerToText(applySellerDraft(base, read.draft));
    try {
      await navigator.clipboard.writeText(text);
      toast('Dados copiados');
    } catch {
      window.prompt('Copie os dados abaixo:', text);
    }
  }

  private async deleteCurrent(): Promise<void> {
    const id = this.editingId;
    if (!id) return;
    if (!window.confirm('Excluir este pedido de vendedor?')) return;
    try {
      await this.store.remove(id);
      this.closeForm();
      toast('Pedido excluído');
    } catch (e) {
      toast(describeError(e));
    }
  }
}
