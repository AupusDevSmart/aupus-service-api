# Problema: Conexão MQTT Bloqueada

## 🔍 Diagnóstico

O broker MQTT está em **72.60.158.163:1883**, mas a conexão está sendo bloqueada:

- ✅ Servidor responde ping (27ms de latência)
- ❌ Porta 1883 (MQTT) está bloqueada
- ❌ Timeout na conexão TCP

## 🚫 Possíveis Causas

1. **Firewall da Rede/Corporativo**
   - A porta 1883 pode estar bloqueada pela rede
   - Algumas redes bloqueiam portas não-padrão

2. **VPN Necessária**
   - O broker pode estar atrás de uma VPN
   - Verificar se precisa estar conectado em alguma VPN específica

3. **Firewall do Windows**
   - Windows Defender pode estar bloqueando conexões de saída na porta 1883

4. **Restrição de IP**
   - O broker pode aceitar apenas IPs específicos

## ✅ Soluções

### Solução 1: Modo Disabled (Atual - Recomendado para Dev)

MQTT está **desabilitado** no ambiente local. Você ainda tem:
- ✅ 384 mil registros MQTT já no banco local
- ✅ API funcionando normalmente
- ✅ Banco de dados completo

Para desenvolvimento local, isso é suficiente.

**Configuração atual (.env):**
```env
MQTT_MODE=disabled
```

### Solução 2: Habilitar Porta no Firewall

Se precisar do MQTT funcionando, abra o PowerShell como **Administrador** e execute:

```powershell
# Criar regra de saída para porta 1883
New-NetFirewallRule -DisplayName "MQTT Client - Outbound" -Direction Outbound -Protocol TCP -RemotePort 1883 -Action Allow

# Verificar se foi criada
Get-NetFirewallRule -DisplayName "MQTT Client - Outbound"
```

### Solução 3: Conectar VPN

Verifique se precisa estar conectado em alguma VPN para acessar o broker MQTT.

### Solução 4: Usar Proxy/Tunnel

Se estiver em rede corporativa, pode precisar configurar um proxy ou tunnel SSH.

### Solução 5: Usar MQTT via WebSocket

Alguns brokers oferecem MQTT via WebSocket (porta 80/443):

```env
MQTT_HOST=72.60.158.163
MQTT_PORT=8083  # Porta WebSocket (se disponível)
MQTT_USE_WEBSOCKET=true
```

## 🔧 Teste de Conectividade

### PowerShell:
```powershell
Test-NetConnection -ComputerName 72.60.158.163 -Port 1883
```

### Via Docker (teste rápido):
```bash
docker run --rm eclipse-mosquitto mosquitto_sub -h 72.60.158.163 -p 1883 -t "test/#" -u root -P your_password
```

## 📊 Status Atual

**Modo Atual:** `MQTT_MODE=disabled`

**Vantagens:**
- ✅ Backend inicia sem erros
- ✅ Não tenta reconectar constantemente
- ✅ Logs limpos
- ✅ Dados históricos disponíveis no banco

**Desvantagens:**
- ❌ Não recebe dados em tempo real
- ❌ WebSocket de dados MQTT não funciona

## 🔄 Como Reativar MQTT

Quando resolver o bloqueio da rede, edite o `.env`:

```env
# Modo development: conecta mas não salva (útil para testar)
MQTT_MODE=development

# OU modo production: conecta e salva dados
MQTT_MODE=production
```

Depois reinicie o backend:
```bash
# Parar o backend atual
# Ctrl+C ou matar o processo

# Iniciar novamente
npm run start:dev
```

## 📝 Notas

- O backup do banco foi feito com **384.129 registros MQTT**
- Dados históricos completos até 11/03/2026 17:13
- Para desenvolvimento local, modo `disabled` é recomendado
- Quando precisar de dados em tempo real, resolva o bloqueio da porta 1883
