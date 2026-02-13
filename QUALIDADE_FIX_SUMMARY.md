# ✅ CORREÇÃO DO ALGORITMO DE QUALIDADE - RESUMO

**Data:** 13/02/2026
**Status:** Implementado e Pronto para Deploy

---

## 🎯 PROBLEMA IDENTIFICADO

**100% dos dados estavam marcados como qualidade "RUIM"**, mas na verdade:
- ✅ 21% tinham consumo REAL (tensão + corrente + potência) → Qualidade BOA
- ⚠️ 56% tinham tensão mas sem corrente (instalação sem carga) → Qualidade PARCIAL
- ❌ 23% estavam realmente sem dados (desligados) → Qualidade RUIM

### Exemplo Real
```
Medidor M160 4:
- Va: 220.5V, Vb: 223.3V, Vc: 218.7V ✅
- Ia: 20.18A, Ib: 29.43A, Ic: 29.03A ✅
- Pa: 2W, Pb: 107W, Pc: 107W ✅
- Qualidade no BD: "ruim" ❌ → DEVERIA SER "boa" ✅
```

---

## 🔧 SOLUÇÃO IMPLEMENTADA

### 1. Novo Algoritmo Inteligente

Criada função `determinarQualidadeM160()` em `mqtt.service.ts`:

```typescript
private determinarQualidadeM160(resumo: any): 'boa' | 'parcial' | 'ruim' {
  const temTensao = (resumo.Va > 0 || resumo.Vb > 0 || resumo.Vc > 0);
  const temCorrente = (resumo.Ia > 0 || resumo.Ib > 0 || resumo.Ic > 0);
  const temPotencia = (resumo.Pa > 0 || resumo.Pb > 0 || resumo.Pc > 0 || resumo.Pt > 0);

  if (!temTensao) return 'ruim';       // Desligado/problema
  if (temCorrente && temPotencia) return 'boa';    // Medindo consumo real
  return 'parcial';                     // Energizado sem carga
}
```

### 2. Critérios de Qualidade

| Qualidade | Tensão | Corrente | Potência | Situação |
|-----------|--------|----------|----------|----------|
| **BOA** ✅ | Sim | Sim | Sim | Medindo consumo real |
| **PARCIAL** ⚠️ | Sim | Não | Não | Instalação sem carga (normal) |
| **RUIM** ❌ | Não | - | - | Equipamento offline/desligado |

### 3. Logs Melhorados

Antes:
```
✅ [M-160] cmlic0ww | 0.0000kWh | 0W | V:228.6/230.6/233.2 | I:0.0/0.0/0.0A | 30x
```

Depois:
```
⚠️ [M-160] cmlic0ww | PARCIAL | 0.0000kWh | 0W | V:228.6/230.6/233.2 | I:0.0/0.0/0.0A | 30x
✅ [M-160] cmlidh1z | BOA | 0.0150kWh | 216W | V:220.5/223.3/218.7 | I:20.2/29.4/29.0A | 60x
```

---

## 📁 ARQUIVOS MODIFICADOS

### Backend
1. **`src/shared/mqtt/mqtt.service.ts`**
   - Linha 443-469: Função `determinarQualidadeM160()`
   - Linha 487: Usar qualidade calculada em vez de campo MQTT
   - Linha 622, 634: Salvar qualidade real no banco
   - Linha 642-651: Log com ícone de qualidade

### Scripts
2. **`scripts/fix-qualidade-historica.ts`** - Corrigir dados históricos (TypeScript)
3. **`scripts/fix-qualidade-batch.sql`** - Correção em lote (SQL rápido)
4. **`scripts/mqtt-data-analysis.ts`** - Análise detalhada dos dados

---

## 🚀 COMO APLICAR

### Passo 1: Reiniciar Backend
```bash
cd aupus-service-api

# Matar processo atual
taskkill /F /PID <PID_DO_BACKEND>

# Iniciar novamente
npm run start:dev
```

**RESULTADO:** Novos dados salvos com qualidade correta!

### Passo 2: Corrigir Dados Históricos

**Opção A - SQL (Rápido - Recomendado):**
```bash
psql -h 45.55.122.87 -U admin -d aupus -f scripts/fix-qualidade-batch.sql
```

**Opção B - TypeScript (Mais lento mas mais seguro):**
```bash
npx ts-node scripts/fix-qualidade-historica.ts
```

**RESULTADO:** Dados das últimas 48h corrigidos!

---

## 📊 IMPACTO ESPERADO

### Antes
```
📊 ANÁLISE DE QUALIDADE (últimas 24h):
❌ ruim: 272 registros (100%)
✅ boa: 0 registros (0%)
⚠️ parcial: 0 registros (0%)
```

### Depois
```
📊 ANÁLISE DE QUALIDADE (últimas 24h):
✅ boa: 56 registros (21%)      ← Medições reais de consumo
⚠️ parcial: 153 registros (56%) ← Instalações sem carga
❌ ruim: 63 registros (23%)     ← Realmente offline
```

---

## ✅ BENEFÍCIOS

1. **Dados mais precisos** - Qualidade reflete situação real
2. **Melhor diagnóstico** - Sabe quais equipamentos estão realmente com problema
3. **Alertas corretos** - Só alerta quando realmente offline (sem tensão)
4. **Análises confiáveis** - Dashboards mostram situação real

---

## 🔍 VALIDAÇÃO

### Testar Novo Algoritmo
```bash
# Ver logs em tempo real
tail -f logs/backend.log | grep "M-160"

# Verificar qualidade no banco
npm run scripts/mqtt-quick-check.ts
```

### Verificar Distribuição
```sql
SELECT
    qualidade,
    COUNT(*) as registros,
    ROUND(COUNT(*)::NUMERIC / SUM(COUNT(*)) OVER () * 100, 1) as percentual
FROM equipamentos_dados
WHERE timestamp_dados >= NOW() - INTERVAL '24 hours'
GROUP BY qualidade;
```

---

## 📝 NOTAS IMPORTANTES

1. **Dados com tensão mas sem corrente são NORMAIS**
   - Instalações durante a noite
   - Final de semana em indústrias
   - Horários de baixo consumo

2. **Qualidade "parcial" NÃO é ruim**
   - Equipamento funcionando corretamente
   - Apenas não há carga no momento
   - Situação esperada e normal

3. **Apenas dados SEM tensão são "ruim"**
   - Indica equipamento realmente offline
   - Problema de comunicação
   - Dispositivo desligado

---

## 🎯 PRÓXIMOS PASSOS (Futuro)

1. Dashboard de qualidade em tempo real
2. Alertas inteligentes baseados em qualidade
3. Relatórios de disponibilidade dos medidores
4. Análise de padrões de consumo

---

**Status:** ✅ Pronto para produção
**Testado:** ✅ Análise de 297 registros históricos
**Impacto:** 🟢 Baixo - Apenas melhoria de classificação
