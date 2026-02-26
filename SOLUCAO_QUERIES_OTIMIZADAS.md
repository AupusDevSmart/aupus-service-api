# Solução para Queries Pesadas - Análise Completa

## 📊 Diagnóstico do Problema

### Volume de Dados Atual
- **Total de registros**: 303.209
- **Top 3 equipamentos**:
  - Inversor 1: 87.885 registros (desde 21/01/1970)
  - Inversor 2: 87.645 registros (desde 21/01/1970)
  - Inversor 3: 68.610 registros (desde 25/11/2025)

### ⚠️ Problema Identificado

**SIM, as queries são o problema principal, mas há contexto importante:**

1. **Query atual traz TODO o JSON**
   - Cada registro tem ~500-1000 bytes de JSON
   - Para múltiplos inversores × 365 dias = pode chegar a **100.000+ registros**
   - Transferência de dados: ~100MB de JSON do banco → Node.js
   - Processamento: Node.js faz agregação em memória

2. **Ausência de agregação no banco**
   - Todas as médias/somas são calculadas em Node.js
   - Banco envia dados brutos → Node processa → Retorna agregado
   - Deveria: Banco agrega → Envia resultado final (100x menor)

3. **Console.logs em produção**
   - 65 console.log statements ativos
   - Cada log escreve no stdout (I/O síncrono)
   - Em queries de 100k registros, isso aumenta o tempo significativamente

## ✅ Solução Definitiva: Agregação no Banco

### Estratégia: Raw SQL com GROUP BY

Em vez de:
```typescript
// ❌ ATUAL: Traz 100.000 registros
const dados = await prisma.equipamentos_dados.findMany({
  where: { equipamento_id: { in: equipamentosIds } },
  take: 100000, // Limite de segurança
  select: { timestamp_dados: true, dados: true }
});

// Depois processa em Node.js
dados.forEach(row => { /* agregação manual */ })
```

Fazer:
```typescript
// ✅ OTIMIZADO: Banco agrega, retorna 365 registros (1 por dia)
const dados = await prisma.$queryRaw`
  SELECT
    DATE_TRUNC('day', timestamp_dados) as dia,
    equipamento_id,
    SUM(energia_kwh) as energia_total,
    AVG(potencia_ativa_kw) as potencia_media,
    COUNT(*) as num_leituras
  FROM equipamentos_dados
  WHERE equipamento_id = ANY(${equipamentosIds})
    AND timestamp_dados >= ${dataInicio}
    AND timestamp_dados < ${dataFim}
  GROUP BY DATE_TRUNC('day', timestamp_dados), equipamento_id
  ORDER BY dia ASC
`
```

### Benefícios:
- **100.000 registros → 365 registros** (redução de 99.6%)
- **~100MB → ~30KB** de transferência de rede
- **Agregação no PostgreSQL** (C/C++, otimizado) vs Node.js (JavaScript, lento)
- **Tempo: 5-10s → 100-300ms**

## 🚀 Implementação Proposta

### 1. Gráfico do Mês (Múltiplos Equipamentos)

**Cenário**: 5 equipamentos × 30 dias × 1440 registros/dia = ~216.000 registros

