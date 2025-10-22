# Alterações no Schema - Módulo de Diagramas Sinópticos

## Resumo das Alterações

Este documento descreve as alterações realizadas no schema Prisma para suportar o módulo de **Diagramas Sinópticos de Unidades**.

### Data: 2025-10-15
### Versão: 1.0

---

## Alterações Realizadas

### 1. Model `unidades` ✅

**Alteração**: Adicionado relacionamento com `diagramas_unitarios`

```prisma
// ANTES
model unidades {
  // ...
  planta         plantas       @relation(...)
  equipamentos   equipamentos[]
}

// DEPOIS
model unidades {
  // ...
  planta         plantas                @relation(...)
  equipamentos   equipamentos[]
  diagramas      diagramas_unitarios[]  // ✨ NOVO
}
```

---

### 2. Model `diagramas_unitarios` ✅

**Alterações**:
- ✨ Adicionado campo `configuracoes` (JSON)
- ✨ Adicionado campo `thumbnail_url`
- ✨ Adicionado relacionamento com `unidades`
- ✨ Adicionado relacionamento com `equipamentos`
- ✨ Adicionado relacionamento com `equipamentos_conexoes`
- ✨ Adicionado índice para `deleted_at`
- ✨ Adicionado `@map("diagramas_unitarios")`

```prisma
// ANTES
model diagramas_unitarios {
  id         String    @id @db.Char(26)
  unidade_id String    @db.Char(26)
  nome       String    @db.VarChar(255)
  descricao  String?
  versao     String    @default("1.0") @db.VarChar(10)
  ativo      Boolean   @default(true)
  created_at DateTime  @default(now())
  updated_at DateTime  @updatedAt
  deleted_at DateTime?

  @@index([unidade_id])
  @@index([ativo])
}

// DEPOIS
model diagramas_unitarios {
  id              String    @id @default(cuid()) @db.Char(26)
  unidade_id      String    @db.Char(26)
  nome            String    @db.VarChar(255)
  descricao       String?
  versao          String    @default("1.0") @db.VarChar(10)
  ativo           Boolean   @default(true)
  configuracoes   Json?     // ✨ NOVO
  thumbnail_url   String?   @db.VarChar(500) // ✨ NOVO
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt
  deleted_at      DateTime?

  // ✨ NOVOS RELACIONAMENTOS
  unidade         unidades                   @relation(fields: [unidade_id], references: [id], onDelete: Restrict)
  equipamentos    equipamentos[]
  conexoes        equipamentos_conexoes[]

  @@index([unidade_id])
  @@index([ativo])
  @@index([deleted_at]) // ✨ NOVO
  @@map("diagramas_unitarios")
}
```

**Exemplo de `configuracoes` JSON:**
```json
{
  "zoom": 1.0,
  "grid": {
    "enabled": true,
    "size": 20
  },
  "canvasWidth": 2000,
  "canvasHeight": 1500
}
```

---

### 3. Model `equipamentos` ✅

**Alterações**:
- ✨ Adicionado relacionamento `diagrama` (para `diagrama_id`)
- ✨ Adicionado relacionamentos `conexoes_origem` e `conexoes_destino`

```prisma
// ANTES
model equipamentos {
  // ...
  diagrama_id            String?   @db.Char(26)  // Campo já existia, mas sem @relation
  // ...
  planta                 plantas?                      @relation(...)
  proprietario           usuarios?                     @relation(...)
  dados_tecnicos         equipamentos_dados_tecnicos[]
  // ...
}

// DEPOIS
model equipamentos {
  // ...
  diagrama_id            String?   @db.Char(26)
  // ...
  planta                 plantas?                      @relation(...)
  proprietario           usuarios?                     @relation(...)
  diagrama               diagramas_unitarios?          @relation(fields: [diagrama_id], references: [id], onDelete: SetNull)  // ✨ NOVO
  dados_tecnicos         equipamentos_dados_tecnicos[]
  // ...
  conexoes_origem        equipamentos_conexoes[]       @relation("ConexaoOrigem")  // ✨ NOVO
  conexoes_destino       equipamentos_conexoes[]       @relation("ConexaoDestino") // ✨ NOVO
}
```

---

### 4. Model `equipamentos_conexoes` ✨ NOVO

**Novo model criado** para armazenar conexões entre equipamentos no diagrama.

```prisma
model equipamentos_conexoes {
  id                      String               @id @default(cuid()) @db.Char(26)
  diagrama_id             String               @db.Char(26)
  equipamento_origem_id   String               @db.Char(26)
  porta_origem            String               @db.VarChar(20)  // "top", "bottom", "left", "right"
  equipamento_destino_id  String               @db.Char(26)
  porta_destino           String               @db.VarChar(20)  // "top", "bottom", "left", "right"
  tipo_linha              String               @default("solida") @db.VarChar(20)
  cor                     String?              @db.VarChar(20)
  espessura               Int                  @default(2)
  pontos_intermediarios   Json?                // Array de {x, y}
  rotulo                  String?              @db.VarChar(100)
  ordem                   Int?
  created_at              DateTime             @default(now()) @db.Timestamp(0)
  updated_at              DateTime             @updatedAt @db.Timestamp(0)
  deleted_at              DateTime?            @db.Timestamp(0)

  // Relacionamentos
  diagrama                diagramas_unitarios  @relation(fields: [diagrama_id], references: [id], onDelete: Cascade)
  equipamento_origem      equipamentos         @relation("ConexaoOrigem", fields: [equipamento_origem_id], references: [id], onDelete: Cascade)
  equipamento_destino     equipamentos         @relation("ConexaoDestino", fields: [equipamento_destino_id], references: [id], onDelete: Cascade)

  @@index([diagrama_id])
  @@index([equipamento_origem_id])
  @@index([equipamento_destino_id])
  @@index([deleted_at])
  @@map("equipamentos_conexoes")
}
```

