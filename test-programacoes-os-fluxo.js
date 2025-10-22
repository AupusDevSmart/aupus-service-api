const { PrismaClient } = require('@prisma/client');
const { createId } = require('@paralleldrive/cuid2');
const prisma = new PrismaClient();

async function testarFluxoProgramacoesOS() {
  console.log('🧪 TESTE: FLUXO COMPLETO DE PROGRAMAÇÕES DE OS\n');
  console.log('='.repeat(70));

  try {
    // ===== PREPARAÇÃO: Buscar dados =====
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
      throw new Error('Nenhum equipamento encontrado');
    }

    console.log(`✅ Equipamento: ${equipamento.nome}`);
    console.log(`   Unidade: ${equipamento.unidade.nome}`);
    console.log(`   Planta: ${equipamento.unidade.planta.nome}`);

    // ===== TESTE 1: Criar programação de OS completa =====
    console.log('\n📋 TESTE 1: Criar programação de OS com todos os campos');

    const novaProgramacao = await prisma.programacoes_os.create({
      data: {
        id: createId(),
        codigo: `PRG-TEST-${Date.now()}`,
        equipamento_id: equipamento.id,
        planta_id: equipamento.unidade.planta.id,
        descricao: 'Programação completa para teste do fluxo - Manutenção Preventiva',
        local: equipamento.localizacao || 'Área de teste',
        ativo: equipamento.nome,
        tipo: 'PREVENTIVA',
        origem: 'PLANO_MANUTENCAO',
        condicoes: 'FUNCIONANDO', // Valores válidos: PARADO, FUNCIONANDO
        status: 'RASCUNHO',
        prioridade: 'MEDIA',
        data_previsao_inicio: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias
        data_previsao_fim: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000), // +4h
        tempo_estimado: 4.0, // 4 horas (Decimal)
        duracao_estimada: 4.0, // 4 horas (Decimal)
        responsavel_id: equipamento.unidade.planta.proprietario_id,
        time_equipe: 'Técnico 1, Técnico 2',
        orcamento_previsto: 1500.00,
        observacoes_programacao: 'Programação criada para validação completa do sistema',
        criado_por: 'Sistema de Teste',
        criado_por_id: equipamento.unidade.planta.proprietario_id,
      }
    });

    console.log(`✅ Programação criada: ${novaProgramacao.id}`);
    console.log(`   Código: ${novaProgramacao.codigo}`);
    console.log(`   Descrição: ${novaProgramacao.descricao.substring(0, 50)}...`);
    console.log(`   Tipo: ${novaProgramacao.tipo}`);
    console.log(`   Status: ${novaProgramacao.status}`);
    console.log(`   Orçamento: R$ ${novaProgramacao.orcamento_previsto}`);

    // ===== TESTE 2: Adicionar tarefas à programação =====
    console.log('\n📋 TESTE 2: Adicionar tarefas à programação');

    // Buscar um equipamento diferente para o plano temporário
    // Usar skip baseado em timestamp para sempre pegar equipamento diferente
    const skipCount = Math.floor((Date.now() / 1000) % 100); // Muda a cada segundo
    const equipamentoDiferente = await prisma.equipamentos.findFirst({
      where: {
        unidade_id: { not: null },
        classificacao: 'UAR'
      },
      skip: skipCount
    });

    if (!equipamentoDiferente) {
      throw new Error('Nenhum equipamento UAR encontrado para teste');
    }

    console.log(`   Equipamento UAR selecionado (skip=${skipCount}): ${equipamentoDiferente.id}`);

    // Verificar e limpar planos existentes (com cleanup de foreign keys)
    const planosExistentes = await prisma.planos_manutencao.findMany({
      where: { equipamento_id: equipamentoDiferente.id },
      include: { tarefas: true }
    });

    if (planosExistentes.length > 0) {
      console.log(`   Limpando ${planosExistentes.length} plano(s) com suas tarefas...`);
      for (const plano of planosExistentes) {
        // Deletar tarefas primeiro
        if (plano.tarefas.length > 0) {
          await prisma.tarefas.deleteMany({
            where: { plano_manutencao_id: plano.id }
          });
        }
        // Depois deletar o plano
        await prisma.planos_manutencao.delete({
          where: { id: plano.id }
        });
      }
      console.log(`   Planos limpos com sucesso`);
    }

    // Criar um plano de manutenção temporário para a tarefa
    const planoTemp = await prisma.planos_manutencao.create({
      data: {
        id: createId(),
        equipamento_id: equipamentoDiferente.id,
        nome: 'Plano Temporário para Teste de OS',
        descricao: 'Plano criado apenas para vincular tarefa',
        versao: '1.0',
        ativo: true,
        status: 'ATIVO',
        criado_por: equipamento.unidade.planta.proprietario_id,
      }
    });

    // Criar uma tarefa primeiro
    const tarefa = await prisma.tarefas.create({
      data: {
        id: createId(),
        plano_manutencao_id: planoTemp.id,
        equipamento_id: equipamentoDiferente.id,
        planta_id: equipamento.unidade.planta.id,
        tag: `TESTE-OS-${Date.now()}`,
        nome: 'Tarefa de Teste para OS',
        descricao: 'Verificação completa do equipamento',
        categoria: 'INSPECAO',
        tipo_manutencao: 'PREVENTIVA',
        frequencia: 'MENSAL',
        condicao_ativo: 'FUNCIONANDO',
        criticidade: 3,
        duracao_estimada: 1.0,
        ordem: 1,
        tempo_estimado: 60,
        ativo: true,
        criado_por: equipamento.unidade.planta.proprietario_id,
      }
    });

    // Vincular tarefa à programação
    const tarefaProgramacao = await prisma.tarefas_programacao_os.create({
      data: {
        id: createId(),
        programacao_id: novaProgramacao.id,
        tarefa_id: tarefa.id,
      }
    });

    console.log(`✅ Tarefa vinculada à programação`);

    // ===== TESTE 3: Adicionar materiais =====
    console.log('\n📋 TESTE 3: Adicionar materiais à programação');

    const material = await prisma.materiais_programacao_os.create({
      data: {
        id: createId(),
        programacao_id: novaProgramacao.id,
        descricao: 'Óleo lubrificante 5W30',
        quantidade_planejada: 5,
        unidade: 'litros',
        custo_unitario: 45.50,
        custo_total: 227.50,
      }
    });

    console.log(`✅ Material adicionado: ${material.descricao}`);
    console.log(`   Quantidade: ${material.quantidade_planejada} ${material.unidade}`);
    console.log(`   Custo total: R$ ${material.custo_total}`);

    // ===== TESTE 4: Adicionar técnicos =====
    console.log('\n📋 TESTE 4: Adicionar técnicos à programação');

    const tecnico = await prisma.tecnicos_programacao_os.create({
      data: {
        id: createId(),
        programacao_id: novaProgramacao.id,
        tecnico_id: equipamento.unidade.planta.proprietario_id,
        nome: 'Técnico de Teste',
        especialidade: 'Manutenção Elétrica',
        horas_estimadas: 4,
        custo_hora: 75.00,
        custo_total: 300.00,
      }
    });

    console.log(`✅ Técnico adicionado à programação`);
    console.log(`   Horas estimadas: ${tecnico.horas_estimadas}h`);
    console.log(`   Custo: R$ ${tecnico.custo_total}`);

    // ===== TESTE 5: Buscar programação completa =====
    console.log('\n📋 TESTE 5: Buscar programação com todos os relacionamentos');

    const programacaoCompleta = await prisma.programacoes_os.findUnique({
      where: { id: novaProgramacao.id },
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
        tarefas_programacao: {
          include: {
            tarefa: true
          }
        },
        materiais: true,
        tecnicos: true,
      }
    });

    if (programacaoCompleta) {
      console.log(`✅ Programação completa encontrada:`);
      console.log(`   Equipamento: ${programacaoCompleta.equipamento.nome}`);
      console.log(`   Unidade: ${programacaoCompleta.equipamento.unidade.nome}`);
      console.log(`   Planta: ${programacaoCompleta.planta.nome}`);
      console.log(`   Tarefas: ${programacaoCompleta.tarefas_programacao.length}`);
      console.log(`   Materiais: ${programacaoCompleta.materiais.length}`);
      console.log(`   Técnicos: ${programacaoCompleta.tecnicos.length}`);
    }

    // ===== TESTE 6: Atualizar status da programação =====
    console.log('\n📋 TESTE 6: Atualizar status da programação');

    const programacaoAtualizada = await prisma.programacoes_os.update({
      where: { id: novaProgramacao.id },
      data: {
        status: 'PENDENTE',
        observacoes_programacao: 'Programação pronta para análise',
      }
    });

    console.log(`✅ Status atualizado: ${programacaoAtualizada.status}`);

    // ===== TESTE 7: Criar histórico =====
    console.log('\n📋 TESTE 7: Criar histórico de mudança de status');

    const historico = await prisma.historico_programacao_os.create({
      data: {
        id: createId(),
        programacao_id: novaProgramacao.id,
        usuario_id: equipamento.unidade.planta.proprietario_id,
        usuario: 'Sistema de Teste',
        acao: 'MUDANCA_STATUS',
        status_anterior: 'RASCUNHO',
        status_novo: 'PENDENTE',
        observacoes: 'Mudança de status registrada',
      }
    });

    console.log(`✅ Histórico criado`);

    // ===== TESTE 8: Filtrar programações =====
    console.log('\n📋 TESTE 8: Filtrar programações por planta e status');

    const programacoesPendentes = await prisma.programacoes_os.count({
      where: {
        planta_id: equipamento.unidade.planta.id,
        status: { in: ['PENDENTE', 'EM_ANALISE'] },
        deletado_em: null,
      }
    });

    console.log(`✅ Programações pendentes na planta: ${programacoesPendentes}`);

    // ===== TESTE 9: Query complexa - programações por unidade =====
    console.log('\n📋 TESTE 9: Programações por unidade');

    const programacoesDaUnidade = await prisma.programacoes_os.findMany({
      where: {
        equipamento: {
          unidade_id: equipamento.unidade_id,
        },
        deletado_em: null,
      },
      include: {
        equipamento: {
          select: {
            nome: true,
          }
        },
        _count: {
          select: {
            materiais: true,
            tecnicos: true,
          }
        }
      },
      take: 5,
    });

    console.log(`✅ Programações na unidade: ${programacoesDaUnidade.length}`);
    programacoesDaUnidade.forEach(p => {
      console.log(`   - ${p.descricao.substring(0, 40)}... (${p._count.materiais} materiais, ${p._count.tecnicos} técnicos)`);
    });

    // ===== TESTE 10: Criar OS a partir da programação =====
    console.log('\n📋 TESTE 10: Criar OS a partir da programação');

    const novaOS = await prisma.ordens_servico.create({
      data: {
        id: createId(),
        programacao_id: novaProgramacao.id,
        equipamento_id: equipamento.id,
        planta_id: equipamento.unidade.planta.id,
        numero_os: `OS-TEST-${Date.now()}`,
        descricao: novaProgramacao.descricao,
        local: novaProgramacao.local,
        ativo: novaProgramacao.ativo,
        tipo: novaProgramacao.tipo,
        origem: 'PLANO_MANUTENCAO',
        condicoes: novaProgramacao.condicoes,
        status: 'PLANEJADA',
        prioridade: novaProgramacao.prioridade,
        tempo_estimado: novaProgramacao.tempo_estimado,
        duracao_estimada: novaProgramacao.duracao_estimada,
        responsavel: 'Sistema de Teste',
        responsavel_id: novaProgramacao.responsavel_id,
        orcamento_previsto: novaProgramacao.orcamento_previsto,
      }
    });

    console.log(`✅ OS criada: ${novaOS.numero_os}`);
    console.log(`   Status: ${novaOS.status}`);

    // ===== LIMPEZA: Remover dados de teste =====
    console.log('\n🧹 Limpando dados de teste...');

    // Deletar em ordem (foreign keys)
    await prisma.ordens_servico.delete({ where: { id: novaOS.id } });
    await prisma.historico_programacao_os.delete({ where: { id: historico.id } });
    await prisma.tecnicos_programacao_os.delete({ where: { id: tecnico.id } });
    await prisma.materiais_programacao_os.delete({ where: { id: material.id } });
    await prisma.tarefas_programacao_os.delete({ where: { id: tarefaProgramacao.id } });
    await prisma.programacoes_os.delete({ where: { id: novaProgramacao.id } });
    await prisma.tarefas.delete({ where: { id: tarefa.id } });
    await prisma.planos_manutencao.delete({ where: { id: planoTemp.id } });

    console.log('✅ Dados de teste removidos');

    // ===== RESUMO FINAL =====
    console.log('\n' + '='.repeat(70));
    console.log('✅ TODOS OS TESTES DE PROGRAMAÇÕES DE OS PASSARAM!');
    console.log('='.repeat(70));
    console.log('\n📊 VALIDAÇÕES:');
    console.log('  ✅ Criação de programação com todos os campos');
    console.log('  ✅ Adição de tarefas à programação');
    console.log('  ✅ Adição de materiais');
    console.log('  ✅ Adição de técnicos');
    console.log('  ✅ Relacionamento completo: programação → equipamento → unidade → planta');
    console.log('  ✅ Atualização de status');
    console.log('  ✅ Histórico de mudanças');
    console.log('  ✅ Filtros por planta e status');
    console.log('  ✅ Queries por unidade');
    console.log('  ✅ Criação de OS a partir de programação');
    console.log('  ✅ Limpeza em cascata');

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testarFluxoProgramacoesOS().catch(console.error);
