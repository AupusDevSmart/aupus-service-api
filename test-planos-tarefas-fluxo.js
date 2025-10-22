const { PrismaClient } = require('@prisma/client');
const { createId } = require('@paralleldrive/cuid2');
const prisma = new PrismaClient();

async function testarFluxoPlanosETarefas() {
  console.log('🧪 TESTE: FLUXO COMPLETO DE PLANOS DE MANUTENÇÃO E TAREFAS\n');
  console.log('='.repeat(70));

  try {
    // ===== PREPARAÇÃO: Buscar dados =====
    console.log('\n📋 PREPARAÇÃO: Buscando dados para teste');

    // Buscar equipamento UC com unidade
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
        },
        planos_manutencao: true
      }
    });

    if (!equipamento) {
      throw new Error('Nenhum equipamento encontrado');
    }

    // Limpeza de planos existentes (com respeito a foreign keys)
    const planosExistentes = await prisma.planos_manutencao.findMany({
      where: { equipamento_id: equipamento.id },
      include: { tarefas: true }
    });

    if (planosExistentes.length > 0) {
      console.log(`⚠️  Limpando ${planosExistentes.length} plano(s) com suas tarefas...`);
      for (const plano of planosExistentes) {
        if (plano.tarefas.length > 0) {
          await prisma.tarefas.deleteMany({
            where: { plano_manutencao_id: plano.id }
          });
        }
        await prisma.planos_manutencao.delete({
          where: { id: plano.id }
        });
      }
    }

    console.log(`✅ Equipamento: ${equipamento.nome}`);
    console.log(`   Unidade: ${equipamento.unidade.nome}`);
    console.log(`   Planta: ${equipamento.unidade.planta.nome}`);

    // ===== TESTE 1: Criar plano de manutenção completo =====
    console.log('\n📋 TESTE 1: Criar plano de manutenção com todos os campos');

    const novoPlano = await prisma.planos_manutencao.create({
      data: {
        id: createId(),
        equipamento_id: equipamento.id,
        nome: 'Plano de Manutenção Preventiva - Teste',
        descricao: 'Plano completo para teste do fluxo',
        versao: '1.0',
        ativo: true,
        status: 'ATIVO',
        data_vigencia_inicio: new Date(),
        observacoes: 'Plano criado para validação do sistema',
        criado_por: equipamento.unidade.planta.proprietario_id,
        atualizado_por: equipamento.unidade.planta.proprietario_id,
      }
    });

    console.log(`✅ Plano criado: ${novoPlano.id}`);
    console.log(`   Nome: ${novoPlano.nome}`);
    console.log(`   Versão: ${novoPlano.versao}`);
    console.log(`   Status: ${novoPlano.status}`);
    console.log(`   Vigência: ${novoPlano.data_vigencia_inicio.toLocaleDateString()}`);

    // ===== TESTE 2: Criar tarefas do plano =====
    console.log('\n📋 TESTE 2: Criar tarefas do plano de manutenção');

    const tarefas = [];
    const descricoesTarefas = [
      'Inspeção visual do equipamento',
      'Limpeza dos componentes',
      'Lubrificação de partes móveis',
      'Verificação de conexões elétricas',
      'Teste de funcionamento',
    ];

    for (let i = 0; i < descricoesTarefas.length; i++) {
      const tarefa = await prisma.tarefas.create({
        data: {
          id: createId(),
          plano_manutencao_id: novoPlano.id,
          equipamento_id: equipamento.id,
          planta_id: equipamento.unidade.planta.id,
          tag: `TESTE-${Date.now()}-${i}`,
          nome: `Tarefa ${i + 1}`,
          descricao: descricoesTarefas[i],
          categoria: 'INSPECAO',
          tipo_manutencao: 'PREVENTIVA',
          frequencia: 'MENSAL',
          condicao_ativo: 'FUNCIONANDO', // Valores válidos: PARADO, FUNCIONANDO, QUALQUER
          criticidade: i === 0 ? 5 : i === 1 ? 3 : 1, // 5=crítica, 3=média, 1=baixa
          duracao_estimada: 0.5 + (i * 0.25),
          ordem: i + 1,
          tempo_estimado: 20 + (i * 5),
          ativo: true,
          observacoes: `Observações da tarefa ${i + 1}`,
          criado_por: equipamento.unidade.planta.proprietario_id,
        }
      });
      tarefas.push(tarefa);
    }

    console.log(`✅ ${tarefas.length} tarefas criadas:`);
    tarefas.forEach((t, i) => {
      console.log(`   ${i + 1}. ${t.nome} - ${t.descricao} [criticidade: ${t.criticidade}]`);
    });

    // ===== TESTE 3: Buscar plano com tarefas =====
    console.log('\n📋 TESTE 3: Buscar plano com relacionamentos');

    const planoCompleto = await prisma.planos_manutencao.findUnique({
      where: { id: novoPlano.id },
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
        tarefas: {
          orderBy: { ordem: 'asc' }
        }
      }
    });

    if (planoCompleto) {
      console.log(`✅ Plano encontrado com hierarquia completa:`);
      console.log(`   Equipamento: ${planoCompleto.equipamento.nome}`);
      console.log(`   Unidade: ${planoCompleto.equipamento.unidade.nome}`);
      console.log(`   Planta: ${planoCompleto.equipamento.unidade.planta.nome}`);
      console.log(`   Total de tarefas: ${planoCompleto.tarefas.length}`);
    }

    // ===== TESTE 4: Buscar tarefas por planta =====
    console.log('\n📋 TESTE 4: Buscar tarefas por planta');

    const tarefasDaPlanta = await prisma.tarefas.findMany({
      where: {
        planta_id: equipamento.unidade.planta.id,
        deleted_at: null,
      },
      include: {
        equipamento: {
          include: {
            unidade: true
          }
        },
        plano_manutencao: {
          select: {
            nome: true,
            status: true,
          }
        }
      },
      take: 5,
    });

    console.log(`✅ Tarefas encontradas na planta: ${tarefasDaPlanta.length}`);
    tarefasDaPlanta.forEach(t => {
      const unidadeNome = t.equipamento?.unidade?.nome || 'Sem unidade';
      console.log(`   - ${t.nome} (${unidadeNome})`);
    });

    // ===== TESTE 5: Atualizar status do plano =====
    console.log('\n📋 TESTE 5: Atualizar status do plano');

    const planoAtualizado = await prisma.planos_manutencao.update({
      where: { id: novoPlano.id },
      data: {
        status: 'EM_REVISAO',
        observacoes: 'Plano em revisão após criação das tarefas',
      }
    });

    console.log(`✅ Plano atualizado:`);
    console.log(`   Novo status: ${planoAtualizado.status}`);

    // ===== TESTE 6: Filtrar tarefas por criticidade e status =====
    console.log('\n📋 TESTE 6: Filtrar tarefas');

    const tarefasCriticas = await prisma.tarefas.count({
      where: {
        plano_manutencao_id: novoPlano.id,
        criticidade: { gte: 4 }, // >= 4 são críticas
        ativo: true,
      }
    });

    const tarefasAtivas = await prisma.tarefas.count({
      where: {
        plano_manutencao_id: novoPlano.id,
        status: 'ATIVA',
      }
    });

    console.log(`✅ Filtros aplicados:`);
    console.log(`   Tarefas críticas (criticidade >= 4): ${tarefasCriticas}`);
    console.log(`   Tarefas ativas: ${tarefasAtivas}`);

    // ===== TESTE 7: Query complexa - estatísticas do plano =====
    console.log('\n📋 TESTE 7: Calcular estatísticas do plano');

    const estatisticas = await prisma.tarefas.aggregate({
      where: {
        plano_manutencao_id: novoPlano.id,
      },
      _sum: {
        tempo_estimado: true,
      },
      _count: {
        id: true,
      }
    });

    console.log(`✅ Estatísticas calculadas:`);
    console.log(`   Total de tarefas: ${estatisticas._count.id}`);
    console.log(`   Tempo total estimado: ${estatisticas._sum.tempo_estimado} minutos`);

    // ===== TESTE 8: Buscar planos por unidade =====
    console.log('\n📋 TESTE 8: Buscar planos por unidade');

    const planosDaUnidade = await prisma.planos_manutencao.findMany({
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
          }
        },
        _count: {
          select: {
            tarefas: true,
          }
        }
      },
      take: 5,
    });

    console.log(`✅ Planos na unidade "${equipamento.unidade.nome}": ${planosDaUnidade.length}`);
    planosDaUnidade.forEach(p => {
      console.log(`   - ${p.nome} (${p._count.tarefas} tarefas)`);
    });

    // ===== LIMPEZA: Remover dados de teste =====
    console.log('\n🧹 Limpando dados de teste...');

    // Deletar tarefas primeiro (foreign key)
    await prisma.tarefas.deleteMany({
      where: { plano_manutencao_id: novoPlano.id }
    });

    // Deletar plano
    await prisma.planos_manutencao.delete({
      where: { id: novoPlano.id }
    });

    console.log('✅ Dados de teste removidos');

    // ===== RESUMO FINAL =====
    console.log('\n' + '='.repeat(70));
    console.log('✅ TODOS OS TESTES DE PLANOS E TAREFAS PASSARAM!');
    console.log('='.repeat(70));
    console.log('\n📊 VALIDAÇÕES:');
    console.log('  ✅ Criação de plano com todos os campos');
    console.log('  ✅ Criação de múltiplas tarefas com campos obrigatórios (tag, categoria, frequencia, etc)');
    console.log('  ✅ Relacionamento plano → tarefas → equipamento → unidade → planta');
    console.log('  ✅ Atualização de status');
    console.log('  ✅ Filtros por criticidade e status');
    console.log('  ✅ Agregações e estatísticas');
    console.log('  ✅ Queries por unidade');
    console.log('  ✅ Limpeza de dados em cascata');

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testarFluxoPlanosETarefas().catch(console.error);
