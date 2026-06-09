# Sinapsia

MVP de uma plataforma de mapas mentais e conceituais em tela infinita.

## O que ja funciona

- Canvas infinito com Tldraw.
- Texto, formas, setas, desenho livre e suporte touch/stylus.
- Upload por arrastar/soltar para imagens, GIFs e videos suportados pelo Tldraw.
- Links dinamicos em `/b/[id]`.
- Link de edicao e link de visualizacao (`?mode=view`).
- Persistencia local por board no navegador.
- Sincronizacao com Supabase quando as variaveis de ambiente reais estiverem configuradas.

## Rodar localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Supabase

1. Crie um projeto no Supabase.
2. Execute `supabase-schema.sql` no SQL Editor.
3. Habilite Realtime para a tabela `public.boards`.
4. Troque os valores em `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_CHAVE_ANONIMA_AQUI
```

Sem essas chaves, o app continua funcionando em modo local.
