const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Classifica equipamentos entre M160 e MEDIDOR genérico
 *
 * CRITÉRIOS:
 * - M160: Nome contém "M160", "M-160", "Multimedidor"
 * - MEDIDOR: Outros medidores genéricos
 */

async function classificarMedidores() {
  try {
    console.log('='.repeat(80));
    console.log('CLASSIFICANDO EQUIPAMENTOS MEDIDORES');
    console.log('='.repeat(80));
    console.log('');

    // Buscar todos que estão como METER_M160
    const equipamentos = await prisma.equipamentos.findMany({
      where: {
        tipo_equipamento_id: 'tipo-meter-m160-001'
      },
      select: {
        id: true,
        nome: true,
        classificacao: true,
        topico_mqtt: true,
        mqtt_habilitado: true
      },
      orderBy: {
        nome: 'asc'
      }
    });

    console.log(`Total de equipamentos METER_M160: ${equipamentos.length}\n`);

    // Classificar
    const m160Real = [];
    const medidorGenerico = [];

    equipamentos.forEach(eq => {
      const nome = (eq.nome || '').toLowerCase();

      // Critérios para identificar M160
      const ehM160 =
        nome.includes('m160') ||
        nome.includes('m-160') ||
        nome.includes('multimedidor');

      if (ehM160) {
        m160Real.push(eq);
      } else {
        medidorGenerico.push(eq);
      }
    });

    console.log('📊 RESULTADO DA CLASSIFICAÇÃO:\n');
    console.log(`✅ M160 REAIS (${m160Real.length} equipamentos):`);
    console.log('   Devem permanecer como METER_M160\n');

    if (m160Real.length > 0) {
      m160Real.forEach((eq, i) => {
        console.log(`   ${i + 1}. ${eq.nome}`);
        console.log(`      ID: ${eq.id}`);
        console.log(`      MQTT: ${eq.mqtt_habilitado ? '✅ Habilitado' : '❌ Desabilitado'}`);
        if (eq.topico_mqtt) {
          console.log(`      Tópico: ${eq.topico_mqtt}`);
        }
        console.log('');
      });
    }

    console.log('-'.repeat(80));
    console.log('');

    console.log(`⚠️ MEDIDORES GENÉRICOS (${medidorGenerico.length} equipamentos):`);
    console.log('   Devem ser movidos para tipo MEDIDOR\n');

    if (medidorGenerico.length > 0) {
      medidorGenerico.forEach((eq, i) => {
        console.log(`   ${i + 1}. ${eq.nome}`);
        console.log(`      ID: ${eq.id}`);
        console.log('');
      });
    }

    console.log('='.repeat(80));
    console.log('');

    // Perguntar se quer fazer a migração
    console.log('🔧 AÇÕES RECOMENDADAS:\n');

    if (medidorGenerico.length > 0) {
      console.log('Para mover medidores genéricos de volta para tipo MEDIDOR:');
      console.log('');
      console.log('const equipamentosParaMover = [');
      medidorGenerico.forEach(eq => {
        console.log(`  '${eq.id}', // ${eq.nome}`);
      });
      console.log('];');
      console.log('');
      console.log('await prisma.equipamentos.updateMany({');
      console.log('  where: { id: { in: equipamentosParaMover } },');
      console.log("  data: { tipo_equipamento_id: '01JAQTE1MEDIDOR00000001' }");
      console.log('});');
      console.log('');

      // Executar migração automaticamente
      console.log('🚀 EXECUTANDO MIGRAÇÃO AUTOMÁTICA...\n');

      const ids = medidorGenerico.map(eq => eq.id);

      const resultado = await prisma.equipamentos.updateMany({
        where: { id: { in: ids } },
        data: { tipo_equipamento_id: '01JAQTE1MEDIDOR00000001' }
      });

      console.log(`✅ ${resultado.count} equipamento(s) movido(s) para tipo MEDIDOR\n`);
    } else {
      console.log('✅ Nenhum equipamento precisa ser movido!');
      console.log('   Todos os medidores genéricos já estão classificados corretamente.\n');
    }

    console.log('='.repeat(80));
    console.log('✅ CLASSIFICAÇÃO CONCLUÍDA!');
    console.log('='.repeat(80));
    console.log('');
    console.log('Resumo final:');
    console.log(`   - METER_M160: ${m160Real.length} equipamento(s)`);
    console.log(`   - MEDIDOR: ${medidorGenerico.length} equipamento(s)`);
    console.log('');

  } catch (error) {
    console.error('❌ Erro:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

classificarMedidores();
