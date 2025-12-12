# 🔓 Migração: Remoção da Constraint CHECK da Coluna `role`

**Data**: 2025-12-09
**Objetivo**: Permitir que a coluna `usuarios.role` aceite TODAS as roles do sistema Spatie
**Status**: ✅ Concluída e Testada

---

## 📋 Problema Identificado

### Antes da Migração

A coluna `usuarios.role` tinha uma **constraint CHECK** que limitava os valores aceitos:

```sql
CHECK (role IN ('admin', 'consultor', 'gerente', 'vendedor'))
```

**Impacto**:
- ❌ Role `super_admin` não podia ser armazenada na coluna legacy
- ❌ Outras roles do Spatie (`operador`, `cliente`, etc.) eram rejeitadas
- ❌ Backend tinha que fazer **mapeamento forçado** (ex: `super_admin` → `admin`)
- ❌ Inconsistência entre coluna legacy e sistema Spatie

---

## ✅ Solução Implementada

### 1. Remoção da Constraint

**Arquivo**: `prisma/migrations/remove_role_check_constraint.sql`

```sql
ALTER TABLE usuarios
DROP CONSTRAINT IF EXISTS usuarios_role_check;

COMMENT ON COLUMN usuarios.role IS 'Role do usuário (legacy). Sistema Spatie usa model_has_roles. Aceita qualquer valor sem restrições.';
```

**Script de Execução**: `run-remove-role-constraint.ts`

### 2. Atualização do Backend

**Arquivo**: `src/modules/usuarios/usuarios.service.ts`

**Antes**:
```typescript
private mapSpatieRoleToValidDbRole(spatieRoleName: string): string {
  // Mapeamento complexo para respeitar constraint
  const mapping = {
    'super_admin': 'admin',  // ❌ Forçava conversão
    'operador': 'vendedor',
    // ... mais mapeamentos
  };
  return mapping[roleName] || 'vendedor';
}
```

**Depois**:
```typescript
private mapSpatieRoleToValidDbRole(spatieRoleName: string): string {
  if (!spatieRoleName) return 'vendedor';

  // ✅ Retorna o valor original sem mapeamento
  return spatieRoleName;
}
```

### 3. Sincronização no `assignRole()`

O método `assignRole()` agora sincroniza corretamente:

```typescript
await tx.usuarios.update({
  where: { id: userId },
  data: {
    role: this.mapSpatieRoleToValidDbRole(role.name), // ✅ Agora retorna valor original
    updated_at: new Date()
  }
});
```

---

## 🧪 Testes Realizados

### Teste 1: Remoção da Constraint ✅

```bash
npx ts-node run-remove-role-constraint.ts
```

**Resultado**:
- ✅ Constraint `usuarios_role_check` removida
- ✅ Teste com `super_admin` bem-sucedido
- ✅ Comentário adicionado na coluna

### Teste 2: Todas as Roles do Select ✅

```bash
npx ts-node test-all-roles-select.ts
```

**Resultado**: **9/9 roles aceitas**
- ✅ `super_admin`
- ✅ `admin`
- ✅ `gerente`
- ✅ `vendedor`
- ✅ `consultor`
- ✅ `operador`
- ✅ `cliente`
- ✅ `associado`
- ✅ `cativo`

### Teste 3: Usuário Admin ✅

```bash
npx ts-node test-admin-role-update.ts
```

**Resultado**:
- ✅ Admin atualizado com `role = 'super_admin'` na coluna legacy
- ✅ Role Spatie permanece `super_admin` (ID: 1)
- ✅ Sistema de permissions continua funcionando

---

## 📊 Comparação: Antes vs Depois

| Aspecto | Antes | Depois |
|---------|-------|--------|
| **Constraint CHECK** | ✅ Ativa (4 valores) | ❌ Removida |
| **Valores aceitos** | `admin`, `consultor`, `gerente`, `vendedor` | Qualquer `VARCHAR(255)` |
| **Role `super_admin`** | ❌ Rejeitada | ✅ Aceita |
| **Mapeamento backend** | ✅ Necessário | ❌ Não necessário |
| **Sincronização** | ⚠️ Parcial | ✅ Total |
| **Coluna legacy** | `vendedor` | `super_admin` ✅ |
| **Sistema Spatie** | `super_admin` | `super_admin` ✅ |

---

## 🎯 Benefícios

1. **✅ Sincronização Total**
   - Coluna `role` agora reflete o valor real do Spatie
   - Não há mais inconsistências