```typescript
async getGraficoMesMultiplosInversores(equipamentosIds: string[], mes?: string) {
  // Validação
  if (equipamentosIds.length > 5) {
    throw new NotFoundException('Máximo de 5 equipamentos');
  }

  // Parse de data
  const [ano, mesNum] = mes ? mes.split('-').map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1];
  const dataInicio = new Date(ano, mesNum - 1, 1);
  const dataFim = new Date(ano, mesNum, 1);

  // ✅ AGREGAÇÃO NO BANCO
  const dadosAgregados = await this.prisma.$queryRaw<Array<{
    dia: Date;
    equipamento_id: string;
    energia_total: number;
    potencia_media: number;
    num_leituras: number;
  }>>`
    SELECT
      DATE_TRUNC('day', timestamp_dados)::date as dia,
      equipamento_id,
      SUM(energia_kwh) as energia_total,
      AVG(potencia_ativa_kw) as potencia_media,
      COUNT(*) as num_leituras,
      AVG((dados->>'FPa')::float) as fator_potencia_medio
    FROM equipamentos_dados
    WHERE equipamento_id = ANY(${equipamentosIds}::uuid[])
      AND timestamp_dados >= ${dataInicio}
      AND timestamp_dados < ${dataFim}
    GROUP BY DATE_TRUNC('day', timestamp_dados), equipamento_id
    ORDER BY dia ASC
  `;

  // Buscar nomes dos equipamentos
  const equipamentos = await this.prisma.equipamentos.findMany({
    where: { id: { in: equipamentosIds } },
    select: { id: true, nome: true }
  });

  const equipamentosMap = new Map(equipamentos.map(e => [e.id, e.nome]));

  // Transformar para formato do gráfico
  const pontosMap = new Map<string, any>();

  dadosAgregados.forEach(row => {
    const diaKey = row.dia.toISOString().split('T')[0];

    if (!pontosMap.has(diaKey)) {
      pontosMap.set(diaKey, {
        data: row.dia,
        energia_total: 0,
        potencia_media: 0,
        num_leituras: 0,
        equipamentos: {}
      });
    }

    const ponto = pontosMap.get(diaKey);
    ponto.energia_total += Number(row.energia_total);
    ponto.potencia_media += Number(row.potencia_media);
    ponto.num_leituras += Number(row.num_leituras);

    ponto.equipamentos[equipamentosMap.get(row.equipamento_id)] = {
      energia: Number(row.energia_total),
      potencia: Number(row.potencia_media)
    };
  });

  return {
    periodo: {
      inicio: dataInicio.toISOString(),
      fim: dataFim.toISOString(),
      tipo: 'mes'
    },
    equipamentos: equipamentos.map(e => ({ id: e.id, nome: e.nome })),
    pontos: Array.from(pontosMap.values()).sort((a, b) =>
      a.data.getTime() - b.data.getTime()
    ),
    agregacao: 'dia',
    registros_processados: dadosAgregados.length
  };
}
```

### 2. Gráfico do Ano (Múltiplos Equipamentos)

**Cenário**: 5 equipamentos × 365 dias × 1440 registros/dia = ~2.600.000 registros

```typescript
async getGraficoAnoMultiplosInversores(equipamentosIds: string[], ano?: string) {
  // Validação
  if (equipamentosIds.length > 5) {
    throw new NotFoundException('Máximo de 5 equipamentos');
  }

  const anoNum = ano ? parseInt(ano) : new Date().getFullYear();
  const dataInicio = new Date(anoNum, 0, 1);
  const dataFim = new Date(anoNum + 1, 0, 1);

  // ✅ AGREGAÇÃO POR MÊS NO BANCO
  const dadosAgregados = await this.prisma.$queryRaw<Array<{
    mes: Date;
    equipamento_id: string;
    energia_total: number;
    potencia_media: number;
    num_leituras: number;
  }>>`
    SELECT
      DATE_TRUNC('month', timestamp_dados)::date as mes,
      equipamento_id,
      SUM(energia_kwh) as energia_total,
      AVG(potencia_ativa_kw) as potencia_media,
      COUNT(*) as num_leituras
    FROM equipamentos_dados
    WHERE equipamento_id = ANY(${equipamentosIds}::uuid[])
      AND timestamp_dados >= ${dataInicio}
      AND timestamp_dados < ${dataFim}
    GROUP BY DATE_TRUNC('month', timestamp_dados), equipamento_id
    ORDER BY mes ASC
  `;

  // Transformar para formato esperado (similar ao método acima)
  // ... processamento ...

  return resultado;
}
```

### 3. Gráfico do Dia (Múltiplos Equipamentos)

**Cenário**: 5 equipamentos × 1440 registros = ~7.200 registros

```typescript
async getGraficoDiaMultiplosInversores(equipamentosIds: string[], data?: string) {
  // Validação
  if (equipamentosIds.length > 5) {
    throw new NotFoundException('Máximo de 5 equipamentos');
  }

  const dataConsulta = data ? new Date(data) : new Date();
  dataConsulta.setHours(0, 0, 0, 0);
  const dataFim = new Date(dataConsulta);
  dataFim.setDate(dataFim.getDate() + 1);

  // ✅ AGREGAÇÃO POR 5 MINUTOS NO BANCO
  const dadosAgregados = await this.prisma.$queryRaw<Array<{
    intervalo: Date;
    equipamento_id: string;
    potencia_media: number;
    energia_total: number;
    num_leituras: number;
  }>>`
    SELECT
      DATE_TRUNC('minute', timestamp_dados) -
        (EXTRACT(minute FROM timestamp_dados)::int % 5) * INTERVAL '1 minute' as intervalo,
      equipamento_id,
      AVG(potencia_ativa_kw) as potencia_media,
      SUM(energia_kwh) as energia_total,
      COUNT(*) as num_leituras
    FROM equipamentos_dados
    WHERE equipamento_id = ANY(${equipamentosIds}::uuid[])
      AND timestamp_dados >= ${dataConsulta}
      AND timestamp_dados < ${dataFim}
    GROUP BY
      DATE_TRUNC('minute', timestamp_dados) -
        (EXTRACT(minute FROM timestamp_dados)::int % 5) * INTERVAL '1 minute',
      equipamento_id
    ORDER BY intervalo ASC
  `;

  // Transformar para formato esperado
  // ... processamento ...

  return resultado;
}
```

