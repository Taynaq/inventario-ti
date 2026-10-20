import {
  AccessApi,
  accessErrorMessage,
  isValidEmail,
  normalizeEmail,
  type AccessEntry,
} from '../data/access';
import { $, esc, toast } from './dom';

/** Aba "Acessos": o administrador libera e remove os e-mails que podem usar o app. */
export class AccessView {
  private entries: AccessEntry[] = [];
  private loaded = false;
  private error = '';

  constructor(
    private readonly root: HTMLElement,
    private readonly api: AccessApi,
  ) {
    root.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.add();
    });
    root.addEventListener('click', (e) => {
      const el = (e.target as Element).closest<HTMLElement>('[data-act]');
      const email = el?.dataset.email ?? '';
      if (el?.dataset.act === 'acc-rm') void this.remove(email);
      else if (el?.dataset.act === 'acc-admin') void this.toggleAdmin(email);
      else if (el?.dataset.act === 'acc-link') void this.copyLink();
    });
    this.render();
  }

  /** Chamado ao abrir a aba. */
  async refresh(): Promise<void> {
    try {
      this.entries = await this.api.list();
      this.error = '';
    } catch (e) {
      this.error = accessErrorMessage(e);
    }
    this.loaded = true;
    this.render();
  }

  private appUrl(): string {
    return `${location.origin}${location.pathname}`;
  }

  private render(): void {
    const rows = this.entries
      .map((a) => {
        const me = a.email === this.api.me;
        return (
          `<li class="acc-row"><div class="acc-who"><span class="acc-mail">${esc(a.email)}</span>` +
          `<span class="sub">${me ? 'Você' : a.isAdmin ? 'Administrador' : 'Pode usar o app'}${me && a.isAdmin ? ' · Administrador' : ''}</span></div>` +
          (me
            ? ''
            : `<div class="acc-btns"><button type="button" class="btn" data-act="acc-admin" data-email="${esc(a.email)}">` +
              `${a.isAdmin ? 'Tirar admin' : 'Tornar admin'}</button>` +
              `<button type="button" class="btn danger" data-act="acc-rm" data-email="${esc(a.email)}">Remover</button></div>`) +
          `</li>`
        );
      })
      .join('');

    this.root.innerHTML =
      `<section class="imp-card"><h2>Liberar uma pessoa</h2>` +
      `<p class="muted">Digite o e-mail da pessoa. Depois peça para ela abrir o app, tocar em <strong>Criar conta</strong> ` +
      `com esse mesmo e-mail e escolher a própria senha.</p>` +
      `<form id="acc-form" novalidate><div class="field"><label for="acc-email">E-mail da pessoa</label>` +
      `<input id="acc-email" type="email" inputmode="email" autocomplete="off" placeholder="nome@empresa.com.br" /></div>` +
      `<label class="checkrow"><input id="acc-admin" type="checkbox" />Também pode liberar e remover pessoas (administrador)</label>` +
      `<p class="msg bad" id="acc-err" role="alert">${esc(this.error)}</p>` +
      `<button type="submit" class="btn primary">Liberar acesso</button></form></section>` +
      `<section class="imp-card"><h2>Quem tem acesso</h2>` +
      (this.loaded
        ? this.entries.length === 0
          ? '<p class="muted">Ninguém ainda.</p>'
          : `<ul class="acc-list">${rows}</ul>`
        : '<p class="muted">Carregando…</p>') +
      `</section>` +
      `<section class="imp-card"><h2>Link do app</h2>` +
      `<p class="muted">Envie este link para as pessoas que você liberou.</p>` +
      `<p class="acc-link">${esc(this.appUrl())}</p>` +
      `<button type="button" class="btn" data-act="acc-link">Copiar link</button></section>`;
  }

  private setError(message: string): void {
    this.error = message;
    const el = this.root.querySelector('#acc-err');
    if (el) el.textContent = message;
  }

  private async add(): Promise<void> {
    const email = normalizeEmail($<HTMLInputElement>('#acc-email').value);
    const admin = $<HTMLInputElement>('#acc-admin').checked;
    if (!isValidEmail(email)) return this.setError('Digite um e-mail válido, como nome@empresa.com.br.');
    try {
      await this.api.add(email, admin);
      toast(`${email} liberado`);
      this.error = '';
      await this.refresh();
    } catch (e) {
      this.setError(accessErrorMessage(e));
    }
  }

  private async remove(email: string): Promise<void> {
    if (!window.confirm(`Remover o acesso de ${email}? A pessoa deixa de ver os equipamentos.`)) return;
    try {
      await this.api.remove(email);
      toast('Acesso removido');
      await this.refresh();
    } catch (e) {
      toast(accessErrorMessage(e));
    }
  }

  private async toggleAdmin(email: string): Promise<void> {
    const current = this.entries.find((a) => a.email === email)?.isAdmin ?? false;
    try {
      await this.api.setAdmin(email, !current);
      await this.refresh();
    } catch (e) {
      toast(accessErrorMessage(e));
    }
  }

  private async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.appUrl());
      toast('Link copiado');
    } catch {
      toast('Não consegui copiar. Selecione o link e copie.');
    }
  }
}
