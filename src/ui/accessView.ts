import {
  AccessApi,
  accessErrorMessage,
  isValidEmail,
  normalizeEmail,
  type AccessEntry,
} from '../data/access';
import { generatePassword, credentialMessage, isValidPassword, MIN_PASSWORD } from '../domain/credentials';
import { APP_NAME, MODULES, isModuleId, type ModuleId } from '../modules';
import { $, esc, toast } from './dom';

const moduleChecks = (name: string, checked: readonly ModuleId[], extra = ''): string =>
  MODULES.map(
    (m) =>
      `<label class="checkrow"><input type="checkbox" name="${name}" value="${m.id}"${
        checked.includes(m.id) ? ' checked' : ''
      }${extra} />${esc(m.label)}</label>`,
  ).join('');

/** Aba "Acessos": o administrador libera pessoas e escolhe quais telas cada uma pode usar. */
export class AccessView {
  private entries: AccessEntry[] = [];
  private loaded = false;
  private error = '';
  /** Último login criado ou senha trocada, para copiar e mandar à pessoa. */
  private creds: { email: string; password: string } | null = null;

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
      else if (el?.dataset.act === 'acc-gen') this.fillGenerated();
      else if (el?.dataset.act === 'acc-reset') void this.resetPassword(email);
      else if (el?.dataset.act === 'acc-copy-creds') void this.copyCreds();
      else if (el?.dataset.act === 'acc-wa-creds') this.shareCreds();
      else if (el?.dataset.act === 'acc-close-creds') {
        this.creds = null;
        this.render();
      }
    });
    root.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.rowmodule && t.dataset.email) void this.toggleModule(t.dataset.email, t.value, t.checked);
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

  private rowHtml(a: AccessEntry): string {
    const me = a.email === this.api.me;
    const who = me ? 'Você' : a.isAdmin ? 'Administrador' : 'Telas liberadas';
    const modules = a.isAdmin
      ? '<p class="sub">Administrador: acessa todas as telas e esta aba de acessos.</p>'
      : `<div class="acc-mods">${MODULES.map(
          (m) =>
            `<label class="checkrow"><input type="checkbox" data-rowmodule="1" data-email="${esc(a.email)}" value="${m.id}"${
              a.modules.includes(m.id) ? ' checked' : ''
            } />${esc(m.label)}</label>`,
        ).join('')}</div>`;
    return (
      `<li class="acc-row"><div class="acc-who"><span class="acc-mail">${esc(a.email)}</span>` +
      `<span class="sub">${who}${me && a.isAdmin ? ' · Administrador' : ''}</span></div>` +
      modules +
      (me
        ? ''
        : `<div class="acc-btns"><button type="button" class="btn" data-act="acc-reset" data-email="${esc(a.email)}">Nova senha</button>` +
          `<button type="button" class="btn" data-act="acc-admin" data-email="${esc(a.email)}">` +
          `${a.isAdmin ? 'Tirar admin' : 'Tornar admin'}</button>` +
          `<button type="button" class="btn danger" data-act="acc-rm" data-email="${esc(a.email)}">Remover</button></div>`) +
      `</li>`
    );
  }

  private render(): void {
    const c = this.creds;
    const credsCard = c
      ? `<section class="imp-card creds"><h2>Acesso pronto</h2>` +
        `<p class="muted">Envie estes dados para a pessoa agora. Por segurança, a senha não aparece de novo depois que você fechar este aviso.</p>` +
        `<pre class="creds-box">${esc(this.credsText(c))}</pre>` +
        `<div class="acc-btns"><button type="button" class="btn primary" data-act="acc-copy-creds">Copiar mensagem</button>` +
        `<button type="button" class="btn" data-act="acc-wa-creds">WhatsApp</button>` +
        `<button type="button" class="btn" data-act="acc-close-creds">Fechar</button></div></section>`
      : '';
    this.root.innerHTML =
      credsCard +
      `<section class="imp-card"><h2>Liberar uma pessoa</h2>` +
      `<p class="muted">Digite o e-mail, defina uma senha e marque as telas que ela pode usar. O login já fica pronto, ` +
      `sem e-mail de confirmação, e você envia a senha para a pessoa. Se deixar a senha em branco, ela cria a própria ` +
      `em <strong>Criar conta</strong>.</p>` +
      `<form id="acc-form" novalidate><div class="field"><label for="acc-email">E-mail da pessoa</label>` +
      `<input id="acc-email" type="email" inputmode="email" autocomplete="off" placeholder="nome@empresa.com.br" /></div>` +
      `<div class="field"><label for="acc-pass">Senha (mínimo ${MIN_PASSWORD} caracteres)</label>` +
      `<div class="passrow"><input id="acc-pass" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Digite ou toque em Gerar" />` +
      `<button type="button" class="btn" data-act="acc-gen">Gerar</button></div></div>` +
      `<div class="field"><span class="lbl">Telas liberadas</span>${moduleChecks('acc-new', [])}</div>` +
      `<label class="checkrow"><input id="acc-admin" type="checkbox" />Administrador (acessa todas as telas e libera pessoas)</label>` +
      `<p class="msg bad" id="acc-err" role="alert">${esc(this.error)}</p>` +
      `<button type="submit" class="btn primary">Criar acesso</button></form></section>` +
      `<section class="imp-card"><h2>Quem tem acesso</h2>` +
      (this.loaded
        ? this.entries.length === 0
          ? '<p class="muted">Ninguém ainda.</p>'
          : `<ul class="acc-list">${this.entries.map((a) => this.rowHtml(a)).join('')}</ul>`
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
    const modules = [...this.root.querySelectorAll<HTMLInputElement>('input[name="acc-new"]:checked')]
      .map((i) => i.value)
      .filter(isModuleId);
    if (!isValidEmail(email)) return this.setError('Digite um e-mail válido, como nome@empresa.com.br.');
    if (!admin && modules.length === 0) return this.setError('Marque pelo menos uma tela para essa pessoa.');
    const password = $<HTMLInputElement>('#acc-pass').value;
    if (password && !isValidPassword(password)) {
      return this.setError(`A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`);
    }
    const btn = this.root.querySelector<HTMLButtonElement>('#acc-form button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      if (password) {
        await this.api.createUser(email, password, admin, modules);
        this.creds = { email, password };
        toast(`Login de ${email} criado`);
      } else {
        await this.api.add(email, admin, modules);
        toast(`${email} liberado`);
      }
      this.error = '';
      await this.refresh();
      if (this.creds) window.scrollTo(0, 0);
    } catch (e) {
      this.setError(accessErrorMessage(e));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  private credsText(c: { email: string; password: string }): string {
    return credentialMessage({ appName: APP_NAME, url: this.appUrl(), email: c.email, password: c.password });
  }

  private fillGenerated(): void {
    $<HTMLInputElement>('#acc-pass').value = generatePassword();
  }

  private async resetPassword(email: string): Promise<void> {
    if (!window.confirm(`Gerar uma nova senha para ${email}? A senha antiga deixa de funcionar.`)) return;
    const password = generatePassword();
    try {
      await this.api.setPassword(email, password);
      this.creds = { email, password };
      toast('Nova senha criada');
      this.render();
      window.scrollTo(0, 0);
    } catch (e) {
      toast(accessErrorMessage(e));
    }
  }

  private async copyCreds(): Promise<void> {
    if (!this.creds) return;
    try {
      await navigator.clipboard.writeText(this.credsText(this.creds));
      toast('Mensagem copiada');
    } catch {
      toast('Não consegui copiar. Selecione o texto e copie.');
    }
  }

  private shareCreds(): void {
    if (!this.creds) return;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(this.credsText(this.creds))}`,
      '_blank',
      'noopener',
    );
  }

  private async toggleModule(email: string, id: string, on: boolean): Promise<void> {
    if (!isModuleId(id)) return;
    const current = this.entries.find((a) => a.email === email)?.modules ?? [];
    const next = on ? [...new Set([...current, id])] : current.filter((m) => m !== id);
    try {
      await this.api.setModules(email, next);
      toast('Telas atualizadas');
    } catch (e) {
      toast(accessErrorMessage(e));
    }
    await this.refresh();
  }

  private async remove(email: string): Promise<void> {
    if (!window.confirm(`Remover o acesso de ${email}? A pessoa deixa de usar o app.`)) return;
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
