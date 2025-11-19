# 🚀 SETUP DE PERMISSÕES - PRÓXIMOS PASSOS

## ✅ O que já foi feito

1. ✅ **Estrutura de Permissões criada** (`prisma/permissions-structure.ts`)
   - 86 permissões modernas definidas
   - Padrão: `recurso.acao` (ex: `usuarios.view`, `plantas.create`)
   - Organizadas em 10 categorias

2. ✅ **Seed criado** (`prisma/seeds/seed-permissions.ts`)
   - Script pronto para popular o banco
   - Cria novas permissões
   - Atualiza permissões existentes

3. ✅ **Schema do Banco atualizado** (`prisma/schema.prisma`)
   - Colunas `display_name` e `description` adicionadas
   - 48 permissões existentes atualizadas com display_name

4. ✅ **Tipos Frontend criados** (`AupusNexOn/src/types/permissions.ts`)
   - Type-safe Permission type
   - Helpers de categorização
   - Sincronizado com backend

5. ✅ **Documentação completa** (`SISTEMA-PERMISSOES.md`)
   - Guia de uso
   - Exemplos de código
   - Mapeamento legacy → moderno

---

## 🔧 O que VOCÊ precisa fazer agora

### Passo 1: Parar o Backend ⚠️

O backend está rodando e impedindo a regeneração do Prisma Client.

```bash
# No terminal onde o backend está rodando, pressione:
Ctrl+C
```

### Passo 2: Regenerar Prisma Client

```bash
cd aupus-service-api
npx prisma generate
```

**Resultado esperado:**
```
✔ Generated Prisma Client (5.22.0) to .\node_modules\@prisma\client in 150ms
```

### Passo 3: Popular o Banco com Permissões Modernas

```bash
npx ts-node prisma/seeds/seed-permissions.ts
```

**Resultado esperado:**
```
══════════════════════════════════════════════════════════
  SEED DE PERMISSÕES - SISTEMA PADRONIZADO
══════════════════════════════════════════════════════════

🌱 Iniciando seed de permissões...

📋 Total de permissões a criar: 86

✅ Criada: dashboard.view
✅ Criada: dashboard.view_analytics
✅ Criada: usuarios.view
✅ Criada: usuarios.create
... (mais 82 permissões)

📊 Resumo:
   ✅ Criadas: XX
   ⏭️  Puladas: XX
   📋 Total: 86

✅ Seed de permissões concluído com sucesso!
```

### Passo 4: Reiniciar o Backend

```bash
npm run start:dev
```

---

## 📊 Permissões Criadas (86 no total)

### Dashboard (2)
- `dashboard.view` - Ver Dashboard
- `dashboard.view_analytics` - Ver Analytics

### Usuários (6)
- `usuarios.view` - Ver Usuários
- `usuarios.create` - Criar Usuários
- `usuarios.edit` - Editar Usuários
- `usuarios.delete` - Deletar Usuários
- `usuarios.manage` - Gerenciar Usuários
- `usuarios.manage_permissions` - Gerenciar Permissões

### Organizações (5)
- `organizacoes.view`, `create`, `edit`, `delete`, `manage`

### Plantas (6)
- `plantas.view`, `create`, `edit`, `delete`, `manage`
- `plantas.view_own` - Ver apenas suas próprias plantas

### Unidades Consumidoras (5)
- `unidades.view`, `create`, `edit`, `delete`, `manage`

### Equipamentos (5)
- `equipamentos.view`, `create`, `edit`, `delete`, `manage`

### Monitoramento (5)
- `monitoramento.view` - Ver Monitoramento
- `monitoramento.view_consumo` - Ver Consumo
- `monitoramento.view_geracao` - Ver Geração
- `monitoramento.view_analytics` - Ver Analytics
- `monitoramento.export` - Exportar Dados

### SCADA (5)
- `scada.view` - Ver SCADA
- `scada.control` - Controlar SCADA
- `scada.view_logs` - Ver Logs
- `scada.view_alarms` - Ver Alarmes
- `scada.acknowledge_alarms` - Reconhecer Alarmes

