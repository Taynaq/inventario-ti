import type { SupabaseClient } from '@supabase/supabase-js';
import { MIN_PASSWORD, isValidPassword } from '../domain/credentials';
import { $, toast } from './dom';

/** Botão "Senha" do topo: a própria pessoa troca a senha (útil depois de receber uma senha provisória). */
export class PasswordDialog {
  private lastFocus: Element | null = null;

  constructor(private readonly db: SupabaseClient) {}

  mount(): void {
    const btn = $('#changePwd');
    btn.hidden = false;
    btn.addEventListener('click', () => this.open());
    $('#sheetPwd').addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submit();
    });
    $('#sheetPwd').addEventListener('click', (e) => {
      if ((e.target as Element).closest('[data-close]')) this.close();
    });
    $('#scrim').addEventListener('click', () => this.close());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
  }

  private open(): void {
    $<HTMLInputElement>('#pwd-new').value = '';
    $<HTMLInputElement>('#pwd-again').value = '';
    $('#pwdErr').textContent = '';
    if ($('#scrim').hidden) this.lastFocus = document.activeElement;
    $('#scrim').hidden = false;
    $('#sheetPwd').hidden = false;
    $('#app').inert = true;
    document.documentElement.classList.add('locked');
    $('#pwd-new').focus();
  }

  private close(): void {
    if ($('#sheetPwd').hidden) return;
    $('#sheetPwd').hidden = true;
    $('#scrim').hidden = true;
    $('#app').inert = false;
    document.documentElement.classList.remove('locked');
    if (this.lastFocus instanceof HTMLElement) this.lastFocus.focus();
  }

  private async submit(): Promise<void> {
    const a = $<HTMLInputElement>('#pwd-new').value;
    const b = $<HTMLInputElement>('#pwd-again').value;
    const fail = (msg: string): void => {
      $('#pwdErr').textContent = msg;
    };
    if (!isValidPassword(a)) return fail(`A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`);
    if (a !== b) return fail('As duas senhas não são iguais.');
    const btn = $<HTMLButtonElement>('#pwdSave');
    btn.disabled = true;
    try {
      const { error } = await this.db.auth.updateUser({ password: a });
      if (error) {
        fail(
          /same|different/i.test(error.message)
            ? 'Escolha uma senha diferente da atual.'
            : 'Não foi possível trocar a senha. Tente de novo.',
        );
        return;
      }
      this.close();
      toast('Senha trocada');
    } finally {
      btn.disabled = false;
    }
  }
}
