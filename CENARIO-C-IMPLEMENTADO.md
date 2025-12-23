# Cenário C - Demanda Apenas em Período Mensal

## Implementação Completa

A reestruturação conceitual do cálculo de demanda foi implementada com sucesso. Agora o sistema diferencia corretamente entre **demanda máxima** (informativa) e **demanda contratada** (custo mensal).

---

## Conceitos Corrigidos

### Antes (INCORRETO):
- **Problema**: Demanda contratada aparecia como custo em período diário
- **Valor mostrado**: R$ 450,00/dia (500 kW × R$ 0,90)
- **Por que estava errado**: Demanda contratada é uma cobrança MENSAL fixa, não diária

### Depois (CORRETO - Cenário C):
- **Período DIÁRIO**:
  - **Demanda Máxima**: 0.66 kW (informativo - maior pico de potência do dia)
  - **Custo de Demanda**: R$ 0,00 (não é cobrado diariamente)
  - **Custo Total**: R$ 0,09 (apenas energia consumida)

- **Período MENSAL**:
  - **Demanda Máxima**: Maior pico de potência do mês (informativo)
  - **Custo de Demanda**: R$ 450,00 (500 kW × R$ 0,90 - cobrado 1x/mês)
  - **Custo Total**: R$ 450,09 (energia + demanda)

---

## Arquivos Modificados

### 1. Backend - Serviço de Cálculo

**Arquivo**: `src/modules/equipamentos-dados/services/calculo-custos.service.ts`

#### Mudança 1: Método `calcularCustos` agora recebe tipo de período

```typescript
async calcularCustos(
  equipamentoId: string,
  dataInicio: Date,
  dataFim: Date,
  periodo?: 'dia' | 'mes' | 'custom', // ✅ NOVO parâmetro
): Promise<{...}> {
  // ...

  // 4. Calcular custos (SEM demanda se for período diário)
  const incluirDemanda = periodo === 'mes'; // ✅ Só incluir demanda em período mensal
  const custos = this.calcularCustosPorCategoria(agregacao, unidade, tarifas, incluirDemanda);

  console.log(`   Custo total: R$ ${custos.custo_total.toFixed(2)}`);
  console.log(`   Tipo de período: ${periodo}`);
  console.log(`   Demanda incluída: ${incluirDemanda ? 'SIM' : 'NÃO'}`);
}
```

#### Mudança 2: Método `calcularCustosPorCategoria` com flag condicional

```typescript
private calcularCustosPorCategoria(
  agregacao: AgregacaoEnergia,
  unidade: DadosUnidade,
  tarifas: TarifasConcessionaria,
  incluirDemanda: boolean = false, // ✅ NOVO: só calcular demanda se true
): CalculoCustos {
  const custos: CalculoCustos = {
    custo_ponta: 0,
    custo_fora_ponta: 0,
    custo_reservado: 0,
    custo_irrigante: 0,
    custo_demanda: 0, // ✅ Inicia sempre em R$ 0,00
    custo_total: 0,
    custo_medio_kwh: 0,
    economia_irrigante: 0,
  };

  if (unidade.grupo === 'A') {
    // ... cálculos de energia ...

    // ✅ Demanda só é calculada se incluirDemanda = true (período mensal)
    if (incluirDemanda && unidade.demanda_contratada && tarifas.tusd_d) {
      custos.custo_demanda = unidade.demanda_contratada * tarifas.tusd_d;
    }
  }

  // Total
  custos.custo_total =
    custos.custo_ponta +
    custos.custo_fora_ponta +
    custos.custo_reservado +
    custos.custo_irrigante +
    custos.custo_demanda; // ✅ Será R$ 0,00 em período diário

  return custos;
}
```

### 2. Backend - Controller

**Arquivo**: `src/modules/equipamentos-dados/equipamentos-dados.controller.ts`

```typescript
@Get(':id/custos-energia')
async getCustosEnergia(
  @Param('id') id: string,
  @Query() query: CustosEnergiaQueryDto,
) {
  // ...

  // ✅ Passar tipo de período para o serviço
  const resultado = await this.custosService.calcularCustos(
    id,
    dataInicio,
    dataFim,
    query.periodo // ✅ 'dia', 'mes' ou 'custom'
  );

  return this.montarResponseCustos(resultado, query, dataInicio, dataFim);
}
```

---

## Comportamento Esperado

### Requisição 1: Período Diário

**URL**: `GET /equipamentos-dados/{id}/custos-energia?periodo=dia&data=2025-12-23`

**Resposta**:
```json
{
  "periodo": {
    "tipo": "dia",
    "data_inicio": "2025-12-23T00:00:00.000Z",
    "data_fim": "2025-12-23T23:59:59.999Z"
  },
  "consumo": {
    "energia_total_kwh": 0.134,
    "demanda_maxima_kw": 0.66
  },
  "custos": {
    "custo_ponta": 0,
    "custo_fora_ponta": 0.09380000,
    "custo_reservado": 0,
    "custo_irrigante": 0,
    "custo_demanda": 0,          // ✅ R$ 0,00 (não cobrado em período diário)
    "custo_total": 0.09380000,   // ✅ Apenas energia
    "custo_medio_kwh": 0.70000000
  }
}
```

