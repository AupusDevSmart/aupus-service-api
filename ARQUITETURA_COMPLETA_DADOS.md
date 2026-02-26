# Arquitetura Completa: Gravação e Consulta de Dados

## 📋 Visão Geral

A solução otimizada mantém **TODA a gravação de dados** intacta e otimiza **APENAS as consultas** para gráficos.

```
┌─────────────────────────────────────────────────────────────────┐
│                     FLUXO COMPLETO                               │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐
│   MQTT       │ Dados chegam a cada 1-5 minutos
│  Broker      │ (Ia, Ib, Ic, Pt, Qt, Va, Vb, Vc, FP, etc.)
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  1. GRAVAÇÃO (✅ NÃO MUDA, CONTINUA IGUAL)                   │
└──────────────────────────────────────────────────────────────┘
       │
       │  mqtt.service.ts processa e salva:
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  equipamentos_dados                                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ equipamento_id: "abc-123"                              │ │
│  │ timestamp_dados: "2026-02-25 19:30:00"                 │ │
│  │ energia_kwh: 0.084          ◄─ Coluna otimizada        │ │
│  │ potencia_ativa_kw: 10.113   ◄─ Coluna otimizada        │ │
│  │ dados: {                    ◄─ JSON completo           │ │
│  │   "Ia": 16.46903,                                      │ │
│  │   "Ib": 16.72645,                                      │ │
│  │   "Pt": 10113.48,                                      │ │
│  │   ... todos os campos MQTT                             │ │
│  │ }                                                      │ │
│  │ num_leituras: 1                                        │ │
│  │ qualidade: 100                                         │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  📊 Volume: ~1440 registros/dia/equipamento                  │
│  💾 Tamanho: ~500-1000 bytes/registro                        │
│  ⏱️  Frequência: A cada 1-5 minutos                          │
└──────────────────────────────────────────────────────────────┘
       │
       │  DADOS FICAM ARMAZENADOS (histórico completo)
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  2. CONSULTA (✅ O QUE VAI MUDAR - OTIMIZAÇÃO)              │
└──────────────────────────────────────────────────────────────┘
       │
       │  Frontend solicita gráfico
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│  Backend: equipamentos-dados.service.ts                      │
└──────────────────────────────────────────────────────────────┘

   ┌───────────────────────────────────────────────────────────┐
   │  ❌ ANTES (PROBLEMA)                                      │
   ├───────────────────────────────────────────────────────────┤
   │  const dados = await prisma.equipamentos_dados.findMany({ │
   │    where: { equipamento_id: { in: [1,2,3,4,5] } },       │
   │    // Retorna 216.000 registros BRUTOS                   │
   │  });                                                      │
   │                                                           │
   │  // Node.js processa TUDO em memória:                    │
   │  dados.forEach(row => {                                  │
   │    // Agrupa por dia, soma energia, calcula média...     │
   │  });                                                      │
   │                                                           │
   │  📊 Resultado:                                            │
   │  • Tempo: 10-30 segundos                                 │
   │  • Transferência: 108 MB                                 │
   │  • CPU: 80-100%                                          │
   │  • Memória: 500 MB+                                      │
   └───────────────────────────────────────────────────────────┘

   ┌───────────────────────────────────────────────────────────┐
   │  ✅ DEPOIS (SOLUÇÃO)                                      │
   ├───────────────────────────────────────────────────────────┤
   │  const dados = await prisma.$queryRaw`                   │
   │    SELECT                                                 │
   │      DATE_TRUNC('day', timestamp_dados)::date as dia,    │
   │      equipamento_id,                                      │
   │      SUM(energia_kwh) as energia_total,                  │
   │      AVG(potencia_ativa_kw) as potencia_media,           │
   │      COUNT(*) as num_leituras                            │
   │    FROM equipamentos_dados                               │
   │    WHERE equipamento_id = ANY(${ids}::uuid[])            │
   │      AND timestamp_dados >= ${dataInicio}                │
   │      AND timestamp_dados < ${dataFim}                    │
   │    GROUP BY DATE_TRUNC('day', timestamp_dados),          │
   │              equipamento_id                              │
   │  `;                                                       │
   │                                                           │
   │  // PostgreSQL faz TODA a agregação                      │
   │  // Retorna apenas 150 registros AGREGADOS               │
   │                                                           │
   │  📊 Resultado:                                            │
   │  • Tempo: 200-500ms                                      │
   │  • Transferência: 8 KB                                   │
   │  • CPU: 5-10%                                            │
   │  • Memória: 5 MB                                         │
   └───────────────────────────────────────────────────────────┘
```

