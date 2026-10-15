# Ligar o banco de dados e o login (passo a passo)

Faça isto uma vez. Depois disso, todos os colaboradores veem os mesmos equipamentos e entram com e-mail e senha.

## 1. Criar o banco (Supabase, grátis)

1. Abra https://supabase.com e clique em **Start your project**. Entre com sua conta do GitHub.
2. Clique em **New project**. Dê o nome `inventario-ti`, crie uma senha do banco (guarde) e escolha a região **South America (São Paulo)**. Clique em **Create new project** e espere 1 a 2 minutos.

## 2. Criar as tabelas

1. No menu da esquerda, clique em **SQL Editor** e depois em **New query**.
2. Abra o arquivo `supabase/schema.sql` deste projeto, copie **tudo**, cole no Supabase e clique em **Run**. Deve aparecer "Success".

## 3. Liberar quem pode entrar

Só entra quem estiver nesta lista. No **SQL Editor**, cole e rode, trocando pelo seu e-mail (em minúsculas):

```
insert into public.allowed_emails (email) values ('seu@email.com');
```

Para liberar outra pessoa, rode a mesma linha com o e-mail dela. Para tirar o acesso, vá em **Table Editor**, abra `allowed_emails` e apague a linha.

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
