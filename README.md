# Central de Gestão

Aplicativo web para celular que controla os equipamentos de TI da empresa: notebooks, celulares, monitores, impressoras, rede e o que mais você tiver. Cada equipamento tem responsável, local, número de série, patrimônio, status, data de compra, garantia e valor. O app avisa quando uma garantia está vencida ou perto de vencer.

Gratuito e de código aberto (licença MIT). Funciona no navegador do celular e pode ser instalado na tela inicial.

## Dois modos de uso

| Modo               | Para quem                         | Dados ficam                    | Login               |
| ------------------ | --------------------------------- | ------------------------------ | ------------------- |
| **Local** (padrão) | Testar ou uso individual          | Só no navegador de cada pessoa | Não                 |
| **Compartilhado**  | A equipe toda no mesmo inventário | No Supabase (plano gratuito)   | Sim, e-mail e senha |

O modo é escolhido pelas variáveis de ambiente. Sem elas, o app roda em modo local.

## Telas do app

A **Central de Gestão** reúne várias telas, e cada pessoa vê só as que o administrador liberou:

- **Inventário de TI:** equipamentos, painel e importação de PDF/CSV.
- **Quebra de máquinas:** registro de dia, máquina, grupo e peças perdidas, com filtro por período e grupo, aba Por data e resumo por máquina, grupo e dia.
- **Solicitação de acessos:** quem tem a tela (por exemplo o RH) pede o acesso de uma pessoa, escolhendo a loja e o setor e informando o nome. A aba **Fila da TI** (só administradores) mostra todos os pedidos, com filtro por situação e loja, e permite marcar como **Feito** com observações. Quem pediu vê só os próprios pedidos e acompanha a situação. A lista de lojas fica em `src/domain/request.ts`.
- **Acessos** (só administradores): libera e remove e-mails e escolhe as telas de cada pessoa. O administrador pode criar o login já com senha (função `supabase/functions/criar-usuario`, sem e-mail de confirmação) e mandar a mensagem pronta pelo WhatsApp, ou só liberar o e-mail para a pessoa criar a própria conta e senha na tela de login.

Para acrescentar uma tela nova, cadastre-a em `src/modules.ts` e em `supabase/schema.sql` (função `my_modules` e as regras da tabela). Veja o `GUIA-BANCO-DE-DADOS.md`.

## Painel e importação

- **Painel:** total, valor em ativos, situação, garantias vencendo, e quebras por categoria, local, responsável e idade. Tocar numa barra abre a lista filtrada.
- **Importar:** escolha um **PDF** com a tabela de equipamentos (ou um **CSV**). O app reconhece as colunas pelos títulos, mostra uma prévia, você ajusta se precisar, e importa. Equipamentos com o mesmo patrimônio ou série são ignorados, e dá para **desfazer** a última importação.
- Limites: o PDF precisa ter texto selecionável. PDF de foto/digitalização não funciona; nesse caso exporte do Excel como CSV. O app não traz equipamentos de exemplo.

## Rodar no VS Code

