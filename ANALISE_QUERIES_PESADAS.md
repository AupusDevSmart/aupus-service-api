# 🚨 ANÁLISE: QUERIES PESADAS - equipamentos-dados.service.ts

## PROBLEMA IDENTIFICADO

Pico de uso de CPU/memória causado por queries pesadas sem paginação na tabela `equipamentos_dados`.

---

## 🔴 QUERIES CRÍTICAS (Sem LIMIT)

### 1. `getGraficoDia()` - Linha 227
```typescript
const dados = await this.prisma.equipamentos_dados.findMany({
  where: {
    equipamento_id: equipamentoId,
    timestamp_dados: {
      gte: dataConsulta,
      lt: dataFim,
    },
  },
  orderBy: { timestamp_dados: 'asc' },
  select: {
    timestamp_dados: true,
    dados: true,
    num_leituras: true,
    qualidade: true,
  },
});
```

**Problema:**
- Busca **TODAS** as linhas de 24 horas (pode ser 1440+ registros se 1 por minuto)
- Sem `take` ou `skip`
- Faz processamento pesado depois (agregação, suavização)

**Impacto:** 🔥🔥🔥 ALTO
- Chamado toda vez que usuário visualiza gráfico
- Pode retornar milhares de linhas
- Consome muita memória

---

### 2. `getGraficoDiaMultiplosInversores()` - Linha 617
```typescript
const dados = await this.prisma.equipamentos_dados.findMany({
  where: {
    equipamento_id: { in: equipamentosIds }, // MÚLTIPLOS!
    timestamp_dados: {
      gte: dataConsulta,
      lt: dataFim,
    },
  },
  orderBy: { timestamp_dados: 'asc' },
  select: {
    equipamento_id: true,
    timestamp_dados: true,
    dados: true,
    qualidade: true,
  },
});
```

**Problema:**
- Busca dados de **MÚLTIPLOS** equipamentos de uma vez
- 24 horas × N equipamentos = MILHARES de registros
- Processamento complexo de agregação
- **Console.logs em PRODUÇÃO** (linhas 578-796) - PIOR AINDA!

**Impacto:** 🔥🔥🔥🔥 MUITO ALTO
- Pior que o anterior (múltiplos equipamentos)
- Logs no console diminuem performance
- Pode travar o servidor

---

### 3. `getGraficoMesMultiplosInversores()` - Linha 843
```typescript
const dados = await this.prisma.equipamentos_dados.findMany({
  where: {
    equipamento_id: { in: equipamentosIds },
    timestamp_dados: {
      gte: dataInicio,
      lt: dataFim,
    },
  },
  orderBy: { timestamp_dados: 'asc' },
  select: {
    equipamento_id: true,
    timestamp_dados: true,
    dados: true,
  },
});
```

**Problema:**
- Busca MÊS INTEIRO de múltiplos equipamentos
- 30 dias × 1440 minutos × N equipamentos = DEZENAS DE MILHARES

**Impacto:** 🔥🔥🔥🔥🔥 CRÍTICO
- Pode retornar 50.000+ registros
- OOM (Out of Memory) possível

---

### 4. `getGraficoAnoMultiplosInversores()` - Linha 1007
```typescript
const dados = await this.prisma.equipamentos_dados.findMany({
  where: {
    equipamento_id: { in: equipamentosIds },
    timestamp_dados: {
      gte: dataInicio,
      lt: dataFim,
    },
  },
  orderBy: { timestamp_dados: 'asc' },
  select: {
    equipamento_id: true,
    timestamp_dados: true,
    dados: true,
  },
});
```

**Problema:**
- Busca ANO INTEIRO de múltiplos equipamentos
- 365 dias × 1440 minutos × N equipamentos = CENTENAS DE MILHARES

**Impacto:** 🔥🔥🔥🔥🔥 CRÍTICO
- Pode retornar 500.000+ registros
- **CRASH DO SERVIDOR** garantido

---

## 🛠️ SOLUÇÕES IMEDIATAS

### **Solução 1: Usar $queryRaw com agregação no banco**

Ao invés de buscar todas as linhas e processar no Node.js:

