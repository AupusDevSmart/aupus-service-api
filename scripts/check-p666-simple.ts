import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkP666() {
  console.log('🔍 VERIFICANDO P666 E TOPICO PRIME\n');

  // Query SQL direta
  const result: any[] = await prisma.$queryRaw`
    SELECT
      e.id,
      e.nome,
      e.tag,
      e.topico_mqtt,
      e.mqtt_habilitado,
      te.codigo AS tipo_codigo,
      te.nome AS tipo_nome,
      u.nome AS unidade_nome,
      (SELECT COUNT(*) FROM equipamentos_dados WHERE equipamento_id = e.id) AS total_dados
    FROM equipamentos e
    LEFT JOIN tipos_equipamentos te ON e.tipo_equipamento_id = te.id
    LEFT JOIN unidades u ON e.unidade_id = u.id
    WHERE
      e.topico_mqtt LIKE '%PRIME%'
      OR e.nome LIKE '%P666%'
      OR e.tag LIKE '%P666%'
    ORDER BY e.nome
  `;

  if (result.length === 0) {
    console.log('❌ Nenhum equipamento encontrado com PRIME no tópico ou P666 no nome/tag');
    return;
  }

  console.log(`📋 ENCONTRADOS ${result.length} EQUIPAMENTO(S):\n`);

  for (const eq of result) {
    const mqttStatus = eq.mqtt_habilitado ? '✅ HABILITADO' : '❌ DESABILITADO';
    const dadosStatus = eq.total_dados > 0 ? `✅ ${eq.total_dados} registros` : '❌ Sem dados';

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📦 ${eq.nome}`);
    console.log(`   ID: ${eq.id}`);
    console.log(`   Tag: ${eq.tag || 'N/A'}`);
    console.log(`   Tipo: ${eq.tipo_codigo || 'N/A'} - ${eq.tipo_nome || 'N/A'}`);
    console.log(`   Unidade: ${eq.unidade_nome || 'N/A'}`);
    console.log(`   📡 Tópico MQTT: ${eq.topico_mqtt || 'N/A'}`);
    console.log(`   ${mqttStatus}`);
    console.log(`   ${dadosStatus}`);
    console.log();
  }

  // Verificar qual tipo de equipamento é esperado
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 VERIFICANDO TIPO DO EQUIPAMENTO:\n');

  const tipoEq = await prisma.$queryRaw`
    SELECT codigo, nome, mqtt_schema
    FROM tipos_equipamentos
    WHERE codigo IN ('METER_M160', 'A966', 'P666', 'METER_CHINT')
    ORDER BY codigo
  `;

  console.log('Tipos disponíveis que podem ser medidores:');
  console.log(tipoEq);
}

checkP666()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