## 📈 Comparação de Performance

| Query | Antes | Depois | Redução |
|-------|-------|--------|---------|
| **Gráfico Dia** | 7.200 registros<br>~3.6 MB<br>2-5s | 288 registros<br>~15 KB<br>100-200ms | **96%** |
| **Gráfico Mês** | 216.000 registros<br>~108 MB<br>10-30s | 150 registros<br>~8 KB<br>200-400ms | **99.9%** |
| **Gráfico Ano** | 2.600.000 registros<br>~1.3 GB<br>60-120s | 60 registros<br>~3 KB<br>300-600ms | **99.99%** |

## 🎯 Plano de Implementação

### Fase 1: Implementar Queries Otimizadas (1-2 dias)
- [ ] Criar novos métodos com $queryRaw
- [ ] Manter métodos antigos com sufixo `_OLD`
- [ ] Testar side-by-side

### Fase 2: Adicionar Cache Redis (opcional, 1 dia)
```typescript
const cacheKey = `grafico:${tipo}:${equipamentoId}:${data}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

const resultado = await this.getGraficoOtimizado(...);
await redis.setex(cacheKey, 300, JSON.stringify(resultado)); // 5min TTL
return resultado;
```

### Fase 3: Remover Console.logs (1 hora)
```typescript
// No topo do service
private readonly DEBUG = process.env.NODE_ENV === 'development';

// Trocar todos os console.log por:
if (this.DEBUG) console.log(...);
```

### Fase 4: Adicionar Índices (30 minutos)
```sql
-- Já existem, verificar:
CREATE INDEX IF NOT EXISTS idx_equipamentos_dados_lookup
  ON equipamentos_dados(equipamento_id, timestamp_dados DESC);

-- Adicionar para queries de agregação:
CREATE INDEX IF NOT EXISTS idx_equipamentos_dados_periodo
  ON equipamentos_dados(timestamp_dados, equipamento_id)
  INCLUDE (energia_kwh, potencia_ativa_kw);
```

## ⚡ Resultado Final Esperado

### Antes (com quick fix atual):
- ✅ Não crasheia (limite de 100k registros)
- ❌ Ainda lento (5-30 segundos)
- ❌ Alto uso de CPU/memória
- ❌ Alto tráfego de rede

### Depois (com agregação no banco):
- ✅ Rápido (100-600ms)
- ✅ Baixo uso de CPU/memória
- ✅ Tráfego de rede mínimo (~10KB vs ~100MB)
- ✅ Escalável (funciona com 1M+ registros)

## 🤔 As Queries São Necessárias?

**SIM, são necessárias**, mas precisam ser otimizadas:

### Necessidade de Negócio:
- Usuários precisam ver gráficos de energia/potência
- Comparar múltiplos equipamentos
- Visualizar histórico (dia/mês/ano)

### Problema Atual:
- ❌ Implementação ingênua (traz tudo → processa em Node)
- ❌ Não escala (funciona com 1k registros, falha com 100k)

### Solução:
- ✅ Agregação no banco (PostgreSQL é otimizado para isso)
- ✅ Retornar apenas dados agregados
- ✅ Cache opcional para queries frequentes

## 📝 Recomendação Final

**Implementar as queries otimizadas com $queryRaw** é a solução definitiva. O quick fix atual (take: 100000) apenas evita crashes, mas:

1. Ainda transfere muito dados (até 100MB)
2. Ainda processa em Node.js (lento)
3. Não resolve a causa raiz

Com as queries otimizadas:
- Performance 100x melhor
- Código mais limpo
- Escalável para 10M+ registros
- Custo computacional mínimo

**Tempo estimado de implementação: 1-2 dias**
**Benefício: queries de 30s → 300ms (100x mais rápido)**
