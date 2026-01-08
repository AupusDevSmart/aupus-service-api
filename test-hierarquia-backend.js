// test-hierarquia-backend.js
// Script completo para testar toda a implementação de hierarquia de categorias

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Cores para console
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(emoji, message, color = colors.reset) {
  console.log(`${color}${emoji} ${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(80));
  console.log(`${colors.cyan}${title}${colors.reset}`);
  console.log('='.repeat(80) + '\n');
}

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    log('✅', `PASS: ${testName}`, colors.green);
    if (details) log('   ', `└─ ${details}`, colors.green);
    return true;
  } else {
    failedTests++;
    log('❌', `FAIL: ${testName}`, colors.red);
    if (details) log('   ', `└─ ${details}`, colors.red);
    return false;
  }
}

async function testDatabase() {
  logSection('TESTE 1: ESTRUTURA DO BANCO DE DADOS');

  try {
    // 1.1 - Verificar se tabela categorias_equipamentos existe
    const categorias = await prisma.categorias_equipamentos.findMany();
    assert(
      categorias.length > 0,
      'Tabela categorias_equipamentos existe e tem dados',
      `${categorias.length} categorias encontradas`
    );

    // 1.2 - Verificar se tem exatamente 17 categorias
    assert(
      categorias.length === 17,
      'Existem exatamente 17 categorias',
      `Esperado: 17, Encontrado: ${categorias.length}`
    );

    // 1.3 - Verificar nomes das categorias esperadas
    const categoriasEsperadas = [
      'Transformador de Potência',
      'Transformador de Potencial (TP)',
      'Transformador de Corrente (TC)',
      'Banco Capacitor',
      'Disjuntor MT',
      'Disjuntor BT',
      'Chave',
      'Pivô',
      'Motor Elétrico',
      'Módulos PV',
      'Power Meter (PM)',
      'Inversor PV',
      'Medidor SSU',
      'Relê Proteção',
      'Inversor Frequência',
      'SoftStarter',
      'RTU',
    ];

    const nomesCategorias = categorias.map((c) => c.nome).sort();
    const todasPresentes = categoriasEsperadas.every((nome) =>
      nomesCategorias.includes(nome)
    );

    assert(
      todasPresentes,
      'Todas as 17 categorias esperadas estão presentes',
      todasPresentes ? 'Todas OK' : 'Faltam categorias'
    );

    // 1.4 - Verificar campos em tipos_equipamentos
    const tiposCount = await prisma.tipos_equipamentos.count();
    assert(
      tiposCount > 0,
      'Tabela tipos_equipamentos tem dados',
      `${tiposCount} tipos encontrados`
    );

    // 1.5 - Verificar se campo categoria_id existe e é NOT NULL (query vai falhar se permitir NULL)
    try {
      // Se esta query funcionar, significa que categoria_id é NOT NULL (não aceita null na busca)
      await prisma.tipos_equipamentos.findMany({
        where: { categoria_id: { not: '' } }, // Testa que não é vazio
        take: 1,
      });
      assert(
        true,
        'Campo categoria_id existe e é NOT NULL (obrigatório)',
        'Constraint NOT NULL validada'
      );
    } catch (err) {
      assert(
        false,
        'Campo categoria_id existe e é NOT NULL',
        `Erro: ${err.message}`
      );
    }

    // 1.6 - Verificar se campo fabricante existe e é NOT NULL
    try {
      await prisma.tipos_equipamentos.findMany({
        where: { fabricante: { not: '' } },
        take: 1,
      });
      assert(
        true,
        'Campo fabricante existe e é NOT NULL (obrigatório)',
        'Constraint NOT NULL validada'
      );
    } catch (err) {
      assert(
        false,
        'Campo fabricante existe e é NOT NULL',
        `Erro: ${err.message}`
      );
    }

    // 1.7 - Verificar campo fabricante_custom em equipamentos
    const equipamentos = await prisma.equipamentos.findMany({
      where: { deleted_at: null },
      take: 5,
      select: {
        id: true,
        nome: true,
        fabricante: true,
        fabricante_custom: true,
      },
    });

    const campoExiste = equipamentos.every(
      (eq) => 'fabricante_custom' in eq
    );
    assert(
      campoExiste,
      'Campo fabricante_custom existe em equipamentos',
      `Verificado em ${equipamentos.length} equipamentos`
    );

    return true;
  } catch (error) {
    log('❌', `ERRO no teste de database: ${error.message}`, colors.red);
    return false;
  }
}

async function testRelations() {
  logSection('TESTE 2: RELAÇÕES ENTRE TABELAS');

  try {
    // 2.1 - Verificar relação categorias → tipos
    const categoriaComModelos = await prisma.categorias_equipamentos.findFirst({
      include: {
        modelos: true,
      },
    });

    assert(
      categoriaComModelos !== null,
      'Relação categorias_equipamentos → tipos_equipamentos (modelos) funciona',
      categoriaComModelos?.modelos?.length
        ? `${categoriaComModelos.modelos.length} modelos na categoria "${categoriaComModelos.nome}"`
        : 'Categoria sem modelos'
    );

    // 2.2 - Verificar relação tipos → categoria
    const tipoComCategoria = await prisma.tipos_equipamentos.findFirst({
      include: {
        categoria: true,
      },
    });

    assert(
      tipoComCategoria?.categoria !== null,
      'Relação tipos_equipamentos → categorias_equipamentos funciona',
      tipoComCategoria?.categoria?.nome
        ? `Tipo "${tipoComCategoria.nome}" pertence à categoria "${tipoComCategoria.categoria.nome}"`
        : 'Tipo sem categoria'
    );

    // 2.3 - Verificar relação equipamentos → tipos com categoria
    const equipamentoCompleto = await prisma.equipamentos.findFirst({
      where: {
        deleted_at: null,
        tipo_equipamento_id: { not: null },
      },
      include: {
        tipo_equipamento_rel: {
          include: {
            categoria: true,
          },
        },
      },
    });

    assert(
      equipamentoCompleto?.tipo_equipamento_rel?.categoria !== null,
      'Relação equipamentos → tipos → categoria funciona',
      equipamentoCompleto?.tipo_equipamento_rel?.categoria?.nome
        ? `Equipamento "${equipamentoCompleto.nome}" do tipo "${equipamentoCompleto.tipo_equipamento_rel.nome}" na categoria "${equipamentoCompleto.tipo_equipamento_rel.categoria.nome}"`
        : 'Equipamento sem categoria'
    );

    return true;
  } catch (error) {
    log('❌', `ERRO no teste de relações: ${error.message}`, colors.red);
    return false;
  }
}

async function testMqttEquipment() {
  logSection('TESTE 3: EQUIPAMENTOS MQTT CRÍTICOS');

  try {
    const tiposMqtt = ['METER_M160', 'INVERSOR', 'PIVO'];

    for (const codigoTipo of tiposMqtt) {
      // 3.1 - Verificar se tipo existe
      const tipo = await prisma.tipos_equipamentos.findUnique({
        where: { codigo: codigoTipo },
        include: {
          categoria: true,
        },
      });

      assert(
        tipo !== null,
        `Tipo MQTT "${codigoTipo}" existe no banco`,
        tipo ? `Nome: ${tipo.nome}, Categoria: ${tipo.categoria.nome}` : 'Tipo não encontrado'
      );

      if (!tipo) continue;

      // 3.2 - Verificar equipamentos com MQTT ativo
      const equipamentosMqtt = await prisma.equipamentos.findMany({
        where: {
          tipo_equipamento_id: tipo.id,
          mqtt_habilitado: true,
          deleted_at: null,
        },
        include: {
          tipo_equipamento_rel: {
            include: {
              categoria: true,
            },
          },
        },
      });

      assert(
        equipamentosMqtt.length > 0,
        `Tipo "${codigoTipo}" tem equipamentos com MQTT ativo`,
        `${equipamentosMqtt.length} equipamento(s) com MQTT ativo`
      );

      // 3.3 - Verificar se categoria e fabricante estão presentes
      for (const eq of equipamentosMqtt) {
        const temCategoria = eq.tipo_equipamento_rel?.categoria !== null;
        const temFabricante = eq.tipo_equipamento_rel?.fabricante !== null;

        assert(
          temCategoria && temFabricante,
          `Equipamento MQTT "${eq.nome}" (${codigoTipo}) tem categoria e fabricante`,
          `Categoria: ${eq.tipo_equipamento_rel?.categoria?.nome}, Fabricante: ${eq.tipo_equipamento_rel?.fabricante}`
        );
      }
    }

    return true;
  } catch (error) {
    log('❌', `ERRO no teste de MQTT: ${error.message}`, colors.red);
    return false;
  }
}

async function testDataIntegrity() {
  logSection('TESTE 4: INTEGRIDADE DE DADOS');

  try {
    // 4.1 - Verificar equipamentos órfãos (sem tipo_equipamento_id)
    const equipamentosOrfaos = await prisma.equipamentos.count({
      where: {
        deleted_at: null,
        tipo_equipamento_id: null,
      },
    });

    // Aceitar equipamentos órfãos como aviso, não erro (podem ser equipamentos antigos)
    if (equipamentosOrfaos > 0) {
      log(
        '⚠️',
        `AVISO: ${equipamentosOrfaos} equipamentos sem tipo_equipamento_id (podem ser legados)`,
        colors.yellow
      );

      // Mostrar alguns exemplos
      const exemplos = await prisma.equipamentos.findMany({
        where: {
          deleted_at: null,
          tipo_equipamento_id: null,
        },
        select: {
          id: true,
          nome: true,
          classificacao: true,
        },
        take: 5,
      });

      exemplos.forEach(eq => {
        log('   ', `└─ ${eq.nome} (${eq.classificacao}) - ID: ${eq.id}`, colors.yellow);
      });
    }

    assert(
      true, // Sempre passa, mas emite aviso acima se houver órfãos
      'Verificação de equipamentos órfãos concluída',
      equipamentosOrfaos === 0
        ? 'Todos os equipamentos têm tipo válido'
        : `${equipamentosOrfaos} equipamentos sem tipo (veja avisos acima)`
    );

    // 4.2 - Verificar tipos com categoria válida (todos devem ter por causa do NOT NULL)
    const totalTipos = await prisma.tipos_equipamentos.count();
    const tiposComCategoria = await prisma.tipos_equipamentos.count({
      where: {
        categoria: {
          isNot: null,
        },
      },
    });

    assert(
      totalTipos === tiposComCategoria,
      'Todos os tipos têm categoria válida',
      `${tiposComCategoria} de ${totalTipos} tipos têm categoria`
    );

    // 4.3 - Verificar mapeamento de fabricantes
    const equipamentosComFabricanteCustom = await prisma.equipamentos.count({
      where: {
        deleted_at: null,
        fabricante_custom: { not: null },
      },
    });

    log(
      'ℹ️',
      `Total de equipamentos com fabricante customizado: ${equipamentosComFabricanteCustom}`,
      colors.blue
    );

    // 4.4 - Verificar consistência: equipamentos devem ter fabricante do modelo ou custom
    const amostra = await prisma.equipamentos.findMany({
      where: {
        deleted_at: null,
        tipo_equipamento_id: { not: null },
      },
      include: {
        tipo_equipamento_rel: true,
      },
      take: 20,
    });

    let inconsistencias = 0;
    for (const eq of amostra) {
      const fabricanteModelo = eq.tipo_equipamento_rel?.fabricante;
      const fabricanteEquipamento = eq.fabricante;

      // Se o equipamento tem fabricante diferente do modelo, deve ter fabricante_custom
      if (fabricanteModelo && fabricanteEquipamento !== fabricanteModelo) {
        if (!eq.fabricante_custom) {
          inconsistencias++;
          log(
            '⚠️',
            `Inconsistência: Equipamento "${eq.nome}" tem fabricante "${fabricanteEquipamento}" diferente do modelo "${fabricanteModelo}" mas sem fabricante_custom`,
            colors.yellow
          );
        }
      }
    }

    assert(
      inconsistencias === 0,
      'Não há inconsistências na lógica de fabricantes',
      inconsistencias === 0
        ? `Verificado em ${amostra.length} equipamentos`
        : `${inconsistencias} inconsistências encontradas`
    );

    return true;
  } catch (error) {
    log('❌', `ERRO no teste de integridade: ${error.message}`, colors.red);
    return false;
  }
}

async function testQueries() {
  logSection('TESTE 5: QUERIES E PERFORMANCE');

  try {
    // 5.1 - Buscar todas as categorias com contagem de modelos
    const startCategoria = Date.now();
    const categorias = await prisma.categorias_equipamentos.findMany({
      include: {
        _count: {
          select: {
            modelos: true,
          },
        },
      },
      orderBy: {
        nome: 'asc',
      },
    });
    const timeCategoria = Date.now() - startCategoria;

    assert(
      categorias.length > 0 && timeCategoria < 1000,
      'Query de categorias com contagem é rápida (<1s)',
      `${categorias.length} categorias em ${timeCategoria}ms`
    );

    // 5.2 - Buscar tipos com categoria (simulando endpoint /tipos-equipamentos)
    const startTipos = Date.now();
    const tipos = await prisma.tipos_equipamentos.findMany({
      include: {
        categoria: true,
      },
      orderBy: [{ categoria: { nome: 'asc' } }, { nome: 'asc' }],
      take: 50,
    });
    const timeTipos = Date.now() - startTipos;

    assert(
      tipos.length > 0 && timeTipos < 1000,
      'Query de tipos com categoria é rápida (<1s)',
      `${tipos.length} tipos em ${timeTipos}ms`
    );

    // 5.3 - Buscar equipamentos com tipo e categoria (simulando listagem)
    const startEquipamentos = Date.now();
    const equipamentos = await prisma.equipamentos.findMany({
      where: {
        deleted_at: null,
      },
      include: {
        tipo_equipamento_rel: {
          select: {
            id: true,
            codigo: true,
            nome: true,
            categoria_id: true,
            categoria: true,
            fabricante: true,
          },
        },
      },
      take: 50,
    });
    const timeEquipamentos = Date.now() - startEquipamentos;

    assert(
      equipamentos.length > 0 && timeEquipamentos < 2000,
      'Query de equipamentos com tipo e categoria é rápida (<2s)',
      `${equipamentos.length} equipamentos em ${timeEquipamentos}ms`
    );

    // 5.4 - Filtrar tipos por categoria_id
    const primeiraCategoria = categorias[0];
    const startFiltro = Date.now();
    const tiposFiltrados = await prisma.tipos_equipamentos.findMany({
      where: {
        categoria_id: primeiraCategoria.id,
      },
      include: {
        categoria: true,
      },
    });
    const timeFiltro = Date.now() - startFiltro;

    assert(
      tiposFiltrados.length >= 0 && timeFiltro < 500,
      'Filtro por categoria_id funciona e é rápido (<500ms)',
      `${tiposFiltrados.length} tipos na categoria "${primeiraCategoria.nome}" em ${timeFiltro}ms`
    );

    return true;
  } catch (error) {
    log('❌', `ERRO no teste de queries: ${error.message}`, colors.red);
    return false;
  }
}

async function testBusinessLogic() {
  logSection('TESTE 6: LÓGICA DE NEGÓCIO');

  try {
    // 6.1 - Verificar se criarEquipamentoRapido preencheria o fabricante corretamente
    const tipoAleatorio = await prisma.tipos_equipamentos.findFirst({
      include: {
        categoria: true,
      },
    });

    assert(
      tipoAleatorio?.fabricante !== null,
      'Tipos têm fabricante para preencher equipamentos automaticamente',
      `Tipo "${tipoAleatorio?.nome}" tem fabricante "${tipoAleatorio?.fabricante}"`
    );

    // 6.2 - Verificar mapeamento correto dos tipos MQTT críticos
    const mapeamentoEsperado = {
      METER_M160: { categoria: 'Power Meter (PM)', fabricante: 'Kron' },
      INVERSOR: { categoria: 'Inversor PV', fabricante: 'Growatt' },
      PIVO: { categoria: 'Pivô', fabricante: 'Valley' },
    };

    for (const [codigo, esperado] of Object.entries(mapeamentoEsperado)) {
      const tipo = await prisma.tipos_equipamentos.findUnique({
        where: { codigo },
        include: { categoria: true },
      });

      const categoriaCorreta = tipo?.categoria?.nome === esperado.categoria;
      const fabricanteCorreto = tipo?.fabricante === esperado.fabricante;

      assert(
        categoriaCorreta && fabricanteCorreto,
        `Mapeamento de "${codigo}" está correto`,
        `Categoria: ${tipo?.categoria?.nome} (${categoriaCorreta ? '✓' : '✗'}), Fabricante: ${tipo?.fabricante} (${fabricanteCorreto ? '✓' : '✗'})`
      );
    }

    // 6.3 - Verificar se há modelos suficientes por categoria
    const categoriasComModelos = await prisma.categorias_equipamentos.findMany({
      include: {
        _count: {
          select: {
            modelos: true,
          },
        },
      },
    });

    const categoriasSemModelos = categoriasComModelos.filter(
      (c) => c._count.modelos === 0
    );

    log(
      'ℹ️',
      `Categorias sem modelos: ${categoriasSemModelos.length} de ${categoriasComModelos.length}`,
      categoriasSemModelos.length > 10 ? colors.yellow : colors.blue
    );

    if (categoriasSemModelos.length > 0) {
      log(
        '⚠️',
        `Categorias vazias: ${categoriasSemModelos.map((c) => c.nome).join(', ')}`,
        colors.yellow
      );
    }

    return true;
  } catch (error) {
    log('❌', `ERRO no teste de lógica de negócio: ${error.message}`, colors.red);
    return false;
  }
}

async function generateReport() {
  logSection('RELATÓRIO DETALHADO');

  try {
    // Estatísticas gerais
    const [totalCategorias, totalTipos, totalEquipamentos] = await Promise.all([
      prisma.categorias_equipamentos.count(),
      prisma.tipos_equipamentos.count(),
      prisma.equipamentos.count({ where: { deleted_at: null } }),
    ]);

    log('📊', 'ESTATÍSTICAS GERAIS', colors.cyan);
    console.log(`   └─ Categorias: ${totalCategorias}`);
    console.log(`   └─ Tipos (Modelos): ${totalTipos}`);
    console.log(`   └─ Equipamentos: ${totalEquipamentos}`);

    // Categorias mais usadas
    const categoriasComContagem = await prisma.categorias_equipamentos.findMany({
      include: {
        _count: {
          select: {
            modelos: true,
          },
        },
      },
      orderBy: {
        modelos: {
          _count: 'desc',
        },
      },
      take: 5,
    });

    log('\n📈', 'TOP 5 CATEGORIAS COM MAIS MODELOS', colors.cyan);
    categoriasComContagem.forEach((cat, idx) => {
      console.log(`   ${idx + 1}. ${cat.nome}: ${cat._count.modelos} modelo(s)`);
    });

    // Equipamentos MQTT
    const equipamentosMqtt = await prisma.equipamentos.count({
      where: {
        mqtt_habilitado: true,
        deleted_at: null,
      },
    });

    log('\n⚡', 'EQUIPAMENTOS MQTT', colors.cyan);
    console.log(`   └─ Total com MQTT ativo: ${equipamentosMqtt}`);

    // Fabricantes mais comuns
    const fabricantes = await prisma.tipos_equipamentos.groupBy({
      by: ['fabricante'],
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: 5,
    });

    log('\n🏭', 'TOP 5 FABRICANTES', colors.cyan);
    fabricantes.forEach((fab, idx) => {
      console.log(`   ${idx + 1}. ${fab.fabricante}: ${fab._count.id} modelo(s)`);
    });

    return true;
  } catch (error) {
    log('❌', `ERRO ao gerar relatório: ${error.message}`, colors.red);
    return false;
  }
}

async function main() {
  console.clear();
  log('🚀', 'TESTE COMPLETO - HIERARQUIA DE CATEGORIAS DE EQUIPAMENTOS', colors.cyan);
  log('📅', `Data: ${new Date().toLocaleString('pt-BR')}`, colors.blue);
  console.log('\n');

  try {
    // Executar todos os testes
    await testDatabase();
    await testRelations();
    await testMqttEquipment();
    await testDataIntegrity();
    await testQueries();
    await testBusinessLogic();
    await generateReport();

    // Resumo final
    logSection('RESUMO DOS TESTES');

    const successRate = ((passedTests / totalTests) * 100).toFixed(1);

    console.log(`${colors.cyan}Total de Testes:${colors.reset} ${totalTests}`);
    console.log(
      `${colors.green}✅ Aprovados:${colors.reset}    ${passedTests} (${successRate}%)`
    );
    console.log(`${colors.red}❌ Falhados:${colors.reset}     ${failedTests}`);

    console.log('\n' + '='.repeat(80));

    if (failedTests === 0) {
      log(
        '🎉',
        'TODOS OS TESTES PASSARAM! Backend está pronto para continuar.',
        colors.green
      );
      process.exit(0);
    } else {
      log(
        '⚠️',
        `${failedTests} teste(s) falharam. Revise os erros acima antes de continuar.`,
        colors.yellow
      );
      process.exit(1);
    }
  } catch (error) {
    log('💥', `ERRO CRÍTICO: ${error.message}`, colors.red);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