### Supervisório (4)
- `supervisorio.view` - Ver Supervisório
- `supervisorio.view_sinoptico` - Ver Sinóptico
- `supervisorio.view_logs` - Ver Logs de Eventos
- `supervisorio.manage` - Gerenciar Supervisório

### Prospecção (6)
- `prospeccao.view`, `create`, `edit`, `delete`, `manage`
- `prospeccao.view_own` - Ver apenas suas prospecções

### Oportunidades (5)
- `oportunidades.view`, `create`, `edit`, `delete`, `manage`

### Financeiro (5)
- `financeiro.view` - Acesso básico
- `financeiro.view_reports` - Ver Relatórios
- `financeiro.view_admin` - Acesso administrativo
- `financeiro.manage` - Gerenciar módulo
- `financeiro.export` - Exportar dados

### Clube Aupus (4)
- `clube.view` - Acessar clube
- `clube.view_associado` - Área do associado
- `clube.view_proprietario` - Área do proprietário
- `clube.manage` - Gerenciar clube

### Concessionárias (5)
- `concessionarias.view`, `create`, `edit`, `delete`, `manage`

### Configurações (3)
- `configuracoes.view`, `edit`, `manage`

### Documentos (5)
- `documentos.view`, `upload`, `download`, `delete`, `manage`

### Relatórios (3)
- `relatorios.view`, `export`, `create`

### Administração (4)
- `admin.super` - Super Admin (acesso total)
- `admin.impersonate` - Personificar usuários
- `admin.view_logs` - Ver logs do sistema
- `admin.manage_permissions` - Gerenciar roles e permissões

---

## 🔍 Verificar Permissões no Banco

Após rodar o seed, você pode verificar se as permissões foram criadas:

```sql
-- Ver total de permissões
SELECT COUNT(*) FROM permissions;

-- Ver permissões modernas (com ponto)
SELECT name, display_name, description
FROM permissions
WHERE name LIKE '%.%'
ORDER BY name;

-- Ver permissões por categoria
SELECT
  SUBSTRING_INDEX(name, '.', 1) as recurso,
  COUNT(*) as total
FROM permissions
WHERE name LIKE '%.%'
GROUP BY recurso
ORDER BY recurso;
```

---

## 🎯 Próximos Passos (Após Setup)

### Backend
1. Adicionar guards de permissão nos controllers
2. Usar decorator `@Permission('usuarios.view')` nas rotas
3. Configurar roles com as novas permissões

### Frontend
1. Implementar hook `usePermission`
2. Adicionar checagens de permissões nos componentes
3. Ocultar botões/rotas baseado em permissões

---

## 📚 Documentação

- **Sistema completo:** [SISTEMA-PERMISSOES.md](../SISTEMA-PERMISSOES.md)
- **Estrutura:** [prisma/permissions-structure.ts](prisma/permissions-structure.ts)
- **Seed:** [prisma/seeds/seed-permissions.ts](prisma/seeds/seed-permissions.ts)
- **Tipos Frontend:** [AupusNexOn/src/types/permissions.ts](../AupusNexOn/src/types/permissions.ts)

---

## ⚠️ IMPORTANTE

- **Backup:** O seed NÃO deleta permissões antigas automaticamente (por segurança)
- **Roles:** Você precisará atualizar as roles existentes para usar as novas permissões
- **Migração:** Use o mapeamento em `SISTEMA-PERMISSOES.md` para migrar código antigo

---

## ✅ Checklist

- [ ] Parar backend (Ctrl+C)
- [ ] Regenerar Prisma Client (`npx prisma generate`)
- [ ] Executar seed (`npx ts-node prisma/seeds/seed-permissions.ts`)
- [ ] Verificar permissões no banco (consulta SQL acima)
- [ ] Reiniciar backend (`npm run start:dev`)
- [ ] Testar login e visualização de permissões no frontend
- [ ] Configurar roles com novas permissões (se necessário)

---

**Data:** 18 de Novembro de 2025
**Status:** ✅ Pronto para execução
**Tempo estimado:** 5 minutos