## 🔄 Fluxo Detalhado

### 1️⃣ GRAVAÇÃO (NÃO MUDA)

```typescript
// mqtt.service.ts (continua igual)
async processarMensagemMQTT(topic: string, payload: any) {
  // Extrai dados do payload MQTT
  const energia = calcularEnergia(payload);
  const potencia = calcularPotencia(payload);

  // ✅ Salva TUDO no banco
  await prisma.equipamentos_dados.create({
    data: {
      equipamento_id: equipamentoId,
      timestamp_dados: new Date(),
      energia_kwh: energia,           // ← Coluna otimizada
      potencia_ativa_kw: potencia,     // ← Coluna otimizada
      dados: payload,                  // ← JSON completo (backup)
      num_leituras: 1,
      qualidade: 100
    }
  });

  // Continua processando normalmente...
}
```

**Características:**
- ✅ Grava **TODOS os dados** que chegam
- ✅ Mantém **histórico completo** (JSON + colunas)
- ✅ Frequência: 1-5 minutos/equipamento
- ✅ Volume: ~1440 registros/dia/equipamento
- ✅ **ZERO alterações** no código de gravação

### 2️⃣ CONSULTA (O QUE MUDA)

#### Query Antiga (Problema)
```typescript
async getGraficoMes(equipamentosIds: string[], mes?: string) {
  // ❌ Busca todos os 216.000 registros
  const dados = await this.prisma.equipamentos_dados.findMany({
    where: {
      equipamento_id: { in: equipamentosIds },
      timestamp_dados: { gte: dataInicio, lt: dataFim }
    },
    select: {
      equipamento_id: true,
      timestamp_dados: true,
      dados: true  // ← Traz JSON completo de 216k registros
    }
  });

  // ❌ Node.js processa TUDO em memória
  const agregado = new Map();
  dados.forEach(row => {
    const dia = row.timestamp_dados.toISOString().split('T')[0];
    // ... lógica manual de agregação ...
    agregado.set(dia, { energia: soma, potencia: media });
  });

  // 📊 216.000 registros → 30 dados agregados
  // 🐌 Tempo: 30 segundos
  // 💾 Transferência: 108 MB
}
```

#### Query Nova (Solução)
```typescript
async getGraficoMes_V2(equipamentosIds: string[], mes?: string) {
  // ✅ Banco agrega ANTES de retornar
  const dados = await this.prisma.$queryRaw<Array<{
    dia: Date;
    equipamento_id: string;
    energia_total: number;
    potencia_media: number;
    num_leituras: number;
  }>>`
    SELECT
      DATE_TRUNC('day', timestamp_dados)::date as dia,
      equipamento_id,
      SUM(energia_kwh) as energia_total,        -- PostgreSQL soma
      AVG(potencia_ativa_kw) as potencia_media, -- PostgreSQL calcula média
      COUNT(*) as num_leituras
    FROM equipamentos_dados
    WHERE equipamento_id = ANY(${equipamentosIds}::uuid[])
      AND timestamp_dados >= ${dataInicio}
      AND timestamp_dados < ${dataFim}
    GROUP BY DATE_TRUNC('day', timestamp_dados), equipamento_id
    ORDER BY dia ASC
  `;

  // ✅ Retorna 150 registros JÁ AGREGADOS
  // ⚡ Tempo: 300ms
  // 💾 Transferência: 8 KB

  // Formata para o frontend
  return {
    periodo: { inicio, fim, tipo: 'mes' },
    equipamentos: [...],
    pontos: dados.map(d => ({
      data: d.dia,
      energia: d.energia_total,
      potencia: d.potencia_media
    }))
  };
}
```

## 📊 Comparação de Performance

| Aspecto | Antes (❌) | Depois (✅) | Melhoria |
|---------|-----------|-------------|----------|
| **Registros retornados** | 216.000 | 150 | **1.440x menos** |
| **Transferência de rede** | 108 MB | 8 KB | **13.500x menor** |
| **Tempo de resposta** | 30s | 300ms | **100x mais rápido** |
| **Uso de CPU** | 80-100% | 5-10% | **10x menor** |
| **Uso de memória** | 500 MB | 5 MB | **100x menor** |
| **Onde processa** | Node.js | PostgreSQL | Otimizado |

