# Suite e2e - aupus-service-api

Suite **end-to-end** que valida usuários, autenticação e permissões batendo numa instância
**viva** da API (`http://localhost:3000/api/v1`), com banco real e admin já seedado.

## Isto NÃO faz parte do `pnpm test`

`pnpm test` na raiz roda o **jest**, e o jest só enxerga os `*.spec.ts` dentro de `src/`.
Os arquivos daqui ficam de fora **de propósito**, por três motivos:

1. **Não são testes jest.** Não têm `describe`/`it`/`expect` — são scripts `ts-node` que montam
   um relatório próprio. Se o jest os carregasse, falharia com
   *"Your test suite must contain at least one test"*.
2. **Exigem servidor de pé.** Sem a API rodando na porta 3000, todos falham por
   `ECONNREFUSED` — e quem só quer rodar unit não deveria precisar subir backend.
3. **Escrevem no banco.** Criam usuário, atribuem role e permissão e fazem soft delete. O banco
   de dev é compartilhado com `iot_nexon`; isso não pode acontecer a cada `pnpm test`.

Por isso o sufixo dos arquivos é `.e2e.ts`, e **não** `.test.ts`: nenhum runner do repo
reivindica esse padrão, então não existe arquivo de teste órfão dando falsa impressão de
cobertura (SN-4).

| Comando | Onde | O que roda |
|---|---|---|
| `pnpm test` | raiz do `aupus-service-api` | os `*.spec.ts` de `src/` (jest, sem servidor) |
| `pnpm test:e2e` | raiz do `aupus-service-api` | os 4 arquivos daqui (ts-node, **exige API viva**) |

## 📋 Estrutura dos Testes

### Fase 1: Infraestrutura (`00-infrastructure.e2e.ts`)
Valida a estrutura do banco de dados:
- ✅ Existência de todas as tabelas necessárias
- ✅ Constraints da coluna `role`
- ✅ Índices de performance
- ✅ Roles cadastradas no sistema
- ✅ Permissions cadastradas
- ✅ Relacionamentos entre tabelas

### Fase 2: CRUD de Usuários (`01-api-crud.e2e.ts`)
Testa operações básicas da API:
- ✅ Criar usuário simples
- ✅ Criar usuário com role
- ✅ Criar usuário com permissions
- ✅ Listar usuários
- ✅ Buscar usuário por ID
- ✅ Atualizar usuário
- ✅ Deletar usuário (soft delete)

### Fase 3: Autenticação (`02-authentication.e2e.ts`)
Valida o sistema de autenticação JWT:
- ✅ Login com credenciais válidas
- ✅ Login com credenciais inválidas
- ✅ Payload do JWT
- ✅ Refresh token
- ✅ Acesso a rotas protegidas
- ✅ Bloqueio de acesso sem token

### Fase 4: Roles e Permissions (`03-permissions.e2e.ts`)
Testa o sistema de permissões:
- ✅ Atribuir role a usuário
- ✅ Atribuir permissão direta
- ✅ Remover permissão
- ✅ Sincronizar permissões
- ✅ Buscar permissões do usuário
- ✅ Verificar permissão específica
- ✅ Verificar múltiplas permissões
- ✅ Categorização de permissões

## 🚀 Como Executar

### 1. Instalação

```bash
cd tests
npm install
```

### 2. Configuração

Copie o arquivo de exemplo e configure:

```bash
cp .env.example .env
```

Edite o `.env` com suas configurações:
```env
API_BASE_URL=http://localhost:3000
ADMIN_EMAIL=admin@aupus.com
ADMIN_PASSWORD=admin123
```

### 3. Executar Todos os Testes

Da raiz do `aupus-service-api` (atalho, e o caminho normal):

```bash
pnpm test:e2e
```

Ou de dentro de `tests/`:

```bash
npm test
```

### 4. Executar Testes Individuais

```bash
# Apenas infraestrutura
npm run test:infra

# Apenas CRUD
npm run test:crud

# Apenas autenticação
npm run test:auth

# Apenas permissions
npm run test:perms
```

## 📊 Interpretando os Resultados

### Status dos Testes

- **✅ PASS**: Teste passou com sucesso
- **❌ FAIL**: Teste falhou - requer correção
- **⚠️ WARN**: Aviso - funciona mas com ressalvas

### Taxa de Sucesso

- **90-100%**: 🎉 Excelente! Sistema pronto para produção
- **70-89%**: ✅ Bom! Alguns ajustes necessários
- **50-69%**: ⚠️ Atenção! Problemas significativos
- **0-49%**: ❌ Crítico! NÃO usar em produção

## 📄 Relatórios

Os relatórios são salvos automaticamente em `tests/reports/`:

```bash
# Ver último relatório
cat reports/test-report-*.json | tail -1 | jq
```

## 🔧 Troubleshooting

### Erro de Conexão

```
❌ FAIL - Erro: connect ECONNREFUSED
```

**Solução**: Verifique se a API está rodando:
```bash
# No diretório da API
npm run start:dev
```

### Falha em "Roles Cadastradas"

```
❌ FAIL - CRÍTICO: Nenhuma role cadastrada no sistema
```

**Solução**: Execute o seed do banco de dados:
```bash
npx prisma db seed
```

### Falha em "Permissions Cadastradas"

```
❌ FAIL - CRÍTICO: Nenhuma permission cadastrada no sistema
```

**Solução**: Execute a migration/seed de permissions ou crie manualmente.

### Falha em Login

```
❌ FAIL - Email ou senha inválidos
```

**Solução**:
1. Verifique as credenciais no `.env`
2. Crie um usuário admin manualmente
3. Verifique se o usuário está ativo

## 🐛 Plano de Correção Automático

Ao executar os testes, um plano de correção é gerado automaticamente para cada falha.

### Exemplo de Saída:

```
❌ LISTA DE FALHAS:

1. [Infraestrutura] Constraint da Coluna Role
   Constraint encontrado mas não foi possível extrair valores

   📋 AÇÃO RECOMENDADA:
   - Execute: SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'usuarios'::regclass
   - Identifique os valores permitidos
   - Atualize o mapeamento em usuarios.service.ts:1392
```

## 📝 Contribuindo

Ao adicionar novos testes:

1. Siga o padrão de nomenclatura: `0X-nome.e2e.ts`
2. Use a interface `TestResult` para resultados
3. Adicione logs descritivos
4. Documente falhas esperadas
5. Atualize este README

## 🔍 Verificações Pré-Produção

Antes de ir para produção, certifique-se que:

- [ ] Taxa de sucesso >= 90%
- [ ] Nenhuma falha em testes de infraestrutura
- [ ] Testes de autenticação passando 100%
- [ ] Sistema de permissions funcionando
- [ ] Soft delete funcionando corretamente
- [ ] Refresh token funcionando
- [ ] Guards bloqueando acesso não autorizado

## 📞 Suporte

Em caso de dúvidas ou problemas:

1. Verifique os logs detalhados no console
2. Consulte o relatório JSON gerado
3. Revise a documentação da API
4. Verifique o schema do Prisma

---

**Versão**: 1.0.0
**Última Atualização**: 2025-12-09