2. **✅ Simplicidade no Código**
   - Removido mapeamento complexo
   - Código mais limpo e manutenível

3. **✅ Flexibilidade**
   - Novas roles podem ser criadas sem alterar banco
   - Suporte a todas as roles do sistema

4. **✅ Compatibilidade**
   - Mantém coluna legacy funcionando
   - Sistema antigo continua compatível

---

## 🔧 Como Usar Agora

### Criar Usuário com Role

```typescript
// Front-end envia:
{
  nome: "João Silva",
  email: "joao@example.com",
  roleNames: ["super_admin"]  // ← Qualquer role do Spatie
}

// Backend processa:
1. Cria usuário na tabela usuarios
2. Atribui role super_admin no Spatie (model_has_roles)
3. Sincroniza coluna role = "super_admin" ✅
```

### Atualizar Role de Usuário

```typescript
// Via endpoint: POST /usuarios/:id/assign-role
{
  roleId: 1  // super_admin
}

// Resultado:
- model_has_roles: role_id = 1 ✅
- usuarios.role: "super_admin" ✅
```

---

## 📝 Notas Importantes

### Sistema Híbrido Mantido

O sistema continua usando **DOIS lugares** para armazenar roles:

1. **`model_has_roles`** (Spatie) ← **Source of Truth** para permissions
2. **`usuarios.role`** (Legacy) ← Compatibilidade com aplicação antiga

**Diferença**: Agora ambos têm o **mesmo valor** ✅

### Front-End

O front-end deve sempre mostrar:
- `usuario.roles` (array do Spatie) ← **Recomendado**
- `usuario.role` (string legacy) ← Agora sincronizado!

### Verificar Permissions

```typescript
// Sempre usar sistema Spatie:
await user.hasRole('super_admin');  // ✅
await user.can('usuarios.create');  // ✅

// NÃO usar coluna legacy para permissions:
if (user.role === 'super_admin') { }  // ❌ NÃO FAZER
```

---

## 🔍 Verificação de Integridade

### Ver Roles de um Usuário

```sql
SELECT
  u.email,
  u.role as role_legacy,
  r.name as role_spatie
FROM usuarios u
LEFT JOIN model_has_roles mhr ON mhr.model_id = u.id
LEFT JOIN roles r ON r.id = mhr.role_id
WHERE u.email = 'admin@email.com';
```

**Resultado esperado**:
```
email            | role_legacy  | role_spatie
-----------------+--------------+-------------
admin@email.com  | super_admin  | super_admin  ✅ SINCRONIZADO!
```

### Via API

```bash
GET /api/v1/usuarios/:id
```

**Response**:
```json
{
  "id": "k6g72ojagrl415bsak6y68qi96",
  "email": "admin@email.com",
  "role": "super_admin",           // ← Coluna legacy
  "roles": ["super_admin"],        // ← Sistema Spatie
  "role_details": {
    "id": 1,
    "name": "super_admin",
    "guard_name": "api"
  }
}
```

---

## 🚀 Próximos Passos (Opcional)

### Futuro: Remover Coluna Legacy

Quando a aplicação antiga não for mais usada:

```sql
-- ⚠️ APENAS QUANDO CONFIRMAR QUE APLICAÇÃO ANTIGA NÃO USA MAIS
ALTER TABLE usuarios DROP COLUMN role;
```

**Impacto**: Sistema usará apenas Spatie (mais limpo e consistente)

---

## 📚 Referências

- **Análise do Problema**: `ANALISE-PROBLEMA-ROLE.md`
- **Migração SQL**: `prisma/migrations/remove_role_check_constraint.sql`
- **Script de Execução**: `run-remove-role-constraint.ts`
- **Testes**:
  - `test-all-roles-select.ts`
  - `test-admin-role-update.ts`
  - `check-role-constraint.ts`

---

## ✅ Checklist Final

- [x] Constraint CHECK removida do banco
- [x] Backend atualizado (sem mapeamento)
- [x] Todas as 9 roles do select testadas e aceitas
- [x] Admin sincronizado com `super_admin`
- [x] Documentação criada
- [x] Sistema de permissions funcionando
- [x] Coluna legacy sincronizada com Spatie

**Status**: ✅ **MIGRAÇÃO CONCLUÍDA COM SUCESSO**

---

**Conclusão**: Agora você pode escolher **qualquer role** no select do front-end, e ela será armazenada corretamente tanto no sistema Spatie quanto na coluna legacy! 🎉