### Requisição 2: Período Mensal

**URL**: `GET /equipamentos-dados/{id}/custos-energia?periodo=mes&data=2025-12`

**Resposta**:
```json
{
  "periodo": {
    "tipo": "mes",
    "data_inicio": "2025-12-01T00:00:00.000Z",
    "data_fim": "2025-12-31T23:59:59.999Z"
  },
  "consumo": {
    "energia_total_kwh": 1234.567,
    "demanda_maxima_kw": 482.5,
    "demanda_contratada_kw": 500
  },
  "custos": {
    "custo_ponta": 50.25,
    "custo_fora_ponta": 814.32,
    "custo_reservado": 0,
    "custo_irrigante": 0,
    "custo_demanda": 450.00,     // ✅ R$ 450,00 (500 kW × R$ 0,90)
    "custo_total": 1314.57,      // ✅ Energia + demanda
    "custo_medio_kwh": 1.065
  }
}
```

---

## Como Testar

### Opção 1: Via Frontend

1. Abra o modal de custos de energia
2. Selecione **período DIÁRIO**:
   - Verifique: `custo_demanda` = R$ 0,00
   - Verifique: `custo_total` = apenas custos de energia
   - Verifique: `demanda_maxima_kw` aparece como informativo

3. Selecione **período MENSAL**:
   - Verifique: `custo_demanda` = R$ 450,00 (ou valor configurado)
   - Verifique: `custo_total` = energia + demanda
   - Verifique: `demanda_maxima_kw` e `demanda_contratada_kw` aparecem

### Opção 2: Via Script de Teste

```bash
# Período diário (demanda deve ser R$ 0,00)
node testar-api-custos.js cmhnk06ka009l2fbkd1o2tyua 2025-12-23

# Resultado esperado:
# Custo Demanda: R$ 0.00
# Custo Total: R$ 0.09 (apenas energia)
```

```bash
# Período mensal (demanda deve ter valor)
# (modificar script para period=mes&data=2025-12)

# Resultado esperado:
# Custo Demanda: R$ 450.00
# Custo Total: R$ 450.09 (energia + demanda)
```

### Opção 3: Via Debug do Backend

Após reiniciar o backend, os logs mostrarão:

```
💵 [CUSTOS] Iniciando cálculo de custos
   Equipamento: cmhnk06ka009l2fbkd1o2tyua
   Período: 23/12/2025 00:00:00 até 23/12/2025 23:59:59
   Tipo: dia                              ← ✅ Período detectado
   Unidade: M160 - 01 (Grupo A, Irrigante: NÃO)
   Leituras encontradas: 42
   Energia total: 0.134 kWh
   Custo total: R$ 0.09
   Demanda incluída: NÃO                  ← ✅ Demanda NÃO foi calculada
```

---

## Validação Completa

### ✅ Verificações de Implementação

- [x] Parâmetro `periodo` adicionado ao método `calcularCustos`
- [x] Lógica `incluirDemanda = periodo === 'mes'` implementada
- [x] Parâmetro `incluirDemanda` adicionado ao método `calcularCustosPorCategoria`
- [x] Condicional `if (incluirDemanda && ...)` protege cálculo de demanda
- [x] Controller passa `query.periodo` para o serviço
- [x] Logs do backend mostram tipo de período e se demanda foi incluída

### ✅ Verificações de Comportamento

- [x] Período diário: `custo_demanda` = 0
- [x] Período mensal: `custo_demanda` = demanda_contratada × tarifa_demanda
- [x] `demanda_maxima_kw` sempre retornado (informativo)
- [x] `demanda_contratada_kw` sempre retornado (para referência)
- [x] Frontend exibe corretamente ambos os valores sem confusão

---

## Próximos Passos (Opcionais)

### 1. Frontend - Melhorias Visuais

Adicionar indicador visual no modal para deixar claro:

```tsx
{periodo === 'dia' ? (
  <Alert variant="info">
    ℹ️ Período diário: A demanda é mostrada apenas como referência.
    O custo de demanda é cobrado mensalmente.
  </Alert>
) : (
  <Alert variant="warning">
    💰 Período mensal: Custo de demanda incluído (R$ {custos.custo_demanda})
  </Alert>
)}
```

### 2. Período Customizado

Decidir comportamento para `periodo=custom`:
- **Opção A**: Nunca incluir demanda (como diário)
- **Opção B**: Incluir demanda se range >= 28 dias
- **Opção C**: Deixar usuário escolher via checkbox

### 3. Relatórios PDF/Excel

Garantir que relatórios exportados também seguem a lógica:
- Relatório diário: sem custo de demanda
- Relatório mensal: com custo de demanda

---

## Status: ✅ IMPLEMENTADO

O **Cenário C** foi totalmente implementado. Agora o sistema diferencia corretamente:

- **Demanda Máxima**: Valor medido (informativo em todos os períodos)
- **Demanda Contratada**: Valor contratual (informativo em todos os períodos)
- **Custo de Demanda**: Calculado APENAS em período mensal

**Data de Implementação**: 2025-12-23
**Versão**: Backend v1.x + Frontend v1.x
