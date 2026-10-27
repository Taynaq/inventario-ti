// Função do Supabase (Edge Function) que deixa o administrador do app criar o login de uma pessoa
// já com a senha, sem e-mail de confirmação, e trocar a senha de quem já tem conta.
//
// Por que existe: criar usuário com senha exige a chave "service_role", que NUNCA pode ficar no app.
// Aqui ela fica guardada no servidor do Supabase (já vem pronta no ambiente da função).
// A função só obedece se quem chamou estiver logado e for administrador (is_admin na allowed_emails).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (status: number, body: Record<string, unknown>): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const MODULES = ['inventario', 'quebras', 'solicitacoes'];
const emailOk = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });

  try {
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!url || !anon || !service) return reply(500, { error: 'Função sem as chaves do projeto.' });

    // 1. Quem está chamando?
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: who } = await caller.auth.getUser();
    const callerEmail = who.user?.email?.toLowerCase();
    if (!callerEmail) return reply(401, { error: 'Entre no app de novo.' });

    // 2. É administrador?
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: me } = await admin
      .from('allowed_emails')
      .select('is_admin')
      .eq('email', callerEmail)
      .maybeSingle();
    if (me?.is_admin !== true) return reply(403, { error: 'Só administradores podem fazer isso.' });

    // 3. O que foi pedido?
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action ?? '');
    const email = String(body.email ?? '')
      .trim()
      .toLowerCase();
    const password = String(body.password ?? '');
    if (!emailOk(email)) return reply(400, { error: 'E-mail inválido.' });
    if (password.length < 8) return reply(400, { error: 'A senha precisa ter pelo menos 8 caracteres.' });

    if (action === 'create') {
      const isAdmin = body.isAdmin === true;
      const modules = Array.isArray(body.modules)
        ? (body.modules as unknown[]).filter((m): m is string => typeof m === 'string' && MODULES.includes(m))
        : [];
      if (!isAdmin && modules.length === 0) return reply(400, { error: 'Marque pelo menos uma tela.' });

      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error) {
        const taken = /already|registered|exists/i.test(created.error.message);
        return reply(taken ? 409 : 400, {
          error: taken
            ? 'Essa pessoa já tem conta. Use "Nova senha" na lista de acessos.'
            : created.error.message,
        });
      }
      const saved = await admin
        .from('allowed_emails')
        .upsert({ email, is_admin: isAdmin, modules }, { onConflict: 'email' });
      if (saved.error)
        return reply(500, { error: `Conta criada, mas não liberou as telas: ${saved.error.message}` });
      return reply(200, { ok: true });
    }

    if (action === 'set_password') {
      // Procura a conta pelo e-mail (a lista é paginada).
      let id: string | null = null;
      for (let page = 1; page <= 10 && !id; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) return reply(500, { error: error.message });
        id = data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
        if (data.users.length < 1000) break;
      }
      if (!id) return reply(404, { error: 'Essa pessoa ainda não tem conta. Crie o login com senha.' });
      const updated = await admin.auth.admin.updateUserById(id, { password, email_confirm: true });
      if (updated.error) return reply(400, { error: updated.error.message });
      return reply(200, { ok: true });
    }

    return reply(400, { error: 'Pedido desconhecido.' });
  } catch (e) {
    return reply(500, { error: e instanceof Error ? e.message : 'Erro inesperado.' });
  }
});
