# Plano de Correção - Problemas Potenciais

Este documento lista todos os problemas potenciais identificados e as soluções recomendadas.

## 🔴 PROBLEMAS CRÍTICOS (Podem impedir funcionamento)

### 1. Tabelas Spatie Não Existem

**Sintoma**: Teste "Existência de Tabelas" falha

**Causa**: Migrations do sistema Spatie não foram executadas

**Solução**:

```bash
# 1. Verificar se as migrations existem
ls prisma/migrations

# 2. Se não existirem, criar migration manual
npx prisma migrate dev --name add_spatie_tables

# 3. Ou executar SQL direto no banco:
psql -d seu_banco -f scripts/create-spatie-tables.sql
```

**Script SQL**: `scripts/create-spatie-tables.sql`
```sql
-- Criar tabelas Spatie se não existirem

CREATE TABLE IF NOT EXISTS roles (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  guard_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP(0),
  updated_at TIMESTAMP(0),
  UNIQUE(name, guard_name)
);

CREATE TABLE IF NOT EXISTS permissions (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  description TEXT,
  guard_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP(0),
  updated_at TIMESTAMP(0),
  UNIQUE(name, guard_name)
);

CREATE TABLE IF NOT EXISTS model_has_roles (
  role_id BIGINT NOT NULL,
  model_type VARCHAR(255) NOT NULL,
  model_id CHAR(26) NOT NULL,
  PRIMARY KEY (role_id, model_id, model_type),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS model_has_roles_model_id_model_type_index
  ON model_has_roles(model_id, model_type);

CREATE TABLE IF NOT EXISTS model_has_permissions (
  permission_id BIGINT NOT NULL,
  model_type VARCHAR(255) NOT NULL,
  model_id CHAR(26) NOT NULL,
  PRIMARY KEY (permission_id, model_id, model_type),
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS model_has_permissions_model_id_model_type_index
  ON model_has_permissions(model_id, model_type);

CREATE TABLE IF NOT EXISTS role_has_permissions (
  permission_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  PRIMARY KEY (permission_id, role_id),
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);
```

---

### 2. Nenhuma Role Cadastrada

**Sintoma**: Teste "Roles Cadastradas" falha

**Causa**: Seed do banco não foi executado

**Solução**:

```bash
# Opção 1: Executar seed do Prisma
npx prisma db seed

# Opção 2: Inserir roles manualmente
psql -d seu_banco
```

**SQL para Roles Básicas**:
```sql
INSERT INTO roles (name, guard_name, created_at, updated_at) VALUES
  ('admin', 'web', NOW(), NOW()),
  ('gerente', 'web', NOW(), NOW()),
  ('vendedor', 'web', NOW(), NOW()),
  ('consultor', 'web', NOW(), NOW()),
  ('proprietario', 'web', NOW(), NOW())
ON CONFLICT (name, guard_name) DO NOTHING;
```

---

### 3. Nenhuma Permission Cadastrada

**Sintoma**: Teste "Permissions Cadastradas" falha

**Causa**: Permissions não foram criadas

**Solução**:

Criar arquivo `scripts/seed-permissions.sql`:

```sql
-- Permissions de Dashboard
INSERT INTO permissions (name, display_name, description, guard_name, created_at, updated_at) VALUES
  ('dashboard.view', 'Ver Dashboard', 'Acesso à dashboard principal', 'web', NOW(), NOW()),
  ('dashboard.analytics', 'Analytics', 'Acesso a análises avançadas', 'web', NOW(), NOW()),

-- Permissions de Usuários
  ('usuarios.view', 'Ver Usuários', 'Listar e visualizar usuários', 'web', NOW(), NOW()),
  ('usuarios.create', 'Criar Usuários', 'Criar novos usuários', 'web', NOW(), NOW()),
  ('usuarios.edit', 'Editar Usuários', 'Editar dados de usuários', 'web', NOW(), NOW()),
  ('usuarios.delete', 'Excluir Usuários', 'Excluir usuários', 'web', NOW(), NOW()),
  ('usuarios.manage-roles', 'Gerenciar Roles', 'Atribuir roles a usuários', 'web', NOW(), NOW()),

-- Permissions de Organizações
  ('organizacoes.view', 'Ver Organizações', 'Listar organizações', 'web', NOW(), NOW()),
  ('organizacoes.create', 'Criar Organizações', 'Criar novas organizações', 'web', NOW(), NOW()),
  ('organizacoes.edit', 'Editar Organizações', 'Editar organizações', 'web', NOW(), NOW()),
  ('organizacoes.delete', 'Excluir Organizações', 'Excluir organizações', 'web', NOW(), NOW()),

-- Permissions de Plantas
  ('plantas.view', 'Ver Plantas', 'Visualizar plantas de energia', 'web', NOW(), NOW()),
  ('plantas.create', 'Criar Plantas', 'Cadastrar novas plantas', 'web', NOW(), NOW()),
  ('plantas.edit', 'Editar Plantas', 'Editar dados de plantas', 'web', NOW(), NOW()),
  ('plantas.delete', 'Excluir Plantas', 'Excluir plantas', 'web', NOW(), NOW()),

-- Permissions de Equipamentos
  ('equipamentos.view', 'Ver Equipamentos', 'Visualizar equipamentos', 'web', NOW(), NOW()),
  ('equipamentos.create', 'Criar Equipamentos', 'Cadastrar equipamentos', 'web', NOW(), NOW()),
  ('equipamentos.edit', 'Editar Equipamentos', 'Editar equipamentos', 'web', NOW(), NOW()),
  ('equipamentos.delete', 'Excluir Equipamentos', 'Excluir equipamentos', 'web', NOW(), NOW()),

-- Permissions de Monitoramento
  ('monitoramento.view', 'Ver Monitoramento', 'Acessar monitoramento', 'web', NOW(), NOW()),
  ('monitoramento.alerts', 'Alertas', 'Gerenciar alertas', 'web', NOW(), NOW()),

-- Permissions de Supervisório
  ('supervisorio.view', 'Ver Supervisório', 'Acessar supervisório', 'web', NOW(), NOW()),
  ('supervisorio.control', 'Controle SCADA', 'Controlar equipamentos', 'web', NOW(), NOW()),

-- Permissions Comercial
  ('oportunidades.view', 'Ver Oportunidades', 'Visualizar oportunidades', 'web', NOW(), NOW()),
  ('oportunidades.create', 'Criar Oportunidades', 'Criar oportunidades', 'web', NOW(), NOW()),
  ('oportunidades.edit', 'Editar Oportunidades', 'Editar oportunidades', 'web', NOW(), NOW()),
  ('prospeccao.view', 'Ver Prospecção', 'Acessar prospecção', 'web', NOW(), NOW()),

-- Permissions Financeiro
  ('financeiro.view', 'Ver Financeiro', 'Acessar financeiro', 'web', NOW(), NOW()),
  ('financeiro.reports', 'Relatórios Financeiros', 'Gerar relatórios', 'web', NOW(), NOW()),

-- Permissions Sistema
  ('configuracoes.view', 'Ver Configurações', 'Acessar configurações', 'web', NOW(), NOW()),
  ('configuracoes.edit', 'Editar Configurações', 'Modificar configurações', 'web', NOW(), NOW()),
  ('admin.full', 'Acesso Total', 'Acesso administrativo completo', 'web', NOW(), NOW())

ON CONFLICT (name, guard_name) DO NOTHING;
```

Executar:
```bash
psql -d seu_banco -f scripts/seed-permissions.sql
```

---

### 4. Constraint da Coluna Role - Valores Desconhecidos

**Sintoma**: Erro ao criar usuário - "violates check constraint"

**Causa**: O mapeamento em `usuarios.service.ts` não corresponde aos valores aceitos pelo banco

**Solução**:

1. **Descobrir valores permitidos**:
```sql
SELECT conname, pg_get_constraintdef(oid) as constraint_def
FROM pg_constraint
WHERE conrelid = 'usuarios'::regclass
AND contype = 'c'
AND conname LIKE '%role%';
```

2. **Atualizar mapeamento** em `usuarios.service.ts:1392`:

```typescript
private mapSpatieRoleToValidDbRole(spatieRoleName: string): string {
  // ATUALIZAR ESTE MAPEAMENTO COM OS VALORES REAIS DO SEU BANCO
  const mapping: Record<string, string> = {
    'proprietario': 'gerente',     // ← Verificar se 'gerente' é aceito
    'admin': 'admin',              // ← Verificar se 'admin' é aceito
    'user': 'vendedor',            // ← Verificar se 'vendedor' é aceito
    'consultor': 'consultor',      // ← Verificar se 'consultor' é aceito
    // Adicionar outros conforme necessário
  };

  return mapping[roleName.toLowerCase()] || 'vendedor'; // ← Ajustar fallback
}
```

3. **Ou remover o constraint** (não recomendado):
```sql
-- Descobrir nome do constraint
SELECT conname FROM pg_constraint
WHERE conrelid = 'usuarios'::regclass AND contype = 'c' AND conname LIKE '%role%';

-- Remover constraint
ALTER TABLE usuarios DROP CONSTRAINT nome_do_constraint;
```