Você precisa do [Node.js](https://nodejs.org) 20 ou mais novo e do [Git](https://git-scm.com).

```bash
git clone https://github.com/Taynaq/inventario-ti.git
cd inventario-ti
code .          # abre no VS Code; aceite instalar as extensões recomendadas
npm install
npm run dev     # abre em http://localhost:5173
```

Para ver no celular durante o desenvolvimento, rode `npm run dev -- --host` e abra o endereço de rede que o terminal mostrar (celular e computador na mesma rede Wi-Fi).

### Comandos

| Comando             | O que faz                                          |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Servidor de desenvolvimento com recarga automática |
| `npm test`          | Roda os testes                                     |
| `npm run typecheck` | Confere os tipos do TypeScript                     |
| `npm run format`    | Formata o código com Prettier                      |
| `npm run build`     | Gera a versão final na pasta `dist/`               |
| `npm run preview`   | Abre a versão final localmente                     |

## Ligar o modo compartilhado (Supabase)

Guia mais simples, com todos os passos: [GUIA-BANCO-DE-DADOS.md](GUIA-BANCO-DE-DADOS.md).

1. Crie uma conta e um projeto gratuito em [supabase.com](https://supabase.com).
2. No projeto, abra **SQL Editor**, cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**. Isso cria as tabelas e as regras de acesso.
3. Libere seu e-mail: no **SQL Editor** rode `insert into public.allowed_emails (email) values ('voce@suaempresa.com.br');` (em minúsculas). Para liberar outras pessoas, adicione mais e-mails na tabela `allowed_emails` pelo **Table Editor**.
4. Em **Authentication > Providers > Email**, deixe **Confirm email** ligado. Isso garante que só o dono de um e-mail consegue entrar com ele.
5. Em **Project Settings > API**, copie a **Project URL** e a chave **anon** (ou **publishable**).
6. Copie `.env.example` para `.env` e preencha as duas variáveis. Rode `npm run dev` de novo.
7. Quando publicar o app (próxima seção), vá em **Authentication > URL Configuration** e coloque o endereço publicado em **Site URL**. Sem isso os links de confirmação de e-mail e de recuperação de senha apontam para o lugar errado.

**Segurança:** a chave `anon` fica visível no código do app, e isso é esperado. Quem protege os dados são as regras do banco (RLS): só entra quem está logado **e** está na lista `allowed_emails`. Nunca use a chave `service_role` no app.

## Publicar para os colaboradores (GitHub Pages, gratuito)

O repositório já traz o workflow [`deploy.yml`](.github/workflows/deploy.yml), que roda os testes, gera o app e publica a cada envio para a branch `main`.

1. No GitHub, abra **Settings > Pages** e em **Source** escolha **GitHub Actions**.
2. Para o modo compartilhado, abra **Settings > Secrets and variables > Actions > Variables** e crie `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com os mesmos valores do `.env`. Sem elas, a versão publicada roda em modo local.
3. Envie qualquer alteração para a `main` (ou rode o workflow manualmente na aba **Actions**).
4. O endereço fica em `https://Taynaq.github.io/inventario-ti/`. Mande o link para a equipe.

**Repositório público ou privado:** o GitHub Pages grátis exige repositório **público**. Isso é seguro aqui, porque o código não contém segredos e os dados ficam protegidos no Supabase. Se preferir manter o repositório privado, publique em [Cloudflare Pages](https://pages.cloudflare.com) ou [Netlify](https://www.netlify.com) (ambos têm plano gratuito): comando de build `npm run build`, pasta de saída `dist`, e as duas variáveis acima.

**Instalar no celular:** abra o endereço no navegador e use **Adicionar à tela inicial** (Android: menu do Chrome; iPhone: botão Compartilhar do Safari).

## Como o código está organizado

```
src/
  types.ts            tipos do equipamento e dos filtros
  domain/             regras do negócio, sem tela e sem banco (testadas)
    catalog.ts          categorias e status
    warranty.ts         aviso de garantia
    filter.ts           busca, filtros e resumo
    format.ts           datas, dinheiro e busca sem acento
    equipment.ts        criar, validar e atualizar equipamentos
    dashboard.ts        números do Painel
    importing.ts        leitura de tabelas de PDF/CSV e conversão em equipamentos
  data/               onde os dados ficam
    store.ts            contrato comum (interface Store)
    localStore.ts       implementação no navegador
    cloudStore.ts       implementação no Supabase, com tempo real
    pdfText.ts          extrai o texto do PDF (carregado só ao importar)
    supabaseClient.ts   cria o cliente a partir do .env
  ui/                 telas
    inventoryView.ts    abas, lista, filtros, cadastro, detalhe
    dashboardView.ts    aba Painel
    importView.ts       aba Importar
    auth.ts             login, cadastro e recuperação de senha
    dom.ts, icons.ts    utilitários
  main.ts             escolhe o modo e inicia o app
supabase/schema.sql   tabelas, regras de acesso e tempo real
```

A tela só conversa com a interface `Store`. Para trocar o Supabase por outro banco, basta escrever uma nova implementação dessa interface.

## Contribuir

Veja [CONTRIBUTING.md](CONTRIBUTING.md).

## Licença

[MIT](LICENSE).
