const { PrismaClient } = require('@prisma/client');
const { createId } = require('@paralleldrive/cuid2');
const prisma = new PrismaClient();

async function testarFluxoAnomalias() {
  console.log('🧪 TESTE: FLUXO COMPLETO DE ANOMALIAS\n');
  console.log('='.repeat(70));

  try {
    // ===== PREPARAÇÃO: Buscar dados existentes =====
    console.log('\n📋 PREPARAÇÃO: Buscando dados para teste');

    const equipamento = await prisma.equipamentos.findFirst({
      where: {
        unidade_id: { not: null },
        classificacao: 'UC'
      },
      include: {
        unidade: {
          include: {
            planta: true
          }
        }
      }
    });

    if (!equipamento) {
      throw new Error('Nenhum equipamento encontrado para teste');
    }

    console.log(`✅ Equipamento: ${equipamento.nome}`);
    console.log(`   Unidade: ${equipamento.unidade.nome}`);
    console.log(`   Planta: ${equipamento.unidade.planta.nome}`);

    // ===== TESTE 1: Criar anomalia completa =====
    console.log('\n📋 TESTE 1: Criar anomalia com todos os campos');

    const novaAnomalia = await prisma.anomalias.create({
      data: {
        id: createId(),
        equipamento_id: equipamento.id,
        planta_id: equipamento.unidade.planta.id,
        descricao: 'Teste de anomalia - Vibração excessiva detectada',
        local: equipamento.localizacao || 'Área de teste',
        ativo: equipamento.nome,
        data: new Date(),
        condicao: 'FUNCIONANDO',
        origem: 'OPERADOR',
        status: 'AGUARDANDO',
        prioridade: 'ALTA',
        observacoes: 'Anomalia criada para teste do fluxo completo',
        criado_por: 'Sistema de Teste',
      }
    });

    console.log(`✅ Anomalia criada: ${novaAnomalia.id}`);
    console.log(`   Descrição: ${novaAnomalia.descricao}`);
    console.log(`   Status: ${novaAnomalia.status}`);
    console.log(`   Prioridade: ${novaAnomalia.prioridade}`);

    // ===== TESTE 2: Buscar anomalia com relacionamentos =====
    console.log('\n📋 TESTE 2: Buscar anomalia com relacionamentos');

    const anomaliaCompleta = await prisma.anomalias.findUnique({
      where: { id: novaAnomalia.id },
      include: {
        equipamento: {
          include: {
            unidade: {
              include: {
                planta: true
              }
            }
          }
        },
        planta: true,
      }
    });

    if (anomaliaCompleta) {
      console.log(`✅ Anomalia encontrada com relacionamentos:`);
      console.log(`   Equipamento: ${anomaliaCompleta.equipamento.nome}`);
      console.log(`   Unidade: ${anomaliaCompleta.equipamento.unidade.nome}`);
      console.log(`   Planta: ${anomaliaCompleta.planta.nome}`);
      console.log(`   Hierarquia completa: OK ✅`);
    }

    // ===== TESTE 3: Atualizar status da anomalia =====
    console.log('\n📋 TESTE 3: Atualizar status da anomalia');

    const anomaliaAtualizada = await prisma.anomalias.update({
      where: { id: novaAnomalia.id },
      data: {
        status: 'EM_ANALISE',
        observacoes: 'Anomalia em análise pela equipe de manutenção'
      }
    });

    console.log(`✅ Anomalia atualizada:`);
    console.log(`   Novo status: ${anomaliaAtualizada.status}`);
    console.log(`   Observações: ${anomaliaAtualizada.observacoes}`);

    // ===== TESTE 4: Criar histórico de anomalia =====
    console.log('\n📋 TESTE 4: Criar histórico de anomalia');

    const historico = await prisma.historico_anomalias.create({
      data: {
        id: createId(),
        anomalia_id: novaAnomalia.id,
        acao: 'MUDANCA_STATUS',
        usuario: 'Sistema de Teste',
        status_anterior: 'AGUARDANDO',
        status_novo: 'EM_ANALISE',
        observacoes: 'Mudança de status registrada no histórico',
        // Campo correto é 'data', não 'data_mudanca' (campo é preenchido automaticamente pelo @default(now()))
      }
    });

    console.log(`✅ Histórico criado: ${historico.id}`);

    // ===== TESTE 5: Filtrar anomalias por planta =====
    console.log('\n📋 TESTE 5: Filtrar anomalias por planta');

    const anomaliasDaPlanta = await prisma.anomalias.findMany({
      where: {
        planta_id: equipamento.unidade.planta.id,
        deleted_at: null,
      },
      include: {
        equipamento: true,
      }
    });

    console.log(`✅ Anomalias encontradas na planta: ${anomaliasDaPlanta.length}`);
    anomaliasDaPlanta.slice(0, 3).forEach(a => {
      console.log(`   - ${a.descricao} [${a.status}]`);
    });

    // ===== TESTE 6: Filtrar por status e prioridade =====
    console.log('\n📋 TESTE 6: Filtrar por status e prioridade');

    const anomaliasAlta = await prisma.anomalias.count({
      where: {
        prioridade: 'ALTA',
        status: { in: ['AGUARDANDO', 'EM_ANALISE'] },
        deleted_at: null,
      }
    });

    console.log(`✅ Anomalias de alta prioridade abertas: ${anomaliasAlta}`);

    // ===== TESTE 7: Query complexa - anomalias por unidade =====
    console.log('\n📋 TESTE 7: Anomalias agrupadas por unidade');

    const anomaliasPorEquipamento = await prisma.anomalias.findMany({
      where: {
        equipamento: {
          unidade_id: equipamento.unidade_id,
        },
        deleted_at: null,
      },
      include: {
        equipamento: {
          select: {
            nome: true,
            unidade: {
              select: {
                nome: true,
              }
            }
          }
        }
      },
      take: 5,
    });

    console.log(`✅ Anomalias na unidade "${equipamento.unidade.nome}": ${anomaliasPorEquipamento.length}`);
    anomaliasPorEquipamento.forEach(a => {
      console.log(`   - Equipamento: ${a.equipamento.nome}`);
    });

    // ===== TESTE 8: Criar anexo para anomalia =====
    console.log('\n📋 TESTE 8: Criar anexo para anomalia');

    const anexo = await prisma.anexos_anomalias.create({
      data: {
        id: createId(),
        anomalia_id: novaAnomalia.id,
        nome: 'foto-anomalia-teste.jpg',
        nome_original: 'foto-original.jpg',
        tipo: 'foto',
        mime_type: 'image/jpeg',
        caminho_s3: '/uploads/anomalias/teste.jpg',
        tamanho: 1024000,
        usuario_id: equipamento.unidade.planta.proprietario_id,
      }
    });

    console.log(`✅ Anexo criado: ${anexo.nome}`);
    console.log(`   Tipo: ${anexo.tipo}`);

    // ===== LIMPEZA: Remover dados de teste =====
    console.log('\n🧹 Limpando dados de teste...');

    await prisma.anexos_anomalias.delete({
      where: { id: anexo.id }
    });

    await prisma.historico_anomalias.delete({
      where: { id: historico.id }
    });

    await prisma.anomalias.delete({
      where: { id: novaAnomalia.id }
    });

    console.log('✅ Dados de teste removidos');

    // ===== RESUMO FINAL =====
    console.log('\n' + '='.repeat(70));
    console.log('✅ TODOS OS TESTES DE ANOMALIAS PASSARAM!');
    console.log('='.repeat(70));
    console.log('\n📊 VALIDAÇÕES:');
    console.log('  ✅ Criação de anomalia com todos os campos');
    console.log('  ✅ Relacionamento com equipamento → unidade → planta');
    console.log('  ✅ Atualização de status');
    console.log('  ✅ Histórico de mudanças');
    console.log('  ✅ Filtros por planta, status e prioridade');
    console.log('  ✅ Query complexa por unidade');
    console.log('  ✅ Anexos de anomalias');
    console.log('  ✅ Limpeza de dados');

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testarFluxoAnomalias().catch(console.error);
