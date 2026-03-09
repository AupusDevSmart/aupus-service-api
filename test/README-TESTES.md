# 🧪 Guia de Testes - Planos de Manutenção

## 📋 Arquivo de Teste Criado

- `planos-manutencao.e2e-spec.ts` - Testes E2E completos de todas as rotas

---

## 🚀 Como Executar os Testes

### **1. Executar TODOS os testes E2E**
```bash
cd C:\Users\Public\aupus-service\aupus-service-api
npm run test:e2e
```

### **2. Executar APENAS os testes de Planos de Manutenção**
```bash
npm run test:e2e -- planos-manutencao.e2e-spec.ts
```

### **3. Executar com modo watch (re-executa ao salvar)**
```bash
npm run test:e2e -- --watch planos-manutencao.e2e-spec.ts
```

### **4. Executar com output detalhado**
```bash
npm run test:e2e -- --verbose planos-manutencao.e2e-spec.ts
```

---

## 🔐 Credenciais Usadas nos Testes

Os testes usam as seguintes credenciais de administrador:

```typescript
email: 'admin@email.com'
password: 'Aupus123!'
```

**IMPORTANTE:** Certifique-se de que este usuário existe no banco de dados antes de executar os testes.

---

## ✅ Rotas Testadas (Total: 13 endpoints)

### **1. Dashboard**
- `GET /planos-manutencao/dashboard` ✅
  - Retorna estatísticas gerais
  - Testa autenticação obrigatória

### **2. Listagem**
- `GET /planos-manutencao` ✅
  - Lista com paginação
  - Filtro por status
  - Busca por texto
  - Ordenação

### **3. Criação**
- `POST /planos-manutencao` ✅
  - Cria novo plano
  - Valida dados obrigatórios
  - Previne duplicação no mesmo equipamento

### **4. Busca**
- `GET /planos-manutencao/:id` ✅
  - Busca por ID
  - Opção de incluir tarefas
  - Retorna 404 para ID inexistente

- `GET /planos-manutencao/por-equipamento/:equipamentoId` ✅
  - Busca plano de um equipamento específico

- `GET /planos-manutencao/por-planta/:plantaId` ✅
  - Lista planos de uma planta

- `GET /planos-manutencao/por-unidade/:unidadeId` ✅
  - Lista planos de uma unidade

### **5. Resumo**
- `GET /planos-manutencao/:id/resumo` ✅
  - Estatísticas detalhadas do plano

### **6. Atualização**
- `PUT /planos-manutencao/:id` ✅
  - Atualiza dados do plano

- `PUT /planos-manutencao/:id/status` ✅
  - Ativa/Desativa plano
  - Testa mudança de status

### **7. Duplicação**
- `POST /planos-manutencao/:id/duplicar` ✅
  - Duplica para 1 equipamento
  - Gera TAGs únicas
  - Copia tarefas, sub-tarefas e recursos

### **8. Clonagem em Lote**
- `POST /planos-manutencao/:id/clonar-lote` ✅
  - Clona para múltiplos equipamentos
  - Retorna sucesso/erro de cada operação
  - Valida equipamentos sem plano

### **9. Exclusão**
- `DELETE /planos-manutencao/:id` ✅
  - Remove plano (soft delete)
  - Remove tarefas associadas
  - Retorna 404 para plano inexistente

---

## 📊 Estrutura dos Testes

### **Setup (beforeAll)**
1. ✅ Cria aplicação NestJS
2. ✅ Faz login com admin
3. ✅ Obtém token JWT
4. ✅ Busca dados necessários (planta, unidade, equipamento)

### **Testes Principais**
Cada grupo de testes valida:
- ✅ Status HTTP correto
- ✅ Estrutura da resposta
- ✅ Dados retornados
- ✅ Autenticação
- ✅ Validações de negócio
- ✅ Casos de erro

### **Cleanup (afterAll)**
- ✅ Fecha aplicação
- ✅ Libera recursos

---

## 🎯 Casos de Teste Cobertos

### **Happy Path (Cenários de Sucesso)**
- ✅ Criar plano
- ✅ Listar planos
- ✅ Buscar plano por ID
- ✅ Atualizar plano
- ✅ Mudar status
- ✅ Duplicar plano
- ✅ Clonar em lote
- ✅ Excluir plano
- ✅ Obter dashboard
- ✅ Obter resumo

