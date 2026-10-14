# Como contribuir

1. Crie uma branch a partir da `main`: `git switch -c minha-melhoria`.
2. Faça a alteração. Regra de negócio nova vai em `src/domain/` com teste; mudança de tela vai em `src/ui/`.
3. Antes de enviar, rode:

   ```bash
   npm run format
   npm run typecheck
   npm test
   npm run build
   ```

4. Envie a branch e abra um Pull Request. O CI (`.github/workflows/ci.yml`) repete essas verificações automaticamente.

## Padrões

- Código e mensagens de commit em português ou inglês, mas o texto que aparece na tela é sempre em português do Brasil.
- Todo texto digitado por alguém e mostrado na tela passa por `esc()` (`src/ui/dom.ts`) para evitar injeção de HTML.
- Mudanças no banco entram em `supabase/schema.sql` de forma que dê para rodar de novo sem erro.
- Nunca coloque chaves secretas no repositório. O arquivo `.env` já está no `.gitignore`.
