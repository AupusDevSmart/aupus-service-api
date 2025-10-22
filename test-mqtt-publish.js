// Script para testar publicação MQTT
const mqtt = require('mqtt');

const client = mqtt.connect('mqtt://72.60.158.163:1883', {
  username: 'root',
  password: '',
  clientId: `test-${Math.random().toString(16).substr(2, 8)}`
});

client.on('connect', () => {
  console.log('✅ Conectado ao MQTT broker');

  const payload = {
    potenciaAtual: 850.5,
    tensao: 380,
    corrente: 12.5,
    temperatura: 45.2,
    eficiencia: 98.5,
    status: 'NORMAL',
    timestamp: new Date().toISOString(),
    qualidade: 'GOOD'
  };

  console.log('📡 Publicando dados no tópico: usina/ufv-solar/inversor-01');
  console.log('📦 Payload:', JSON.stringify(payload, null, 2));

  client.publish('usina/ufv-solar/inversor-01', JSON.stringify(payload), (err) => {
    if (err) {
      console.error('❌ Erro ao publicar:', err);
    } else {
      console.log('✅ Dados publicados com sucesso!');
    }

    setTimeout(() => {
      client.end();
      console.log('🔌 Desconectado');
      process.exit(0);
    }, 1000);
  });
});

client.on('error', (error) => {
  console.error('❌ Erro MQTT:', error);
  process.exit(1);
});