**Campos principais:**
- `porta_origem` / `porta_destino`: Indica qual lado do equipamento está conectado ("top", "bottom", "left", "right")
- `tipo_linha`: Estilo visual da linha ("solida", "tracejada", "pontilhada")
- `pontos_intermediarios`: Array JSON com pontos intermediários para linhas com curvas personalizadas

**Exemplo de `pontos_intermediarios` JSON:**
```json
[
  { "x": 150, "y": 200 },
  { "x": 150, "y": 250 },
  { "x": 200, "y": 250 }
]
```

---

## Como Aplicar as Alterações

### Opção 1: Usando Prisma (Recomendado)

```bash
cd aupus-service-api

# 1. Gerar o client Prisma com as novas alterações
npx prisma generate

# 2. Aplicar as alterações no banco de dados
npx prisma db push

# Ou criar uma migration formal:
npx prisma migrate dev --name add_diagramas_features
```

### Opção 2: Aplicar SQL Manualmente

Se preferir aplicar a migration SQL diretamente no banco:

```bash
# Via psql
psql -U seu_usuario -d seu_banco -f prisma/migrations/20251015_add_diagramas_features.sql

# Ou via Docker (se estiver usando)
docker exec -i seu_container_postgres psql -U seu_usuario -d seu_banco < prisma/migrations/20251015_add_diagramas_features.sql
```

---

## Validação Pós-Migration

Após aplicar as alterações, execute as seguintes verificações:

### 1. Verificar estrutura da tabela `equipamentos_conexoes`

```sql
\d equipamentos_conexoes
```

### 2. Verificar novos campos em `diagramas_unitarios`

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'diagramas_unitarios'
  AND column_name IN ('configuracoes', 'thumbnail_url');
```

### 3. Verificar relacionamentos (foreign keys)

```sql
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
LEFT JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name IN ('diagramas_unitarios', 'equipamentos_conexoes')
  AND tc.constraint_type = 'FOREIGN KEY';
```

### 4. Teste com Prisma Client

Após gerar o client, teste se os relacionamentos estão funcionando:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testarRelacionamentos() {
  // Testar query de diagrama com equipamentos e conexões
  const diagrama = await prisma.diagramas_unitarios.findFirst({
    include: {
      unidade: true,
      equipamentos: {
        where: { deleted_at: null },
        take: 5
      },
      conexoes: {
        where: { deleted_at: null },
        include: {
          equipamento_origem: true,
          equipamento_destino: true
        }
      }
    }
  });

  console.log('Diagrama:', diagrama);
}

testarRelacionamentos();
```

---

## Rollback (Se Necessário)

Se precisar reverter as alterações:

```sql
-- Remover tabela de conexões
DROP TABLE IF EXISTS equipamentos_conexoes CASCADE;

-- Remover colunas adicionadas em diagramas_unitarios
ALTER TABLE diagramas_unitarios
DROP COLUMN IF EXISTS configuracoes,
DROP COLUMN IF EXISTS thumbnail_url;

-- Remover índice
DROP INDEX IF EXISTS idx_diagramas_unitarios_deleted_at;
```

⚠️ **ATENÇÃO**: O rollback causará perda de dados de conexões. Faça backup antes!

---

## Impacto nas Aplicações

### Backend (Node.js + Prisma)

1. **Regenerar Prisma Client**: Executar `npx prisma generate` após aplicar migration
2. **Atualizar tipos TypeScript**: Os tipos serão atualizados automaticamente pelo Prisma Client
3. **Criar services/controllers**: Implementar lógica para manipular conexões e diagramas

### Frontend (React)

Nenhum impacto direto no frontend. A API precisa ser desenvolvida para expor os novos endpoints.

---

## Próximos Passos

1. ✅ Aplicar migration no banco de dados
2. ✅ Regenerar Prisma Client
3. ⏳ Criar services para manipulação de diagramas e conexões
4. ⏳ Criar controllers e rotas RESTful
5. ⏳ Implementar validações (Zod/Joi)
6. ⏳ Criar testes unitários
7. ⏳ Documentar API (Swagger/OpenAPI)

Ver documentação completa em: `docs/API-DIAGRAMA-UNIDADES.md`

---

## Suporte

Para dúvidas ou problemas:
1. Consulte a documentação completa em `docs/API-DIAGRAMA-UNIDADES.md`
2. Verifique os logs de migration
3. Entre em contato com a equipe de desenvolvimento

---

**Última atualização**: 2025-10-15
**Versão do Schema**: 1.0
**Autor**: Claude Code