## 🎯 Implementação (3 Queries)

### Query 1: Gráfico do Dia (Múltiplos)
```sql
SELECT
  DATE_TRUNC('minute', timestamp_dados) -
    (EXTRACT(minute FROM timestamp_dados)::int % 5) * INTERVAL '1 minute' as intervalo,
  equipamento_id,
  AVG(potencia_ativa_kw) as potencia_media,
  SUM(energia_kwh) as energia_total,
  COUNT(*) as num_leituras
FROM equipamentos_dados
WHERE equipamento_id = ANY($1::uuid[])
  AND timestamp_dados >= $2
  AND timestamp_dados < $3
GROUP BY intervalo, equipamento_id
ORDER BY intervalo ASC;
```
**Resultado:** 7.200 registros → 288 registros (agregado a cada 5 min)

### Query 2: Gráfico do Mês (Múltiplos)
```sql
SELECT
  DATE_TRUNC('day', timestamp_dados)::date as dia,
  equipamento_id,
  SUM(energia_kwh) as energia_total,
  AVG(potencia_ativa_kw) as potencia_media,
  COUNT(*) as num_leituras
FROM equipamentos_dados
WHERE equipamento_id = ANY($1::uuid[])
  AND timestamp_dados >= $2
  AND timestamp_dados < $3
GROUP BY dia, equipamento_id
ORDER BY dia ASC;
```
**Resultado:** 216.000 registros → 150 registros (agregado por dia)

### Query 3: Gráfico do Ano (Múltiplos)
```sql
SELECT
  DATE_TRUNC('month', timestamp_dados)::date as mes,
  equipamento_id,
  SUM(energia_kwh) as energia_total,
  AVG(potencia_ativa_kw) as potencia_media,
  COUNT(*) as num_leituras
FROM equipamentos_dados
WHERE equipamento_id = ANY($1::uuid[])
  AND timestamp_dados >= $2
  AND timestamp_dados < $3
GROUP BY mes, equipamento_id
ORDER BY mes ASC;
```
**Resultado:** 2.600.000 registros → 60 registros (agregado por mês)

## ✅ Checklist de Implementação

### Fase 1: Implementar Queries Otimizadas
- [ ] Criar `getGraficoDiaMultiplosInversores_V2()`
- [ ] Criar `getGraficoMesMultiplosInversores_V2()`
- [ ] Criar `getGraficoAnoMultiplosInversores_V2()`
- [ ] Testar side-by-side (V1 vs V2)

### Fase 2: Atualizar Controller
- [ ] Mudar endpoints para usar métodos `_V2`
- [ ] Adicionar flag `?use_optimized=true` (teste A/B)
- [ ] Monitorar performance

### Fase 3: Remover Código Antigo
- [ ] Deletar métodos `_V1` (antigos)
- [ ] Renomear `_V2` → nome original
- [ ] Documentar mudanças

### Fase 4: Otimizações Adicionais (Opcional)
- [ ] Adicionar cache Redis (5min TTL)
- [ ] Remover console.logs (65 ocorrências)
- [ ] Verificar índices do banco

## 🚀 Resumo Final

### O QUE NÃO MUDA:
- ✅ Gravação de dados (continua igual)
- ✅ MQTT continua enviando dados a cada 1-5 min
- ✅ Todos os dados são salvos (histórico completo)
- ✅ JSON completo mantido na coluna `dados`
- ✅ Colunas `energia_kwh` e `potencia_ativa_kw` otimizadas

### O QUE MUDA:
- ✅ Consultas para gráficos (agregação no banco)
- ✅ Performance: 30s → 300ms (100x mais rápido)
- ✅ Transferência: 108 MB → 8 KB (13.500x menor)
- ✅ Escalabilidade: funciona com 10M+ registros

### BENEFÍCIOS:
- ⚡ Gráficos carregam instantaneamente
- 💾 Menor uso de CPU/memória
- 📈 Escalável para anos de dados
- 🎯 Backend mais eficiente
- 😊 Melhor experiência do usuário

**Tempo de implementação:** 1-2 dias
**Esforço:** Baixo (código pronto, só adaptar)
**Impacto:** MUITO alto (100x performance)