---

## 🟡 PROBLEMAS MÉDIOS (Sistema funciona mas com limitações)

### 5. Endpoint /auth/me Não Existe

**Sintoma**: Teste "Rota Protegida com Token Válido" retorna WARN

**Causa**: Endpoint não implementado

**Solução**:

Adicionar em `auth.controller.ts`:

```typescript
@Get('me')
@UseGuards(JwtAuthGuard)
@ApiOperation({ summary: 'Retorna dados do usuário autenticado' })
@ApiResponse({ status: 200, description: 'Dados do usuário' })
getCurrentUser(@CurrentUser() user: any) {
  return this.authService.getCurrentUser(user.sub);
}
```

---

### 6. JWT Strategy Não Configurada

**Sintoma**: Token válido mas acesso negado

**Causa**: Passport JWT strategy não configurada

**Solução**:

Criar `auth/strategies/jwt.strategy.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'your-secret-key',
    });
  }

  async validate(payload: any) {
    return {
      id: payload.sub,
      email: payload.email,
      nome: payload.nome,
      role: payload.role,
      permissions: payload.permissions
    };
  }
}
```

Registrar em `auth.module.ts`:

```typescript
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    // ...
  ],
  providers: [AuthService, JwtStrategy], // ← Adicionar JwtStrategy
  // ...
})
export class AuthModule {}
```

---

### 7. Roles Não Têm Permissions Associadas

**Sintoma**: Usuário com role não herda permissions

**Causa**: Tabela `role_has_permissions` vazia

**Solução**:

```sql
-- Associar permissions ao role 'admin' (exemplo)
INSERT INTO role_has_permissions (role_id, permission_id)
SELECT
  (SELECT id FROM roles WHERE name = 'admin' LIMIT 1) as role_id,
  id as permission_id
FROM permissions
WHERE name LIKE '%.%' -- Apenas permissions modernas
ON CONFLICT DO NOTHING;

-- Associar permissions básicas ao role 'vendedor'
INSERT INTO role_has_permissions (role_id, permission_id)
SELECT
  (SELECT id FROM roles WHERE name = 'vendedor' LIMIT 1) as role_id,
  id as permission_id
FROM permissions
WHERE name IN (
  'dashboard.view',
  'oportunidades.view',
  'oportunidades.create',
  'prospeccao.view'
)
ON CONFLICT DO NOTHING;
```

---

## 🟢 PROBLEMAS LEVES (Otimizações)

### 8. Índices Faltando

**Sintoma**: Teste "Índices de Performance" retorna WARN

**Causa**: Índices não foram criados

**Solução**:

```sql
-- Adicionar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_deleted_at ON usuarios(deleted_at);
CREATE INDEX IF NOT EXISTS idx_usuarios_is_active ON usuarios(is_active);
CREATE INDEX IF NOT EXISTS idx_model_has_roles_lookup
  ON model_has_roles(model_id, model_type);
CREATE INDEX IF NOT EXISTS idx_model_has_permissions_lookup
  ON model_has_permissions(model_id, model_type);
```

---

### 9. Cache do Frontend Dessincroni zado

**Sintoma**: Alterações de permissions não refletem imediatamente

**Causa**: Cache de 5 minutos no frontend

**Solução**:

Opção 1 - Invalidar cache ao alterar permissions:
```typescript
// No frontend, após atualizar permissions
userPermissionsService.invalidateUserCache(userId);
```

Opção 2 - Reduzir tempo de cache:
```typescript
// user-permissions.service.ts
private readonly CACHE_DURATION = 1 * 60 * 1000; // 1 minuto
```

---

## 📋 Checklist de Verificação Pós-Correção

Após aplicar as correções, execute:

```bash
# 1. Rodar todos os testes
npm test

# 2. Verificar taxa de sucesso >= 90%

# 3. Verificar que não há FAIL em:
#    - Existência de Tabelas
#    - Roles Cadastradas
#    - Permissions Cadastradas
#    - Login com Credenciais Válidas
#    - Atribuir Role

# 4. Verificar relatório gerado
cat tests/reports/test-report-*.json | tail -1 | jq '.summary'
```

---

## 🆘 Suporte

Se após aplicar todas as correções ainda houver problemas:

1. ✅ Verifique os logs detalhados
2. ✅ Execute cada teste individualmente
3. ✅ Verifique conexão com banco de dados
4. ✅ Confirme que a API está rodando
5. ✅ Revise as variáveis de ambiente

---

**Última Atualização**: 2025-12-09
