import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface QueryResult {
  title: string;
  data: any[];
  summary?: string;
}

async function executeDiagnostic() {
  console.log('🔍 ===== DIAGNÓSTICO MQTT =====\n');
  console.log(`📅 Data/Hora: ${new Date().toLocaleString('pt-BR')}\n`);

  const results: QueryResult[] = [];

  try {
    // 1️⃣ ÚLTIMA RECEPÇÃO POR EQUIPAMENTO
    console.log('1️⃣ Analisando última recepção por equipamento...');
    const ultimaRecepcao = await prisma.$queryRaw<any[]>`
      SELECT
        e.id,
        e.nome,
        e.tag,
        e.topico_mqtt,
        e.mqtt_habilitado,
        te.codigo as tipo_equipamento,
        MAX(ed.timestamp_dados) as ultima_recepcao,
        MAX(ed.created_at) as ultimo_registro_criado,
        COUNT(ed.id) as total_registros_48h,
        EXTRACT(EPOCH FROM (NOW() - MAX(ed.timestamp_dados)))/3600 as horas_desde_ultimo
      FROM equipamentos e
      LEFT JOIN tipos_equipamentos te ON e.tipo_equipamento_id = te.id
      LEFT JOIN equipamentos_dados ed ON e.id = ed.equipamento_id
        AND ed.timestamp_dados >= NOW() - INTERVAL '48 hours'
      WHERE e.mqtt_habilitado = true
        AND e.topico_mqtt IS NOT NULL
        AND e.deleted_at IS NULL
      GROUP BY e.id, e.nome, e.tag, e.topico_mqtt, e.mqtt_habilitado, te.codigo
      ORDER BY ultima_recepcao DESC NULLS LAST
    `;

    const comDados = ultimaRecepcao.filter(r => r.ultima_recepcao !== null);
    const semDados = ultimaRecepcao.filter(r => r.ultima_recepcao === null);

    results.push({
      title: '1️⃣ ÚLTIMA RECEPÇÃO POR EQUIPAMENTO (últimas 48h)',
      data: ultimaRecepcao,
      summary: `✅ ${comDados.length} equipamentos com dados | ❌ ${semDados.length} sem dados`
    });

    console.log(`   ✅ ${comDados.length} equipamentos com dados nas últimas 48h`);
    console.log(`   ❌ ${semDados.length} equipamentos SEM dados nas últimas 48h\n`);

    // 2️⃣ ESTATÍSTICAS GERAIS
    console.log('2️⃣ Calculando estatísticas gerais...');
    const stats = await prisma.$queryRaw<any[]>`
      SELECT
        COUNT(DISTINCT equipamento_id) as equipamentos_com_dados_24h,
        COUNT(*) as total_registros_24h,
        MIN(timestamp_dados) as primeiro_registro,
        MAX(timestamp_dados) as ultimo_registro,
        ROUND(AVG(num_leituras), 2) as media_leituras_por_registro,
        COUNT(DISTINCT fonte) as fontes_distintas
      FROM equipamentos_dados
      WHERE timestamp_dados >= NOW() - INTERVAL '24 hours'
    `;

    results.push({
      title: '2️⃣ ESTATÍSTICAS GERAIS (últimas 24h)',
      data: stats,
      summary: `📊 ${stats[0]?.total_registros_24h || 0} registros de ${stats[0]?.equipamentos_com_dados_24h || 0} equipamentos`
    });

    console.log(`   📊 Total de registros: ${stats[0]?.total_registros_24h || 0}`);
    console.log(`   🔌 Equipamentos ativos: ${stats[0]?.equipamentos_com_dados_24h || 0}`);
    console.log(`   📡 Último registro: ${stats[0]?.ultimo_registro ? new Date(stats[0].ultimo_registro).toLocaleString('pt-BR') : 'Nenhum'}\n`);

    // 3️⃣ EQUIPAMENTOS SEM DADOS
    console.log('3️⃣ Identificando equipamentos sem dados...');
    const semDados24h = await prisma.$queryRaw<any[]>`
      SELECT
        e.id,
        e.nome,
        e.tag,
        e.topico_mqtt,
        te.codigo as tipo_equipamento,
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
      GROUP BY e.id, e.nome, e.tag, e.topico_mqtt, te.codigo, u.nome
      ORDER BY ultima_recepcao_conhecida DESC NULLS LAST
    `;

    results.push({
      title: '3️⃣ EQUIPAMENTOS SEM DADOS (últimas 24h)',
      data: semDados24h,
      summary: `⚠️ ${semDados24h.length} equipamentos configurados mas sem dados`
    });

    console.log(`   ⚠️ ${semDados24h.length} equipamentos configurados mas sem dados\n`);

    // 4️⃣ DISTRIBUIÇÃO POR HORA
    console.log('4️⃣ Analisando distribuição temporal...');
    const distribuicao = await prisma.$queryRaw<any[]>`
      SELECT
        DATE_TRUNC('hour', timestamp_dados) as hora,
        COUNT(*) as registros,
        COUNT(DISTINCT equipamento_id) as equipamentos_distintos
      FROM equipamentos_dados
      WHERE timestamp_dados >= NOW() - INTERVAL '24 hours'
      GROUP BY DATE_TRUNC('hour', timestamp_dados)
      ORDER BY hora DESC
    `;

    results.push({
      title: '4️⃣ DISTRIBUIÇÃO POR HORA (últimas 24h)',
      data: distribuicao,
      summary: `📈 ${distribuicao.length} horas com dados`
    });

    console.log(`   📈 Dados distribuídos em ${distribuicao.length} horas\n`);

    // 5️⃣ QUALIDADE DOS DADOS
    console.log('5️⃣ Analisando qualidade...');
    const qualidade = await prisma.$queryRaw<any[]>`
      SELECT
        qualidade,
        COUNT(*) as registros,
        COUNT(DISTINCT equipamento_id) as equipamentos,
        ROUND(COUNT(*)::NUMERIC / SUM(COUNT(*)) OVER () * 100, 2) as percentual
      FROM equipamentos_dados
      WHERE timestamp_dados >= NOW() - INTERVAL '24 hours'
      GROUP BY qualidade
      ORDER BY registros DESC
    `;

    results.push({
      title: '5️⃣ ANÁLISE DE QUALIDADE (últimas 24h)',
      data: qualidade,
      summary: `✅ ${qualidade.find(q => q.qualidade === 'boa')?.percentual || 0}% boa qualidade`
    });

    qualidade.forEach(q => {
      const icon = q.qualidade === 'boa' ? '✅' : q.qualidade === 'ruim' ? '❌' : '⚠️';
      console.log(`   ${icon} ${q.qualidade || 'null'}: ${q.registros} registros (${q.percentual}%)`);
    });
    console.log();

    // 6️⃣ TÓPICOS CONFIGURADOS
    console.log('6️⃣ Listando tópicos MQTT...');
    const topicos = await prisma.$queryRaw<any[]>`
      SELECT
        topico_mqtt,
        COUNT(*) as quantidade_equipamentos,
        ARRAY_AGG(nome) as equipamentos
      FROM equipamentos
      WHERE mqtt_habilitado = true
        AND topico_mqtt IS NOT NULL
        AND deleted_at IS NULL
      GROUP BY topico_mqtt
      ORDER BY quantidade_equipamentos DESC
    `;

    results.push({
      title: '6️⃣ TÓPICOS MQTT CONFIGURADOS',
      data: topicos,
      summary: `📡 ${topicos.length} tópicos distintos`
    });

    console.log(`   📡 ${topicos.length} tópicos MQTT distintos configurados\n`);

    // 7️⃣ ÚLTIMOS REGISTROS
    console.log('7️⃣ Buscando últimos registros...');
    const ultimos = await prisma.$queryRaw<any[]>`
      SELECT
        ed.id,
        e.nome as equipamento,
        e.topico_mqtt,
        ed.timestamp_dados,
        ed.created_at,
        ed.fonte,
        ed.qualidade,
        ed.num_leituras,
        EXTRACT(EPOCH FROM (ed.created_at - ed.timestamp_dados)) as delay_segundos
      FROM equipamentos_dados ed
      JOIN equipamentos e ON ed.equipamento_id = e.id
      ORDER BY ed.created_at DESC
      LIMIT 10
    `;

    results.push({
      title: '7️⃣ ÚLTIMOS 10 REGISTROS SALVOS',
      data: ultimos,
      summary: ultimos.length > 0 ? `🕐 Último: ${new Date(ultimos[0].created_at).toLocaleString('pt-BR')}` : '❌ Nenhum registro'
    });

    if (ultimos.length > 0) {
      console.log(`   🕐 Último registro: ${new Date(ultimos[0].created_at).toLocaleString('pt-BR')}`);
      console.log(`   📦 Equipamento: ${ultimos[0].equipamento}`);
      console.log(`   📡 Tópico: ${ultimos[0].topico_mqtt}\n`);
    } else {
      console.log(`   ❌ Nenhum registro encontrado!\n`);
    }

    // 8️⃣ GAPS DE DADOS
    console.log('8️⃣ Identificando gaps de dados...');
    const gaps = await prisma.$queryRaw<any[]>`
      WITH dados_timeline AS (
        SELECT
          equipamento_id,
          timestamp_dados,
          LAG(timestamp_dados) OVER (PARTITION BY equipamento_id ORDER BY timestamp_dados) as timestamp_anterior
        FROM equipamentos_dados
        WHERE timestamp_dados >= NOW() - INTERVAL '24 hours'
      )
      SELECT
        e.nome,
        e.topico_mqtt,
        dt.timestamp_anterior as inicio_gap,
        dt.timestamp_dados as fim_gap,
        EXTRACT(EPOCH FROM (dt.timestamp_dados - dt.timestamp_anterior))/60 as minutos_sem_dados
      FROM dados_timeline dt
      JOIN equipamentos e ON dt.equipamento_id = e.id
      WHERE dt.timestamp_anterior IS NOT NULL
        AND EXTRACT(EPOCH FROM (dt.timestamp_dados - dt.timestamp_anterior))/60 > 15
      ORDER BY minutos_sem_dados DESC
      LIMIT 20
    `;

    results.push({
      title: '8️⃣ GAPS DE DADOS (>15min)',
      data: gaps,
      summary: `⏰ ${gaps.length} gaps detectados`
    });

    console.log(`   ⏰ ${gaps.length} gaps (períodos sem dados > 15min) detectados\n`);

    // 9️⃣ EQUIPAMENTOS POR UNIDADE
    console.log('9️⃣ Analisando por unidade...');
    const porUnidade = await prisma.$queryRaw<any[]>`
      SELECT
        u.nome as unidade,
        COUNT(*) as total_equipamentos,
        COUNT(*) FILTER (WHERE e.mqtt_habilitado = true) as mqtt_habilitado,
        COUNT(*) FILTER (WHERE e.topico_mqtt IS NOT NULL) as com_topico,
        COUNT(DISTINCT ed.equipamento_id) FILTER (WHERE ed.timestamp_dados >= NOW() - INTERVAL '24 hours') as recebendo_dados_24h
      FROM unidades u
      LEFT JOIN equipamentos e ON u.id = e.unidade_id AND e.deleted_at IS NULL
      LEFT JOIN equipamentos_dados ed ON e.id = ed.equipamento_id
      GROUP BY u.id, u.nome
      HAVING COUNT(*) FILTER (WHERE e.mqtt_habilitado = true) > 0
      ORDER BY recebendo_dados_24h DESC, total_equipamentos DESC
    `;

    results.push({
      title: '9️⃣ STATUS POR UNIDADE',
      data: porUnidade,
      summary: `🏢 ${porUnidade.length} unidades com MQTT`
    });

    console.log(`   🏢 ${porUnidade.length} unidades com equipamentos MQTT configurados\n`);

    // SALVAR RELATÓRIO
    console.log('💾 Salvando relatório...\n');

    const reportPath = path.join(__dirname, `mqtt-report-${Date.now()}.json`);
    const reportContent = {
      timestamp: new Date().toISOString(),
      summary: {
        totalEquipamentosConfigurados: ultimaRecepcao.length,
        equipamentosComDados48h: comDados.length,
        equipamentosSemDados48h: semDados.length,
        totalRegistros24h: stats[0]?.total_registros_24h || 0,
        ultimoRegistro: stats[0]?.ultimo_registro || null,
        topicosDistintos: topicos.length,
        gapsDetectados: gaps.length,
      },
      results
    };

    fs.writeFileSync(reportPath, JSON.stringify(reportContent, null, 2));
    console.log(`✅ Relatório salvo em: ${reportPath}\n`);

    // RESUMO EXECUTIVO
    console.log('📋 ===== RESUMO EXECUTIVO =====\n');
    console.log(`📡 Total de equipamentos MQTT configurados: ${ultimaRecepcao.length}`);
    console.log(`✅ Equipamentos recebendo dados (48h): ${comDados.length}`);
    console.log(`❌ Equipamentos SEM dados (48h): ${semDados.length}`);
    console.log(`📊 Total de registros (24h): ${stats[0]?.total_registros_24h || 0}`);
    console.log(`🕐 Último registro: ${stats[0]?.ultimo_registro ? new Date(stats[0].ultimo_registro).toLocaleString('pt-BR') : 'Nenhum'}`);
    console.log(`⏰ Gaps detectados (>15min): ${gaps.length}`);
    console.log(`📡 Tópicos MQTT distintos: ${topicos.length}\n`);

    // ALERTAS
    if (semDados.length > 0) {
      console.log('⚠️ ALERTA: Equipamentos configurados mas não estão enviando dados!');
      console.log('   Verifique:');
      console.log('   1. Se o broker MQTT está online e acessível');
      console.log('   2. Se os tópicos estão corretos');
      console.log('   3. Se os dispositivos físicos estão online');
      console.log('   4. Logs do serviço MQTT no backend\n');
    }

    if (stats[0]?.total_registros_24h === 0 || stats[0]?.total_registros_24h === null) {
      console.log('🔴 CRÍTICO: Nenhum dado recebido nas últimas 24h!');
      console.log('   O sistema MQTT pode estar completamente offline.\n');
    }

  } catch (error) {
    console.error('❌ Erro ao executar diagnóstico:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar
executeDiagnostic()
  .then(() => {
    console.log('✅ Diagnóstico concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
