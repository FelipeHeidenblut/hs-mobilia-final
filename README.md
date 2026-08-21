# Site HS

Site institucional da HS, mantido em HTML, CSS e JavaScript puro. Não há framework, compilação ou instalação de dependências.

## Executar localmente

Por usar módulos JavaScript, o site deve ser aberto por um servidor HTTP local, e não diretamente com `file://`.

```bash
python3 -m http.server 8080
```

Depois, acesse `http://localhost:8080`.

## Organização

- `*.html`: páginas acessíveis diretamente pela URL.
- `global.css`: tokens, cabeçalho, rodapé e estilos compartilhados.
- CSS com nome de página: estilos específicos daquela página.
- `ui.js`: cabeçalho, rodapé, menu e renderização compartilhada de cards.
- `supabase.js`: única camada de acesso ao Supabase.
- `produto-detalhe.js`: comportamento compartilhado pelas páginas pública e profissional de produto.
- `sanitize.js`: higienização do HTML dos artigos.
- `config.js`: informações gerais e canais de contato.
- `supabase/migrations/`: alterações e políticas de segurança do banco.
- `imagens/`: imagens estáticas do site.
- `robots.txt`, `sitemap.xml` e `404.html`: arquivos técnicos de indexação e tratamento de URLs inválidas.

## Publicação e Supabase

Antes de publicar esta versão:

1. Faça backup do banco.
2. Execute `supabase/migrations/001_auth_and_rls.sql` no SQL Editor do Supabase.
3. Crie ou localize o usuário administrativo em Authentication > Users.
4. Execute o comando indicado no final da migration, substituindo pelo e-mail administrativo.
5. Em Authentication > URL Configuration, configure a URL publicada do site e os redirects permitidos.
6. Execute `supabase/migrations/004_restore_manual_architect_approval.sql` para adicionar CAU/ABD, Instagram e restaurar a aprovação manual.
7. Teste cadastro, confirmação de e-mail, aprovação pelo painel administrativo e acesso aos arquivos com uma conta de teste.

Se o acervo responder com `PGRST205` para `public_products`, execute também
`supabase/migrations/002_restore_public_catalog.sql`. Essa migration recria a view pública e atualiza o cache da API.

`003_simplify_professional_access.sql` é mantida apenas como histórico da fase de acesso automático.
Não a execute depois da migration `004`, pois isso voltaria a liberar qualquer usuário autenticado.

A chave `anon` no navegador é pública por definição. A proteção dos dados depende das políticas RLS incluídas na migration.

## Manutenção comum

- Textos fixos permanecem nos respectivos arquivos HTML.
- Cabeçalho e rodapé são alterados uma única vez em `ui.js`.
- Endereço de contato geral fica em `config.js`.
- Produtos, acabamentos, profissionais e artigos continuam sendo gerenciados pelo Supabase/painel.

Não coloque uma chave `service_role` em nenhum arquivo deste projeto.

## Atualizar o sitemap

Após publicar ou remover produtos e artigos, gere novamente o sitemap usando a chave pública `anon` do Supabase:

```bash
SUPABASE_ANON_KEY="sua-chave-anon" node scripts/generate-sitemap.mjs
```

A chave `service_role` não deve ser usada nesse comando.
