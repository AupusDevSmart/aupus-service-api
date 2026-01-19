/**
 * Script de Análise e Inserção: Inversor Solar Sungrow
 *
 * Este script:
 * 1. Analisa a estrutura das tabelas categorias_equipamentos e tipos_equipamentos
 * 2. Verifica categorias e tipos existentes
 * 3. Adiciona novo tipo de equipamento: Inversor Solar do Fabricante Sungrow
 *
 * Data: 2026-01-19
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function main() {
  console.log('\n========================================');
  console.log('ANÁLISE DAS TABELAS DE EQUIPAMENTOS');
  console.log('========================================\n');

  // ========================================
  // STEP 1: Analisar Categorias Existentes
  // ========================================
  console.log('📋 STEP 1: Analisando categorias_equipamentos...\n');

  const categorias = await prisma.categorias_equipamentos.findMany({
    include: {
      modelos: {
        select: {
          id: true,
          codigo: true,
          nome: true,
          fabricante: true,
        }
      }
    },
    orderBy: {
      nome: 'asc'
    }
  });

  console.log(`✅ Total de categorias: ${categorias.length}\n`);

  categorias.forEach((categoria, index) => {
    console.log(`${index + 1}. ${categoria.nome}`);
    console.log(`   ID: ${categoria.id}`);
    console.log(`   Modelos associados: ${categoria.modelos.length}`);

    if (categoria.modelos.length > 0) {
      console.log('   Tipos:');
      categoria.modelos.forEach(modelo => {
        console.log(`      - ${modelo.codigo} (${modelo.nome}) - ${modelo.fabricante}`);
      });
    }
    console.log('');
  });

  // ========================================
  // STEP 2: Analisar Tipos de Equipamentos
  // ========================================
  console.log('\n📋 STEP 2: Analisando tipos_equipamentos...\n');

  const tipos = await prisma.tipos_equipamentos.findMany({
    include: {
      categoria: true,
      equipamentos: {
        select: {
          id: true,
          nome: true,
        }
      }
    },
    orderBy: [
      { categoria: { nome: 'asc' } },
      { nome: 'asc' }
    ]
  });

  console.log(`✅ Total de tipos de equipamentos: ${tipos.length}\n`);

  // Agrupar por categoria
  const tiposPorCategoria = {};
  tipos.forEach(tipo => {
    const categoriaNome = tipo.categoria?.nome || 'Sem Categoria';
    if (!tiposPorCategoria[categoriaNome]) {
      tiposPorCategoria[categoriaNome] = [];
    }
    tiposPorCategoria[categoriaNome].push(tipo);
  });

  Object.keys(tiposPorCategoria).sort().forEach(categoriaNome => {
    console.log(`\n📦 Categoria: ${categoriaNome}`);
    console.log('─'.repeat(60));

    tiposPorCategoria[categoriaNome].forEach(tipo => {
      console.log(`\n  Código: ${tipo.codigo}`);
      console.log(`  Nome: ${tipo.nome}`);
      console.log(`  Fabricante: ${tipo.fabricante}`);
      console.log(`  ID: ${tipo.id}`);
      console.log(`  Dimensões: ${tipo.largura_padrao}x${tipo.altura_padrao}px`);
      console.log(`  MQTT Schema: ${tipo.mqtt_schema ? '✅ Configurado' : '❌ Não configurado'}`);
      console.log(`  Equipamentos cadastrados: ${tipo.equipamentos.length}`);
    });
  });

  // ========================================
  // STEP 3: Verificar Categoria "Inversor PV"
  // ========================================
  console.log('\n\n========================================');
  console.log('VERIFICANDO CATEGORIA INVERSOR PV');
  console.log('========================================\n');

  const categoriaInversorPV = categorias.find(c => c.nome === 'Inversor PV');

  if (!categoriaInversorPV) {
    console.log('❌ ERRO: Categoria "Inversor PV" não encontrada!');
    console.log('   É necessário criar a categoria primeiro.');
    return;
  }

  console.log('✅ Categoria "Inversor PV" encontrada:');
  console.log(`   ID: ${categoriaInversorPV.id}`);
  console.log(`   Modelos existentes: ${categoriaInversorPV.modelos.length}`);

  if (categoriaInversorPV.modelos.length > 0) {
    console.log('\n   Modelos de inversores já cadastrados:');
    categoriaInversorPV.modelos.forEach(modelo => {
      console.log(`   - ${modelo.codigo}: ${modelo.nome} (${modelo.fabricante})`);
    });
  }

  // ========================================
  // STEP 4: Verificar se já existe Inversor Sungrow
  // ========================================
  console.log('\n\n========================================');
  console.log('VERIFICANDO INVERSOR SUNGROW');
  console.log('========================================\n');

  const inversorSungrowExistente = tipos.find(
    t => t.fabricante === 'Sungrow' && t.categoria?.nome === 'Inversor PV'
  );

  if (inversorSungrowExistente) {
    console.log('⚠️  ATENÇÃO: Já existe um inversor Sungrow cadastrado!');
    console.log(`   Código: ${inversorSungrowExistente.codigo}`);
    console.log(`   Nome: ${inversorSungrowExistente.nome}`);
    console.log(`   ID: ${inversorSungrowExistente.id}`);
    console.log('\n   Não é necessário criar um novo tipo.');
    return;
  }

  console.log('✅ Nenhum inversor Sungrow encontrado. Prosseguindo com criação...\n');

  // ========================================
  // STEP 5: Criar Novo Tipo - Inversor Sungrow
  // ========================================
  console.log('\n========================================');
  console.log('CRIANDO NOVO TIPO: INVERSOR SUNGROW');
  console.log('========================================\n');

  // Gerar ID único (CUID)
  const { createId } = require('@paralleldrive/cuid2');
  const novoId = createId();

  const novoTipo = {
    id: novoId,
    codigo: 'INVERSOR_SUNGROW',
    nome: 'Inversor Solar Sungrow',
    categoria_id: categoriaInversorPV.id,
    fabricante: 'Sungrow',
    largura_padrao: 64,
    altura_padrao: 48,
    icone_svg: null,
    propriedades_schema: {
      campos: [
        {
          campo: 'potencia_nominal',
          tipo: 'number',
          unidade: 'kW',
          obrigatorio: true,
          descricao: 'Potência nominal do inversor'
        },
        {
          campo: 'modelo',
          tipo: 'string',
          unidade: null,
          obrigatorio: true,
          descricao: 'Modelo específico do inversor (ex: SG110CX)'
        },
        {
          campo: 'tensao_mppt_max',
          tipo: 'number',
          unidade: 'V',
          obrigatorio: false,
          descricao: 'Tensão máxima MPPT'
        },
        {
          campo: 'numero_mppts',
          tipo: 'number',
          unidade: null,
          obrigatorio: false,
          descricao: 'Número de MPPTs'
        },
        {
          campo: 'numero_serie',
          tipo: 'string',
          unidade: null,
          obrigatorio: false,
          descricao: 'Número de série do equipamento'
        }
      ]
    },
    mqtt_schema: {
      tipo: 'inversor_solar',
      topicos: {
        telemetria: 'aupus/{unidade_id}/inversor/{equipamento_id}/telemetria',
        comando: 'aupus/{unidade_id}/inversor/{equipamento_id}/comando',
        status: 'aupus/{unidade_id}/inversor/{equipamento_id}/status'
      },
      campos_telemetria: [
        { campo: 'potencia_ativa', tipo: 'float', unidade: 'kW', descricao: 'Potência ativa instantânea' },
        { campo: 'potencia_reativa', tipo: 'float', unidade: 'kVAr', descricao: 'Potência reativa' },
        { campo: 'tensao_dc', tipo: 'float', unidade: 'V', descricao: 'Tensão DC entrada' },
        { campo: 'corrente_dc', tipo: 'float', unidade: 'A', descricao: 'Corrente DC entrada' },
        { campo: 'tensao_ac', tipo: 'float', unidade: 'V', descricao: 'Tensão AC saída' },
        { campo: 'corrente_ac', tipo: 'float', unidade: 'A', descricao: 'Corrente AC saída' },
        { campo: 'frequencia', tipo: 'float', unidade: 'Hz', descricao: 'Frequência da rede' },
        { campo: 'temperatura', tipo: 'float', unidade: '°C', descricao: 'Temperatura interna' },
        { campo: 'energia_total', tipo: 'float', unidade: 'kWh', descricao: 'Energia total gerada' },
        { campo: 'energia_diaria', tipo: 'float', unidade: 'kWh', descricao: 'Energia gerada hoje' },
        { campo: 'status_operacao', tipo: 'string', descricao: 'Status operacional' },
        { campo: 'codigo_alarme', tipo: 'integer', descricao: 'Código de alarme (0 = sem alarme)' }
      ]
    },
    created_at: new Date(),
    updated_at: new Date(),
  };

  console.log('📝 Dados do novo tipo:');
  console.log(JSON.stringify(novoTipo, null, 2));

  console.log('\n🔄 Inserindo no banco de dados...\n');

  try {
    const tipoInserido = await prisma.tipos_equipamentos.create({
      data: novoTipo,
      include: {
        categoria: true
      }
    });

    console.log('✅ SUCESSO! Novo tipo de equipamento criado:\n');
    console.log(`   ID: ${tipoInserido.id}`);
    console.log(`   Código: ${tipoInserido.codigo}`);
    console.log(`   Nome: ${tipoInserido.nome}`);
    console.log(`   Fabricante: ${tipoInserido.fabricante}`);
    console.log(`   Categoria: ${tipoInserido.categoria.nome}`);
    console.log(`   Dimensões: ${tipoInserido.largura_padrao}x${tipoInserido.altura_padrao}px`);

  } catch (error) {
    console.error('❌ ERRO ao criar tipo de equipamento:');
    console.error(error.message);

    if (error.code === 'P2002') {
      console.error('\n⚠️  Já existe um tipo com o código "INVERSOR_SUNGROW"');
    }
  }

  // ========================================
  // STEP 6: Resumo Final
  // ========================================
  console.log('\n\n========================================');
  console.log('RESUMO DA OPERAÇÃO');
  console.log('========================================\n');

  const tiposAtualizados = await prisma.tipos_equipamentos.count();
  const categoriasTotal = await prisma.categorias_equipamentos.count();

  console.log(`📊 Estatísticas atualizadas:`);
  console.log(`   Total de categorias: ${categoriasTotal}`);
  console.log(`   Total de tipos: ${tiposAtualizados}`);

  const inversoresPV = await prisma.tipos_equipamentos.findMany({
    where: {
      categoria: {
        nome: 'Inversor PV'
      }
    },
    include: {
      categoria: true
    }
  });

  console.log(`\n   Inversores PV cadastrados: ${inversoresPV.length}`);
  inversoresPV.forEach(inv => {
    console.log(`   - ${inv.codigo}: ${inv.nome} (${inv.fabricante})`);
  });

  console.log('\n✅ Análise e inserção concluídas!\n');
  console.log('📝 PRÓXIMOS PASSOS:');
  console.log('   1. Adicionar renderização do inversor Sungrow no frontend');
  console.log('   2. Cadastrar equipamentos do tipo INVERSOR_SUNGROW');
  console.log('   3. Configurar comunicação MQTT se necessário');
  console.log('   4. Testar visualização no diagrama sinóptico\n');
}

main()
  .catch((e) => {
    console.error('\n❌ ERRO FATAL:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
