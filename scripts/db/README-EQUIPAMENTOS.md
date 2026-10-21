# Scripts de equipamentos

O cenário de dados do dev (plantas, instalações, equipamentos em posições, planos e um ano de OS)
é o seed `scripts/seed-dev/` (`pnpm seed:dev`), descrito na skill `seed-dev`. O antigo
`reset-and-seed-equipamentos.js` saiu em out/2026: apagava todos os equipamentos do banco do
`DATABASE_URL`, fosse qual fosse, sem conferir que era o de desenvolvimento.

## `fix-tipo-equipamento-ids.js`

**Função:** corrige IDs órfãos de tipos de equipamentos.

**Quando usar:** quando equipamentos estiverem com `tipo_equipamento_id` que não existe em
`tipos_equipamentos`.

**Como executar:**

```bash
cd aupus-service-api
node -r dotenv/config scripts/db/fix-tipo-equipamento-ids.js
```

**O que faz:**

- identifica equipamentos com `tipo_equipamento_id` que não existe na tabela `tipos_equipamentos`;
- corrige automaticamente pelo padrão do ID;
- mostra um relatório das correções.
