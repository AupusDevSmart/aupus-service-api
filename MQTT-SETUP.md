# 🔧 Configuração MQTT e Dados em Tempo Real

Este guia ajuda a instalar e configurar o sistema de dados em tempo real via MQTT.

---

## 📦 Passo 1: Instalar Dependências

Execute o comando abaixo para instalar as dependências necessárias:

```bash
npm install mqtt @nestjs/websockets @nestjs/platform-socket.io socket.io
```

### Pacotes instalados:
- **mqtt**: Cliente MQTT para Node.js
- **@nestjs/websockets**: Suporte a WebSockets no NestJS
- **@nestjs/platform-socket.io**: Adaptador Socket.IO para NestJS
- **socket.io**: Biblioteca WebSocket para comunicação real-time

---

## 🗄️ Passo 2: Executar Migrations do Prisma

As tabelas e campos necessários já foram adicionados ao schema do Prisma.

### 2.1 Gerar Prisma Client

**IMPORTANTE**: Execute este comando para atualizar os tipos do Prisma Client:

```bash
npx prisma generate
```

### 2.2 Criar Migration (se ainda não criou)

Se você ainda não criou a migration dos campos MQTT, execute:

```bash
npx prisma migrate dev --name add_mqtt_features
```

Ou aplique a migration existente em `prisma/migrations/20251016_add_mqtt_features/migration.sql`:

```bash
npx prisma migrate deploy
```

---

## ⚙️ Passo 3: Configurar Variáveis de Ambiente

Adicione as seguintes variáveis ao seu arquivo `.env` ou `.env.local`:

```bash
# ===================================
# MQTT Broker Configuration
# ===================================
MQTT_HOST=localhost         # Host/IP do broker MQTT
MQTT_PORT=1883              # Porta do broker MQTT
MQTT_USERNAME=root          # Usuário (opcional se não requer autenticação)
MQTT_PASSWORD=              # Senha (opcional se não requer autenticação)
```

### Exemplos para diferentes brokers:

- **Local (Mosquitto)**:
  ```
  MQTT_HOST=localhost
  MQTT_PORT=1883
  ```

- **Broker Remoto**:
  ```
  MQTT_HOST=72.60.158.163
  MQTT_PORT=1883
  MQTT_USERNAME=root
  MQTT_PASSWORD=sua_senha
  ```

- **HiveMQ Cloud** (TLS não suportado nesta versão):
  ```
  MQTT_HOST=your-cluster.hivemq.cloud
  MQTT_PORT=1883
  ```

---

## 🐝 Passo 4: Instalar MQTT Broker (se não tiver)

### Opção 1: Mosquitto (Local)

#### Windows:
```bash
# Download: https://mosquitto.org/download/
# Ou use Chocolatey:
choco install mosquitto

# Iniciar serviço:
net start mosquitto
```

#### Linux:
```bash
sudo apt-get install mosquitto mosquitto-clients
sudo systemctl start mosquitto
sudo systemctl enable mosquitto
```

#### macOS:
```bash
brew install mosquitto
brew services start mosquitto
```

### Opção 2: Docker

```bash
docker run -d --name mosquitto -p 1883:1883 -p 9001:9001 eclipse-mosquitto
```

### Opção 3: Cloud (HiveMQ, AWS IoT, Azure IoT)

Use um broker MQTT na nuvem. Consulte a documentação do provedor.

---

## 🚀 Passo 5: Iniciar a Aplicação

Depois de instalar as dependências e configurar o ambiente:

```bash
npm run start:dev
```

Você deve ver no console:

```
✅ MQTT conectado
📡 Carregando X tópicos MQTT...
```

---

## 🧪 Passo 6: Testar as Rotas

### 6.1 Configurar MQTT em um Equipamento

Use o arquivo de teste `src/modules/equipamentos/equipamentos-mqtt.http`:

```http
PATCH http://localhost:3000/api/v1/equipamentos/{equipamentoId}/mqtt
Content-Type: application/json

{
  "topico_mqtt": "usina/ufv-principal/inversor-01",
  "mqtt_habilitado": true
}
```

### 6.2 Publicar Dados via MQTT

Use o comando `mosquitto_pub` ou um cliente MQTT GUI (MQTT.fx, MQTT Explorer):

```bash
mosquitto_pub -h localhost -p 1883 \
  -t "usina/ufv-principal/inversor-01" \
  -m '{"potenciaAtual":850.5,"tensao":380,"corrente":12.5,"temperatura":45.2,"eficiencia":98.5,"status":"NORMAL","timestamp":"2025-10-16T10:45:30Z","qualidade":"GOOD"}'
```

### 6.3 Verificar se Dados foram Salvos

```http
GET http://localhost:3000/api/v1/equipamentos/{equipamentoId}/dados/atual
```

Resposta esperada:
```json
{
  "id": "dados_abc123",
  "equipamentoId": "equip_001",
  "dados": {
    "potenciaAtual": 850.5,
    "tensao": 380,
    "corrente": 12.5,
    "temperatura": 45.2,
    "eficiencia": 98.5,
    "status": "NORMAL"
  },
  "fonte": "MQTT",
  "timestamp": "2025-10-16T10:45:30Z",
  "qualidade": "GOOD"
}
```

---

## 📊 Passo 7: Testar Histórico

```http
GET http://localhost:3000/api/v1/equipamentos/{equipamentoId}/dados/historico?limite=10
```

---

## ⚠️ Troubleshooting

### Erro: MQTT não conecta

1. Verifique se o broker MQTT está rodando:
   ```bash
   # Mosquitto local
   netstat -an | findstr 1883  # Windows
   netstat -an | grep 1883     # Linux/Mac
   ```

2. Teste conexão manual:
   ```bash
   mosquitto_sub -h localhost -p 1883 -t "test/topic" -v
   ```

3. Verifique as variáveis de ambiente no `.env`

### Erro: Tipos do Prisma não encontrados

Execute:
```bash
npx prisma generate
```

### Erro: `mqtt` module not found

Instale novamente:
```bash
npm install mqtt
```

---

## 📚 Próximos Passos

1. ✅ **Implementar WebSocket Gateway** (ainda não implementado)
   - Para enviar dados em tempo real para o frontend

2. ✅ **Validação de Dados com JSON Schema**
   - Validar payload MQTT contra `propriedades_schema` do tipo de equipamento

3. ✅ **Agrupamento de Dados Históricos**
   - Implementar intervalos: `1min`, `5min`, `1hour`, `1day`

4. ✅ **Dashboard de Monitoramento MQTT**
   - Visualizar status de conexões, tópicos ativos, etc.

---

## 📞 Suporte

Se encontrar problemas, verifique:
1. Logs do console onde o NestJS está rodando
2. Logs do broker MQTT (se local)
3. Configuração das variáveis de ambiente

---

✅ **Sistema MQTT configurado e pronto para uso!**
