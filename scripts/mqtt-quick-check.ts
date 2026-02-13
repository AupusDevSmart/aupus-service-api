import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function quickCheck() {
  console.log('\n🔍 QUICK MQTT CHECK\n');
  console.log('='.repeat(80));

  // EQUIPAMENTOS QUE ESTÃO ENVIANDO DADOS
  console.log('\n✅ EQUIPAMENTOS FUNCIONANDO (últimas 24h):\n');

  const funcionando = await prisma.$queryRaw<any[]>`
    SELECT
      e.nome,
      e.topico_mqtt,
      te.codigo as tipo,
      COUNT(*) as registros_24h,
      MAX(ed.timestamp_dados) as ultima_recepcao,
      ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(ed.timestamp_dados)))/3600, 1) as horas_desde_ultimo,
      ed.qualidade
    FROM equipamentos e
    JOIN equipamentos_dados ed ON e.id = ed.equipamento_id
    LEFT JOIN tipos_equipamentos te ON e.tipo_equipamento_id = te.id
    WHERE ed.timestamp_dados >= NOW() - INTERVAL '24 hours'
    GROUP BY e.id, e.nome, e.topico_mqtt, te.codigo, ed.qualidade
    ORDER BY registros_24h DESC
  `;

  funcionando.forEach((eq, i) => {
    console.log(`${i + 1}. ${eq.nome} (${eq.tipo || 'N/A'})`);
    console.log(`   📡 Tópico: ${eq.topico_mqtt}`);
    console.log(`   📊 Registros: ${eq.registros_24h}`);
    console.log(`   🕐 Última recepção: ${new Date(eq.ultima_recepcao).toLocaleString('pt-BR')} (há ${eq.horas_desde_ultimo}h)`);
    console.log(`   ⚠️ Qualidade: ${eq.qualidade}\n`);
  });

  // EQUIPAMENTOS SEM DADOS
  console.log('\n❌ EQUIPAMENTOS SEM DADOS (últimas 24h):\n');

  const semDados = await prisma.$queryRaw<any[]>`
    SELECT
      e.nome,
      e.topico_mqtt,
      te.codigo as tipo,
      u.nome as unidade,
      MAX(ed.timestamp_dados) as ultima_recepcao_conhecida
    FROM equipamentos e
    LEFT JOIN tipos_equipamentos te ON e.tipo_equipamento_id = te.id
    LEFT JOIN unidades u ON e.unidade_id = u.id
    LEFT JOIN equipamentos_dados ed ON e.id = ed.equipamento_id
    WHERE e.mqtt_habilitado = true
      AND e.topico_mqtt IS NOT NULL
      AND e.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM equipamentos_dados ed2
        WHERE ed2.equipamento_id = e.id
        AND ed2.timestamp_dados >= NOW() - INTERVAL '24 hours'
      )
    GROUP BY e.id, e.nome, e.topico_mqtt, te.codigo, u.nome
    ORDER BY ultima_recepcao_conhecida DESC NULLS LAST
  `;

  semDados.forEach((eq, i) => {
    console.log(`${i + 1}. ${eq.nome} (${eq.tipo || 'N/A'}) - ${eq.unidade}`);
    console.log(`   📡 Tópico: ${eq.topico_mqtt}`);
    if (eq.ultima_recepcao_conhecida) {
      const diasAtras = Math.floor((Date.now() - new Date(eq.ultima_recepcao_conhecida).getTime()) / (1000 * 60 * 60 * 24));
      console.log(`   🕐 Último dado conhecido: ${new Date(eq.ultima_recepcao_conhecida).toLocaleString('pt-BR')} (há ${diasAtras} dias)`);
    } else {
      console.log(`   🕐 Nunca recebeu dados!`);
    }
    console.log();
  });

  // ANÁLISE DE QUALIDADE
  console.log('\n📊 ANÁLISE DE QUALIDADE (últimas 24h):\n');

  const qualidadeAnalise = await prisma.$queryRaw<any[]>`
    SELECT
      COALESCE(qualidade, 'null') as qualidade,
      COUNT(*) as registros,
      ROUND(COUNT(*)::NUMERIC / (SELECT COUNT(*) FROM equipamentos_dados WHERE timestamp_dados >= NOW() - INTERVAL '24 hours') * 100, 1) as percentual
    FROM equipamentos_dados
    WHERE timestamp_dados >= NOW() - INTERVAL '24 hours'
    GROUP BY qualidade
    ORDER BY registros DESC
  `;

  qualidadeAnalise.forEach(q => {
    const icon = q.qualidade === 'boa' ? '✅' : q.qualidade === 'ruim' ? '❌' : '⚠️';
    console.log(`${icon} ${q.qualidade}: ${q.registros} registros (${q.percentual}%)`);
  });

  // SAMPLE DOS ÚLTIMOS DADOS
  console.log('\n\n🔍 SAMPLE DOS ÚLTIMOS 5 REGISTROS:\n');

  const sample = await prisma.$queryRaw<any[]>`
    SELECT
      e.nome,
      ed.timestamp_dados,
      ed.created_at,
      ed.qualidade,
      ed.fonte,
      ed.dados::text
    FROM equipamentos_dados ed
    JOIN equipamentos e ON ed.equipamento_id = e.id
    ORDER BY ed.created_at DESC
    LIMIT 5
  `;

  sample.forEach((s, i) => {
    console.log(`${i + 1}. ${s.nome}`);
    console.log(`   Timestamp: ${new Date(s.timestamp_dados).toLocaleString('pt-BR')}`);
    console.log(`   Criado: ${new Date(s.created_at).toLocaleString('pt-BR')}`);
    console.log(`   Qualidade: ${s.qualidade}`);
    console.log(`   Fonte: ${s.fonte}`);
    console.log(`   Dados (preview): ${s.dados.substring(0, 150)}...\n`);
  });

  console.log('='.repeat(80));
  console.log('\n✅ Check completo!\n');

  await prisma.$disconnect();
}

quickCheck().catch(console.error);
