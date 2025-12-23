# Custos de Energia - Demanda Nunca Incluída

## Decisão Final

**A demanda contratada NÃO é mais incluída no cálculo de custos em nenhum período.**

---

## Regra Atual

### Para TODOS os Períodos:
- **Período DIA**: `custo_demanda = R$ 0,00` ❌
- **Período MÊS**: `custo_demanda = R$ 0,00` ❌
- **Período CUSTOM (qualquer duração)**: `custo_demanda = R$ 0,00` ❌

### O que é exibido:
- **Demanda Máxima** (kW): Valor informativo - maior pico de potência registrado no período
- **Demanda Contratada** (kW): Valor informativo - capacidade contratada pela unidade
- **Custo de Demanda**: Sempre R$ 0,00
- **Custo Total**: Apenas energia consumida (Ponta + Fora Ponta + Reservado + Irrigante)

---

## Arquivos Modificados

### 1. Backend - Lógica de Cálculo

**Arquivo**: `src/modules/equipamentos-dados/services/calculo-custos.service.ts`

```typescript
/**
 * Decide se deve incluir demanda contratada no cálculo de custos
 *
 * ATUALIZAÇÃO: Demanda nunca é incluída no cálculo
 * Apenas demanda_maxima_kw é exibida como informação
 */
private deveIncluirDemanda(
  periodo: 'dia' | 'mes' | 'custom' | undefined,
  dataInicio: Date,
  dataFim: Date,
): boolean {
  // Nunca incluir demanda no custo
  return false;
}
```

**Resultado**: `incluirDemanda` sempre será `false`, então o método `calcularCustosPorCategoria` nunca executará:

```typescript
// Esta condição nunca será verdadeira
if (incluirDemanda && unidade.demanda_contratada && tarifas.tusd_d) {
  custos.custo_demanda = unidade.demanda_contratada * tarifas.tusd_d;
}
```

### 2. Frontend - Badge Informativo

**Arquivo**: `AupusNexOn/src/features/supervisorio/components/m160-modal.tsx`

```tsx
{/* Badge indicando que demanda nunca está incluída */}
<Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
  Demanda não incluída no custo
</Badge>
```

**Aparência**: Badge cinza claro com texto "Demanda não incluída no custo"

---

## Exemplo de Resposta da API

### Qualquer Período (Dia/Mês/Custom)

```json
{
  "periodo": {
    "tipo": "mes",
    "data_inicio": "2025-12-01T00:00:00.000Z",
    "data_fim": "2025-12-31T23:59:59.999Z"
  },
  "consumo": {
    "energia_total_kwh": 1234.567,
    "demanda_maxima_kw": 482.5,        // ℹ️ INFORMATIVO
    "demanda_contratada_kw": 500       // ℹ️ INFORMATIVO
  },
  "custos": {
    "custo_ponta": 50.25,
    "custo_fora_ponta": 814.32,
    "custo_reservado": 0,
    "custo_irrigante": 0,
    "custo_demanda": 0,                // ❌ SEMPRE R$ 0,00
    "custo_total": 864.57,             // ✅ Apenas energia
    "custo_medio_kwh": 0.70
  }
}
```

---

## Logs do Backend

Após a mudança, os logs mostrarão:

```
💵 [CUSTOS] Iniciando cálculo de custos
   Equipamento: cmhnk06ka009l2fbkd1o2tyua
   Período: 01/12/2025 00:00:00 até 31/12/2025 23:59:59
   Tipo: mes
   Unidade: M160 - 01 (Grupo A, Irrigante: NÃO)
   Leituras encontradas: 1440
   Energia total: 1234.567 kWh
   Incluir demanda no custo: NÃO        ← ✅ Sempre NÃO
   Custo total: R$ 864.57
```

---

## Interface Visual (Modal de Custos)

```
┌─────────────────────────────────────────────────┐
│ Período: [Mês Atual ▼]  [Atualizar]           │
├─────────────────────────────────────────────────┤
│ A4 - A4_VERDE • Irrigante • M160 - 01 •        │
│ [Demanda não incluída no custo]                 │
├─────────────────────────────────────────────────┤
│ Cards de Custos:                                │
│ ┌──────┐ ┌──────┐ ┌──────┐                    │
│ │PONTA │ │ FP   │ │RESERV│                    │
│ │R$ 50 │ │R$814 │ │R$ 0  │                    │
│ └──────┘ └──────┘ └──────┘                    │
│ ┌──────┐ ┌──────┐ ┌──────┐                    │
│ │DEMANDA│ │      │ │RESUMO│                    │
│ │R$ 0  │←── ZERO│ │R$ 865│                    │
│ │500 kW│ (info) │ │      │                    │
│ └──────┘ └──────┘ └──────┘                    │
│                                                 │
│ Demanda Máxima: 482.5 kW (informativo)         │
│ Demanda Contratada: 500 kW (informativo)       │
└─────────────────────────────────────────────────┘
```

---

## Justificativa

A demanda contratada é uma informação importante para o usuário, mas não faz parte do cálculo de custos de energia consumida. Ela é:

- **Exibida** como informação (kW)
- **Não cobrada** em nenhum período
- **Útil** para comparar demanda máxima vs contratada

O custo total reflete apenas:
- Energia Ponta (kWh × tarifa ponta)
- Energia Fora Ponta (kWh × tarifa FP)
- Energia Reservado (kWh × tarifa FP)
- Energia Irrigante (kWh × tarifa com desconto 80%)

---

## Testando

### Via Frontend:
1. Abra o modal de custos M160
2. Selecione qualquer período (Dia/Mês/Custom)
3. Verifique:
   - Badge: "Demanda não incluída no custo"
   - Card Demanda: R$ 0,00
   - Resumo Total: Sem demanda

### Via API:
```bash
# Período diário
curl "http://localhost:3000/api/v1/equipamentos-dados/ID/custos-energia?periodo=dia&data=2025-12-23"

# Período mensal
curl "http://localhost:3000/api/v1/equipamentos-dados/ID/custos-energia?periodo=mes&data=2025-12"

# Ambos retornarão: "custo_demanda": 0
```

---

## Status

✅ **IMPLEMENTADO**

- Backend: `deveIncluirDemanda()` sempre retorna `false`
- Frontend: Badge atualizado para texto fixo
- Documentação: Atualizada para refletir nova regra

**Data**: 2025-12-23
**Versão**: v2.0 - Demanda removida do cálculo
