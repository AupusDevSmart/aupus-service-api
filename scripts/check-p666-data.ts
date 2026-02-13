import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkP666Data() {
  console.log('🔍 VERIFICANDO DADOS DO P666 (TÓPICO ISOFEN)\n');

  // Buscar P666
  const p666: any = await prisma.$queryRaw`
    SELECT
      e.id,
      e.nome,
      e.tag,
      e.topico_mqtt,
      e.mqtt_habilitado
    FROM equipamentos e
    WHERE e.topico_mqtt LIKE '%ISOFEN%'
       OR e.nome LIKE '%P666%'
       OR e.tag LIKE '%P666%'
    LIMIT 1
  `;

  if (p666.length === 0) {
    console.log('❌ P666 não encontrado!\n');
    return;
  }

  const equipamento = p666[0];
  console.log('📋 EQUIPAMENTO:');
  console.log(`   ID: ${equipamento.id}`);
  console.log(`   Nome: ${equipamento.nome}`);
  console.log(`   Tag: ${equipamento.tag || 'N/A'}`);
  console.log(`   Tópico: ${equipamento.topico_mqtt}`);
  console.log(`   MQTT Habilitado: ${equipamento.mqtt_habilitado ? '✅ SIM' : '❌ NÃO'}\n`);

  // Contar total de dados
  const countResult: any = await prisma.$queryRaw`
    SELECT COUNT(*) as total
    FROM equipamentos_dados
    WHERE equipamento_id = ${equipamento.id}
  `;

  const totalDados = parseInt(countResult[0].total);
  console.log(`📊 TOTAL DE DADOS SALVOS: ${totalDados}\n`);

  if (totalDados > 0) {
    // Buscar últimos 10 registros
    const ultimosDados: any = await prisma.$queryRaw`
      SELECT
        id,
        timestamp,
        created_at,
        dados
      FROM equipamentos_dados
      WHERE equipamento_id = ${equipamento.id}
      ORDER BY timestamp DESC
      LIMIT 10
    `;

    console.log('📥 ÚLTIMOS 10 REGISTROS:\n');
    ultimosDados.forEach((dado: any, index: number) => {
      console.log(`${index + 1}. Timestamp: ${dado.timestamp}`);
      console.log(`   Created: ${dado.created_at}`);
      console.log(`   Dados: ${JSON.stringify(dado.dados).substring(0, 100)}...`);
      console.log('');
    });

    // Verificar dados de hoje
    const hojeDados: any = await prisma.$queryRaw`
      SELECT COUNT(*) as total
      FROM equipamentos_dados
      WHERE equipamento_id = ${equipamento.id}
        AND DATE(timestamp) = CURRENT_DATE
    `;

    const totalHoje = parseInt(hojeDados[0].total);
    console.log(`📅 DADOS DE HOJE (${new Date().toLocaleDateString('pt-BR')}): ${totalHoje} registros\n`);
  } else {
    console.log('⚠️ NENHUM DADO SALVO AINDA\n');
    console.log('Possíveis motivos:');
    console.log('  1. ❌ Broker MQTT offline (verificar logs de conexão)');
    console.log('  2. ❌ P666 não está enviando dados');
    console.log('  3. ❌ P666 está enviando em tópico diferente');
    console.log('  4. ❌ Erro no processamento dos dados (verificar logs)\n');
  }

  await prisma.$disconnect();
}

checkP666Data().catch(console.error);
