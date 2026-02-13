# 🔍 RELATÓRIO DE DIAGNÓSTICO MQTT

**Data:** 13/02/2026
**Última Análise:** 11:55 BRT

---

## 📊 RESUMO EXECUTIVO

### Status Atual
- ✅ **Sistema MQTT OPERACIONAL**
- ⚠️ **Apenas 3 de 18 equipamentos enviando dados**
- 🔴 **100% dos dados com qualidade "RUIM"**
- 🕐 **Último registro:** há 2h30 atrás (09:16:56)

### Números
- **Total configurados:** 18 equipamentos MQTT
- **Ativos (24h):** 3 equipamentos
- **Inativos:** 15 equipamentos
- **Registros (24h):** 272
- **Gaps detectados:** 20 períodos >15min sem dados

---

## ✅ EQUIPAMENTOS FUNCIONANDO (3)

### 1. Medidor M160 6
- **Tópico:** `OLI/GO/NSA/BOMBAS/M160/1`
- **Registros 24h:** 109
- **Última recepção:** 13/02/2026 09:16:56 (há 2.7h)
- **Qualidade:** ruim
- **Observação:** Todos os valores são ZERO (Ia=0, Ib=0, Pa=0...)

### 2. Medidor M160 5
- **Tópico:** `OLI/GO/NSA/BOMBAS/M160/2`
- **Registros 24h:** 99
- **Última recepção:** 13/02/2026 08:08:04 (há 3.8h)
- **Qualidade:** ruim

### 3. Medidor M160 4
- **Tópico:** `OLI/GO/NSA/BOMBAS/M160/3`
- **Registros 24h:** 64
- **Última recepção:** 13/02/2026 06:19:10 (há 5.6h)
- **Qualidade:** ruim

---

## ❌ EQUIPAMENTOS SEM DADOS (15)

### Offline Recente (15 dias)
1. **Inversor 3** - `STA_BRANCA/GO/SOLAR_POWER/UFV05/INVERSOR/3` (há 15 dias)
2. **Inversor 1** - `STA_BRANCA/GO/SOLAR_POWER/UFV05/INVERSOR/1` (há 15 dias)
3. **Inversor 2** - `STA_BRANCA/GO/SOLAR_POWER/UFV05/INVERSOR/2` (há 15 dias)

### Offline Prolongado (20+ dias)
4. **Inversor Solar 2** - `OLI/GO/NSA/UFV/INVERSOR/2` (há 20 dias)
5. **M-160 1** - `NSA/bombas/1` (há 37 dias)
6. **Multimedidor M160 3** - `NSA/1/minuto` (há 51 dias)

### Equipamentos de Teste (77 dias offline)
7-10. Inversores 1, 2, 3 - Teste e M160 Admin (há 77 dias)

### Nunca Receberam Dados
11. **Medidor M160 3** - `ex01`
12. **Inversor Solar 1** - `OLI/GO/NSA/UFV/INVERSOR/1`
13. **Inversor Solar 1** (Pivo 6) - `ex02`
14. **Power Meter (A966)** - (sem tópico)
15. **P666** - `PRIME/GO/SUP_PRIME/ELETROPOSTO/CHINT/1` ⚠️

---

## 🔴 PROBLEMAS CRÍTICOS IDENTIFICADOS

### 1. Qualidade dos Dados (CRÍTICO)
- **100% dos registros com qualidade "RUIM"**
- **Valores sempre ZERO** nas leituras M160
- Sample dos últimos 5 registros:
  ```json
  {
    "Ia": 0, "Ib": 0, "Ic": 0,
    "Pa": 0, "Pb": 0, "Pc": 0, "Pt": 0,
    "Va": 0, "Vb": 0, "Vc": 0
  }
  ```

**Possíveis Causas:**
- Dispositivos físicos offline/desligados
- Cabos de medição desconectados
- Configuração incorreta no dispositivo M160
- Dispositivos em modo de erro/falha

### 2. P666 Nunca Recebeu Dados
- Configurado como METER_M160
- Tópico: `PRIME/GO/SUP_PRIME/ELETROPOSTO/CHINT/1`
- MQTT habilitado: ✅
- **Status:** Nunca enviou nenhum dado