### **Unhappy Path (Cenários de Erro)**
- ✅ Criar sem dados obrigatórios → 400
- ✅ Criar plano duplicado → 409
- ✅ Buscar ID inexistente → 404
- ✅ Sem autenticação → 401
- ✅ Excluir plano inexistente → 404

### **Edge Cases (Casos Extremos)**
- ✅ Equipamento sem plano
- ✅ Equipamento com plano existente
- ✅ Clonagem para múltiplos equipamentos
- ✅ Validação de status
- ✅ Inclusão opcional de tarefas

---

## 📈 Exemplo de Output

```bash
$ npm run test:e2e -- planos-manutencao.e2e-spec.ts

 PASS  test/planos-manutencao.e2e-spec.ts (25.234 s)
  Planos de Manutenção (e2e)
    ✅ Autenticado com sucesso
    ✅ Planta ID: abc-123
    ✅ Equipamento sem plano encontrado: xyz-789

    GET /planos-manutencao/dashboard
      ✓ deve retornar dashboard com estatísticas (156 ms)
      ✓ deve retornar erro 401 sem autenticação (45 ms)

    GET /planos-manutencao
      ✓ deve listar planos com paginação (234 ms)
      ✓ deve filtrar planos por status (198 ms)
      ✓ deve buscar planos por texto (176 ms)

    POST /planos-manutencao
      ✓ deve criar um novo plano de manutenção (312 ms)
      ✓ deve retornar erro 400 sem dados obrigatórios (89 ms)
      ✓ deve retornar erro ao criar plano duplicado (145 ms)

    GET /planos-manutencao/:id
      ✓ deve buscar plano por ID (123 ms)
      ✓ deve buscar plano com tarefas incluídas (187 ms)
      ✓ deve retornar 404 para ID inexistente (67 ms)

    ... [mais testes]

    DELETE /planos-manutencao/:id
      ✓ deve excluir plano existente (234 ms)
      ✓ deve retornar 404 ao tentar excluir plano inexistente (78 ms)

Test Suites: 1 passed, 1 total
Tests:       25 passed, 25 total
Snapshots:   0 total
Time:        25.234 s
```

---

## 🔧 Troubleshooting

### **Erro: "Cannot find module '@nestjs/testing'"**
```bash
npm install --save-dev @nestjs/testing
```

### **Erro: "Cannot find module 'supertest'"**
```bash
npm install --save-dev supertest @types/supertest
```

### **Erro: "Token não obtido"**
- Verifique se o usuário `admin@email.com` existe no banco
- Verifique se a senha está correta: `Aupus123!`
- Verifique a rota de login: `/auth/login`

### **Erro: "Equipamento não encontrado"**
- Execute os testes com banco de desenvolvimento populado
- Crie ao menos 1 planta, 1 unidade e 3 equipamentos

### **Testes falhando intermitentemente**
- Alguns testes dependem de dados disponíveis
- Execute com `--runInBand` para rodar sequencialmente:
```bash
npm run test:e2e -- --runInBand planos-manutencao.e2e-spec.ts
```

### **Timeout nos testes**
- Aumente o timeout no Jest:
```bash
npm run test:e2e -- --testTimeout=30000 planos-manutencao.e2e-spec.ts
```

---

## 📝 Adicionando Novos Testes

### **Template de teste básico:**

```typescript
describe('GET /nova-rota', () => {
  it('deve retornar dados esperados', async () => {
    const response = await request(app.getHttpServer())
      .get('/nova-rota')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('campo_esperado');
    expect(typeof response.body.campo_esperado).toBe('string');
  });

  it('deve retornar erro sem autenticação', async () => {
    await request(app.getHttpServer())
      .get('/nova-rota')
      .expect(401);
  });
});
```

---

## 🎯 Checklist de Testes

Use este checklist ao adicionar novos endpoints:

- [ ] Teste de sucesso (200/201)
- [ ] Teste sem autenticação (401)
- [ ] Teste com dados inválidos (400)
- [ ] Teste de recurso não encontrado (404)
- [ ] Teste de conflito (409)
- [ ] Teste de validação de campos obrigatórios
- [ ] Teste de paginação (se aplicável)
- [ ] Teste de filtros (se aplicável)
- [ ] Teste de ordenação (se aplicável)
- [ ] Teste de relacionamentos (se aplicável)

---

## 📚 Recursos Úteis

- [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)

---

**Criado em:** 2026-03-04
**Total de Testes:** 25+
**Cobertura:** 13 endpoints testados
**Tempo médio de execução:** ~25 segundos
