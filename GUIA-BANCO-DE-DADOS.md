# Central de Gestão: ligar o banco de dados e o login (passo a passo)

Faça isto uma vez. Depois disso, todos os colaboradores veem os mesmos equipamentos e entram com e-mail e senha.

## 1. Criar o banco (Supabase, grátis)

1. Abra https://supabase.com e clique em **Start your project**. Entre com sua conta do GitHub.
2. Clique em **New project**. Dê o nome `inventario-ti`, crie uma senha do banco (guarde) e escolha a região **South America (São Paulo)**. Clique em **Create new project** e espere 1 a 2 minutos.

## 2. Criar as tabelas

1. No menu da esquerda, clique em **SQL Editor** e depois em **New query**.
2. Abra o arquivo `supabase/schema.sql` deste projeto, copie **tudo**, cole no Supabase e clique em **Run**. Deve aparecer "Success".

## 3. Tornar você administrador

No **SQL Editor**, em **New query**, cole e rode, trocando pelo seu e-mail (em minúsculas):

```
insert into public.allowed_emails (email, is_admin) values ('seu@email.com', true)
  on conflict (email) do update set is_admin = true;
```

Administrador acessa todas as telas e vê a aba **Acessos**.

## 3b. Liberar as outras pessoas (dentro do app)

Na aba **Acessos** do app, você digita o e-mail de cada pessoa, marca **quais telas ela pode usar** (Inventário de TI, Quebra de máquinas…) e toca em **Liberar acesso**. Depois, a pessoa abre o app, toca em **Criar conta** com aquele e-mail e escolhe a própria senha. Você pode mudar as telas de cada pessoa a qualquer momento.

**Se você já tinha rodado o `schema.sql` antes:** rode de novo o arquivo inteiro. Ele é seguro de repetir e acrescenta as telas liberadas por pessoa e a tabela de quebras. As pessoas que já estavam liberadas continuam com acesso ao Inventário de TI.

## 3c. Criar o login já com senha (sem e-mail de confirmação)

Para você mesma criar o login de alguém, definir a senha e enviar pelo WhatsApp, o Supabase precisa de uma pequena função. Faça uma vez só:

1. No Supabase, abra **Edge Functions** (menu da esquerda) e clique em **Deploy a new function**, depois em **Via Editor** (os nomes dos botões podem variar um pouco).
2. Dê o nome exatamente `criar-usuario`.
3. Apague o texto de exemplo, abra o arquivo `supabase/functions/criar-usuario/index.ts` deste projeto, copie **tudo**, cole no editor e clique em **Deploy**.

Pronto. Na aba **Acessos** do app, digite o e-mail, toque em **Gerar** (ou escreva uma senha), marque as telas e toque em **Criar acesso**. O app mostra uma mensagem pronta com o link, o e-mail e a senha, para copiar ou mandar pelo WhatsApp. O login já nasce confirmado: não chega e-mail nenhum. A pessoa pode trocar a senha no botão **Senha** do topo do app. Para dar uma senha nova a quem já tem conta, use **Nova senha** na lista de acessos.

Segurança: a função só obedece administradores do app. A chave secreta do Supabase fica guardada no servidor dele e nunca vai para o app.

## 4. Pegar as duas chaves

Em **Project Settings** (engrenagem) e depois **API**, copie:

- **Project URL** (começa com `https://` e termina com `.supabase.co`)
- a chave **anon public** (ou **publishable**), que é uma linha comprida

Não use a chave `service_role`.

## 5. Colocar as chaves no GitHub

1. No repositório, vá em **Settings**, depois **Secrets and variables**, depois **Actions**, e abra a aba **Variables**.
2. Clique em **New repository variable** e crie duas:
   - nome `VITE_SUPABASE_URL`, valor: a Project URL
   - nome `VITE_SUPABASE_ANON_KEY`, valor: a chave anon
3. Vá em **Actions**, escolha **Publicar no GitHub Pages**, clique em **Run workflow** e depois em **Run workflow** de novo.

## 6. Avisar o Supabase do endereço do site

Em **Authentication**, depois **URL Configuration**, coloque em **Site URL**:
`https://taynaq.github.io/inventario-ti/`

## 7. Entrar

Abra o site. Vai aparecer a tela de login. Clique em **Criar conta** com o e-mail que você liberou, confirme o e-mail que chegar, e entre. Os colaboradores fazem o mesmo, depois que você liberar o e-mail deles no passo 3.

Importante: os equipamentos que você cadastrou antes só no navegador não vão para o banco. Depois de ligar o login, importe o PDF de novo.