**Ações Necessárias:**
- Verificar se dispositivo físico existe e está ligado
- Confirmar se tópico MQTT está correto
- Verificar se dispositivo está conectado ao broker

### 3. Gaps de Dados
- 20 períodos com >15min sem dados
- Dados chegam de forma irregular
- Último registro há 2h30 atrás

---

## 🛠️ FERRAMENTAS CRIADAS

### 1. Scripts de Diagnóstico

#### `scripts/mqtt-diagnostico.sql`
Queries SQL completas para análise manual no banco.

#### `scripts/mqtt-diagnostico.ts`
Script TypeScript completo que gera relatório JSON:
```bash
cd aupus-service-api
npx ts-node scripts/mqtt-diagnostico.ts
```

#### `scripts/mqtt-quick-check.ts`
Check rápido para ver status atual:
```bash
cd aupus-service-api
npx ts-node scripts/mqtt-quick-check.ts
```

### 2. API de Diagnóstico

Endpoints criados em `/mqtt/diagnostico`:

#### `GET /mqtt/diagnostico`
Diagnóstico completo do sistema
```json
{
  "timestamp": "2026-02-13T11:55:04.000Z",
  "summary": {
    "totalEquipamentosConfigurados": 18,
    "equipamentosAtivos24h": 3,
    "equipamentosInativos": 15,
    "totalRegistros24h": 272,
    "qualidadeBoa": 0,
    "qualidadeRuim": 100
  },
  "equipamentos": {...},
  "stats": {...},
  "qualidade": {...}
}
```

#### `GET /mqtt/diagnostico/status`
Status resumido (para health check):
```json
{
  "status": "warning",
  "mensagem": "Sem dados há 2h 30min",
  "equipamentosAtivos": 3,
  "ultimoRegistro": "2026-02-13T09:16:56.000Z"
}
```

#### `GET /mqtt/diagnostico/equipamentos`
Lista detalhada de equipamentos

#### `GET /mqtt/diagnostico/topicos`
Status de cada tópico MQTT

#### `GET /mqtt/diagnostico/qualidade`
Análise de qualidade dos dados

### 3. Sistema de Logging

Logs automáticos quando dados chegam (já existente):

**M-160:**
```
✅ [M-160] cmhcfvf5 | 0.0234kWh | 1234W | V:220.1/219.8/221.3 | I:5.6/5.4/5.8A | FP:0.98/0.97/0.99 | 30x
```

**Inversores:**
```
✅ [INVERSOR] OLI/GO/NSA/UFV/INVERSOR/1 | 0.0150kWh | 5600W | 60x leituras
```

### 4. Controle de Logs Verbose

Variável de ambiente `.env`:
```bash
# MQTT_LOG_LEVEL: minimal | normal | verbose
MQTT_LOG_LEVEL=minimal  # Silencia logs de conexão
```

---

## 📋 PRÓXIMOS PASSOS RECOMENDADOS

### Curto Prazo (Urgente)
1. **Investigar por que dados M160 são ZERO**
   - Verificar cabeamento físico
   - Verificar configuração dos medidores
   - Testar medidores manualmente

2. **Ativar P666**
   - Confirmar dispositivo físico existe
   - Verificar configuração de tópico MQTT
   - Testar comunicação com broker

3. **Reativar Inversores Solar Power**
   - 3 inversores offline há 15 dias
   - Verificar se instalação está operacional

### Médio Prazo
1. Criar dashboard frontend de monitoramento
2. Implementar alertas automáticos
3. Revisar configurações de tópicos duplicados (ex01, ex02)

### Longo Prazo
1. Implementar health checks automáticos
2. Sistema de notificação de falhas
3. Documentação de procedimentos de troubleshooting

---

## 📞 SUPORTE

Para mais informações:
- Executar scripts de diagnóstico
- Consultar endpoints `/mqtt/diagnostico/*`
- Ver logs do backend (filtrar por `[MQTT]` ou `[M-160]`)

---

**Relatório gerado automaticamente**
**Sistema:** Aupus MQTT Diagnostics v1.0
