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
8. Para ativar o gerador de ambientações, siga a configuração abaixo.

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

## Gerador de ambientações

O Portal do Profissional possui um gerador experimental em que o arquiteto envia a imagem do ambiente e monta uma composição com até quatro móveis. Cada peça recebe posição e acabamento próprios, mas toda a composição é enviada em uma única geração.

A integração usa uma Supabase Edge Function para que a chave do provedor de IA nunca seja enviada ao navegador nem publicada no GitHub. Por padrão, a função trabalha em modo de demonstração: valida e registra todo o fluxo, mas devolve a própria foto do ambiente sem consumir uma API.

### Ativação inicial

1. Execute `supabase/migrations/005_ai_room_generator.sql` no SQL Editor do Supabase.
2. Publique a função:

```bash
npx supabase functions deploy generate-room-preview \
  --use-api \
  --project-ref kuymrkdcjejhhjtsrnaa
```

Sem outros segredos, o modo `demo` já estará ativo. O limite padrão é de 10 solicitações por profissional por dia. Ele pode ser alterado com:

```bash
npx supabase secrets set AI_DAILY_LIMIT=10 \
  --project-ref kuymrkdcjejhhjtsrnaa
```

### Pollinations

A função inclui um adaptador para o [endpoint OpenAI-compatible de edição de imagens da Pollinations](https://github.com/pollinations/pollinations/blob/main/APIDOCS.md). Crie a chave diretamente no provedor e configure-a somente nos segredos do Supabase:

```bash
npx supabase secrets set \
  IMAGE_API_PROVIDER=pollinations \
  IMAGE_API_KEY="sua-chave-pollinations" \
  IMAGE_API_BASE_URL=https://gen.pollinations.ai/v1 \
  IMAGE_API_MODEL=klein \
  --project-ref kuymrkdcjejhhjtsrnaa
```

Antes de usar fotos reais de clientes, revise os termos, limites, retenção de arquivos e política de privacidade do provedor escolhido. Uma API gratuita pode ser adequada para protótipos, mas não garante disponibilidade ou confidencialidade para uso comercial.

### OpenAI

Para trocar o provedor sem alterar o frontend, use uma chave compatível com a [API de geração e edição de imagens da OpenAI](https://developers.openai.com/api/docs/guides/image-generation):

```bash
supabase secrets set IMAGE_API_PROVIDER=openai
supabase secrets set IMAGE_API_KEY=sua-chave
supabase secrets set IMAGE_API_BASE_URL=https://api.openai.com/v1
supabase secrets set IMAGE_API_MODEL=gpt-image-2
```

As fotos, máscaras e resultados ficam no bucket privado `ai-projects`. A migration limita o acesso ao próprio profissional aprovado e registra as solicitações em `ai_generation_jobs`.

## Atualizar o sitemap

Após publicar ou remover produtos e artigos, gere novamente o sitemap usando a chave publicável do Supabase:

```bash
SUPABASE_PUBLIC_KEY="sua-chave-publicável" node scripts/generate-sitemap.mjs
```

A chave `service_role` não deve ser usada nesse comando.