```typescript
// ❌ ANTES (RUIM)
const dados = await this.prisma.equipamentos_dados.findMany({
  where: { equipamento_id, timestamp_dados: { gte, lt } }
});
// Depois processar no Node...

// ✅ DEPOIS (BOM)
const dados = await this.prisma.$queryRaw`
  SELECT
    DATE_TRUNC('minute', timestamp_dados) as minuto,
    AVG((dados->>'potencia_kw')::numeric) as potencia_kw,
    COUNT(*) as num_leituras
  FROM equipamentos_dados
  WHERE equipamento_id = ${equipamentoId}
    AND timestamp_dados >= ${dataConsulta}
    AND timestamp_dados < ${dataFim}
  GROUP BY DATE_TRUNC('minute', timestamp_dados)
  ORDER BY minuto ASC
  LIMIT 1440 -- Máximo 1 dia com 1 minuto de resolução
`;
```

**Benefícios:**
- Agregação no banco (muito mais rápido)
- Menos dados trafegados
- Menos memória no Node.js

---

### **Solução 2: Adicionar LIMIT em TODAS as findMany**

```typescript
// ✅ Sempre adicionar take
const dados = await this.prisma.equipamentos_dados.findMany({
  where: { ... },
  take: 5000, // Máximo de registros
  orderBy: { timestamp_dados: 'asc' },
});

// Se precisar de mais, usar paginação
if (dados.length === 5000) {
  console.warn('⚠️ Query atingiu limite, considere paginação');
}
```

---

### **Solução 3: Remover console.logs em produção**

```typescript
// ❌ ANTES (linhas 578, 611, 637, 738, 765, 784, 794, etc)
console.log(`📊 [GRÁFICO DIA MÚLTIPLO] ...`);

// ✅ DEPOIS
if (process.env.NODE_ENV !== 'production') {
  console.log(`📊 [GRÁFICO DIA MÚLTIPLO] ...`);
}

// OU usar logger apropriado
this.logger.debug(`📊 [GRÁFICO DIA MÚLTIPLO] ...`);
```

---

### **Solução 4: Adicionar cache**

```typescript
import { Cache } from '@nestjs/cache-manager';

@Injectable()
export class EquipamentosDadosService {
  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache
  ) {}

  async getGraficoDia(equipamentoId: string, data?: string) {
    const cacheKey = `grafico-dia:${equipamentoId}:${data || 'hoje'}`;

    // Verificar cache (TTL 5 minutos)
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Buscar dados
    const result = await this.buscarDadosGraficoDia(...);

    // Salvar no cache
    await this.cacheManager.set(cacheKey, result, 300000); // 5 min

    return result;
  }
}
```

---

### **Solução 5: Criar índices no banco**

```sql
-- Índice composto para queries de gráficos
CREATE INDEX idx_equipamentos_dados_equip_timestamp
ON equipamentos_dados (equipamento_id, timestamp_dados DESC);

-- Índice para múltiplos equipamentos
CREATE INDEX idx_equipamentos_dados_multi
ON equipamentos_dados (equipamento_id, timestamp_dados)
WHERE qualidade = 'GOOD';
```

---

## 📊 PRIORIDADES DE CORREÇÃO

| Prioridade | Query | Ação | Estimativa |
|------------|-------|------|------------|
| 🔥🔥🔥🔥🔥 P0 | getGraficoAnoMultiplosInversores | Usar $queryRaw + limit | 2h |
| 🔥🔥🔥🔥🔥 P0 | getGraficoMesMultiplosInversores | Usar $queryRaw + limit | 2h |
| 🔥🔥🔥🔥 P1 | getGraficoDiaMultiplosInversores | Remover console.logs + limit | 1h |
| 🔥🔥🔥 P2 | getGraficoDia | Adicionar limit | 30min |
| 🔥🔥 P3 | Todas | Adicionar cache | 1h |
| 🔥 P4 | Database | Criar índices | 15min |

**Total estimado:** ~7 horas

---

## 🎯 QUICK FIX (10 minutos)

Se precisa de solução IMEDIATA para parar o pico:

```typescript
// No início de cada função getGrafico*MultiplosInversores
if (equipamentosIds.length > 3) {
  throw new BadRequestException('Máximo de 3 equipamentos por vez');
}
```

E adicionar nos findMany:
```typescript
take: 5000, // Limite de segurança
```

---

## 📝 RESUMO

**Causa raiz:** Queries sem paginação buscando milhares/milhões de registros

**Sintomas:**
- Pico de CPU
- Consumo alto de memória
- Lentidão geral da API
- Possível crash

**Solução imediata:** Adicionar `take: 5000` em todos os findMany

**Solução definitiva:** Migrar para $queryRaw com agregação no banco

---

**Criado em:** 2025-01-XX
**Arquivo:** `aupus-service-api/src/modules/equipamentos-dados/equipamentos-dados.service.ts`
