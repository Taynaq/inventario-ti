import type { SupabaseClient } from '@supabase/supabase-js';
import { $, esc } from './dom';

type Mode = 'login' | 'recovery' | 'denied';

/**
 * Mostra o login até a pessoa entrar e estar liberada (e-mail cadastrado em
 * `allowed_emails`). Devolve o e-mail da pessoa.
 */
export function requireMember(db: SupabaseClient): Promise<string> {
  const root = $('#auth');
  root.hidden = false;

  return new Promise((resolve) => {
    let finished = false;

    const finish = (email: string): void => {
      if (finished) return;
      finished = true;
      root.hidden = true;
      root.innerHTML = '';
      resolve(email);
    };

    const isMember = async (): Promise<boolean> => {
      const { data, error } = await db.rpc('is_member');
      return !error && data === true;
    };

    const afterSignIn = async (email: string): Promise<void> => {
      if (await isMember()) finish(email);
      else render('denied', email);
    };

    const render = (mode: Mode, email = '', notice = '', bad = false): void => {
      if (mode === 'denied') {
        root.innerHTML = `
          <div class="auth-card">
            <h1>Ativos TI</h1>
            <p><strong>${esc(email)}</strong> ainda não foi liberado para usar este inventário.</p>
            <p>Peça ao administrador para incluir seu e-mail na lista de acesso e entre de novo.</p>
            <button type="button" class="btn" id="auth-out">Sair</button>
          </div>`;
        $('#auth-out').addEventListener('click', async () => {
          await db.auth.signOut();
          render('login');
        });
        return;
      }

      const recovery = mode === 'recovery';
      root.innerHTML = `
        <div class="auth-card">
          <h1>Ativos TI</h1>
          <p>${recovery ? 'Defina uma nova senha.' : 'Entre com seu e-mail de trabalho.'}</p>
          <form id="auth-form" novalidate>
            ${
              recovery
                ? ''
                : `<div class="field"><label for="auth-email">E-mail</label>
                   <input id="auth-email" type="email" inputmode="email" autocomplete="email" value="${esc(email)}" /></div>`
            }
            <div class="field"><label for="auth-pass">${recovery ? 'Nova senha' : 'Senha'}</label>
              <input id="auth-pass" type="password" autocomplete="${recovery ? 'new-password' : 'current-password'}" /></div>
            <p class="msg ${bad ? 'bad' : 'ok'}" id="auth-msg" role="alert">${esc(notice)}</p>
            ${
              recovery
                ? '<button type="submit" class="btn primary" id="auth-main">Salvar nova senha</button>'
                : `<div class="auth-actions">
                     <button type="submit" class="btn primary" id="auth-main">Entrar</button>
                     <button type="button" class="btn" id="auth-signup">Criar conta</button>
                   </div>
                   <button type="button" class="link" id="auth-forgot">Esqueci a senha</button>`
            }
          </form>
        </div>`;

      const form = $<HTMLFormElement>('#auth-form');
      const msg = (text: string, isBad = true): void => {
        const m = $('#auth-msg');
        m.textContent = text;
        m.className = `msg ${isBad ? 'bad' : 'ok'}`;
      };
      const busy = (on: boolean): void => {
        form.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = on));
      };
      const read = (): { email: string; password: string } => ({
        email: recovery ? '' : $<HTMLInputElement>('#auth-email').value.trim(),
        password: $<HTMLInputElement>('#auth-pass').value,
      });
      const check = (v: { email: string; password: string }): string | null => {
        if (!recovery && !/^\S+@\S+\.\S+$/.test(v.email)) return 'Informe um e-mail válido.';
        if (v.password.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
        return null;
      };

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = read();
        const problem = check(v);
        if (problem) return msg(problem);
        busy(true);
        try {
          if (recovery) {
            const { data, error } = await db.auth.updateUser({ password: v.password });
            if (error) return msg('Não foi possível salvar a senha. Peça um novo link de recuperação.');
            history.replaceState(null, '', location.pathname);
            await afterSignIn(data.user?.email ?? '');
          } else {
            const { data, error } = await db.auth.signInWithPassword(v);
            if (error) {
              return msg(
                /confirm/i.test(error.message)
                  ? 'Confirme seu e-mail pelo link que enviamos e tente de novo.'
                  : 'E-mail ou senha incorretos.',
              );
            }
            await afterSignIn(data.user.email ?? v.email);
          }
        } finally {
          busy(false);
        }
      });

      if (!recovery) {
        $('#auth-signup').addEventListener('click', async () => {
          const v = read();
          const problem = check(v);
          if (problem) return msg(problem);
          busy(true);
          try {
            const { data, error } = await db.auth.signUp({
              ...v,
              options: { emailRedirectTo: location.origin + location.pathname },
            });
            if (error) return msg('Não foi possível criar a conta. Tente de novo.');
            if (data.session) await afterSignIn(v.email);
            else msg('Enviamos um e-mail de confirmação. Abra o link e depois entre aqui.', false);
          } finally {
            busy(false);
          }
        });

        $('#auth-forgot').addEventListener('click', async () => {
          const { email: typed } = read();
          if (!/^\S+@\S+\.\S+$/.test(typed)) return msg('Digite seu e-mail acima para receber o link.');
          busy(true);
          try {
            await db.auth.resetPasswordForEmail(typed, { redirectTo: location.origin + location.pathname });
            // Mesma resposta exista a conta ou não, para não revelar quem tem acesso.
            msg('Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.', false);
          } finally {
            busy(false);
          }
        });
      }
    };

    // Link de recuperação de senha: o Supabase abre uma sessão temporária e avisa por este evento.
    let recovering = false;
    db.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        recovering = true;
        render('recovery');
      }
    });

    void (async () => {
      // getSession espera o Supabase terminar de ler a URL, então o evento acima já chegou se houver.
      const { data } = await db.auth.getSession();
      const user = data.session?.user;
      if (recovering) return;
      if (user) await afterSignIn(user.email ?? '');
      else render('login');
    })();
  });
}

export async function signOut(db: SupabaseClient): Promise<void> {
  await db.auth.signOut();
  location.reload();
}
