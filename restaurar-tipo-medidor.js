const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Restaura o tipo MEDIDOR que foi deletado incorretamente
 * MEDIDOR não é um M160, é um tipo genérico de medidor de energia
 */

const TIPO_MEDIDOR_ORIGINAL = {
  id: '01JAQTE1MEDIDOR00000001',
  codigo: 'MEDIDOR',
  nome: 'Medidor de Energia',
  categoria: 'MEDICAO',
  largura_padrao: 32,
  altura_padrao: 32,
  icone_svg: null,
  propriedades_schema: {
    campos: [
      {
        tipo: 'number',
        campo: 'tensao_nominal',
        unidade: 'V',
        obrigatorio: true
      },
      {
        tipo: 'number',
        campo: 'corrente_nominal',
        unidade: 'A',
        obrigatorio: true
      },
      {
        tipo: 'select',
        campo: 'classe_precisao',
        opcoes: ['0.2', '0.5', '1.0', '2.0'],
        obrigatorio: true
      },
      {
        tipo: 'select',
        campo: 'fases',
        opcoes: ['Monofásico', 'Bifásico', 'Trifásico'],
        obrigatorio: true
      },
      {
        tipo: 'select',
        campo: 'comunicacao',
        opcoes: ['RS485', 'Ethernet', 'LoRa', 'Zigbee', 'Sem comunicação'],
        obrigatorio: false
      }
    ]
  }
};

async function restaurarMedidor() {
  try {
    console.log('='.repeat(80));
    console.log('RESTAURANDO TIPO MEDIDOR');
    console.log('='.repeat(80));
    console.log('');

    // Verificar se tipo MEDIDOR já existe
    const existente = await prisma.tipos_equipamentos.findUnique({
      where: { id: TIPO_MEDIDOR_ORIGINAL.id }
    });

    if (existente) {
      console.log('✅ Tipo MEDIDOR já existe no banco!');
      console.log(`   ID: ${existente.id}`);
      console.log(`   Código: ${existente.codigo}`);
      console.log(`   Nome: ${existente.nome}`);
      console.log('');
      console.log('Nada a fazer.');
      return;
    }

    console.log('📝 Criando tipo MEDIDOR...\n');

    // Criar tipo MEDIDOR
    const criado = await prisma.tipos_equipamentos.create({
      data: TIPO_MEDIDOR_ORIGINAL
    });

    console.log('✅ Tipo MEDIDOR criado com sucesso!\n');
    console.log('Detalhes:');
    console.log(`   ID: ${criado.id}`);
    console.log(`   Código: ${criado.codigo}`);
    console.log(`   Nome: ${criado.nome}`);
    console.log(`   Categoria: ${criado.categoria}`);
    console.log('');

    // Verificar quantos equipamentos estão como METER_M160 mas deveriam ser MEDIDOR
    console.log('🔍 Verificando equipamentos...\n');

    const equipamentosMeter = await prisma.equipamentos.findMany({
      where: {
        tipo_equipamento_id: 'tipo-meter-m160-001'
      },
      select: {
        id: true,
        nome: true,
        classificacao: true
      }
    });

    console.log(`Encontrados ${equipamentosMeter.length} equipamentos usando METER_M160`);
    console.log('');

    // Listar para o usuário decidir quais mover de volta
    if (equipamentosMeter.length > 0) {
      console.log('⚠️ Equipamentos que podem precisar ser movidos de volta para MEDIDOR:');
      console.log('   (Você precisará fazer isso manualmente se necessário)\n');

      equipamentosMeter.forEach((eq, i) => {
        console.log(`   ${i + 1}. ${eq.nome || eq.id}`);
        console.log(`      ID: ${eq.id}`);
        console.log(`      Classificação: ${eq.classificacao}`);
        console.log('');
      });

      console.log('Para mover um equipamento de volta para MEDIDOR, execute:');
      console.log('');
      console.log(`UPDATE equipamentos SET tipo_equipamento_id = '01JAQTE1MEDIDOR00000001'`);
      console.log(`WHERE id = 'ID_DO_EQUIPAMENTO';`);
      console.log('');
    }

    console.log('='.repeat(80));
    console.log('✅ RESTAURAÇÃO CONCLUÍDA!');
    console.log('='.repeat(80));
    console.log('');
    console.log('Tipos de medidores disponíveis agora:');
    console.log('   1. METER_M160 → Multimedidor M160 4Q (dados MQTT com Resumo)');
    console.log('   2. MEDIDOR → Medidor genérico de energia');
    console.log('   3. METER_LANDIS → Landis Gyr');
    console.log('');

  } catch (error) {
    console.error('❌ Erro:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

restaurarMedidor();
