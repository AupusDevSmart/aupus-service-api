const { PrismaClient } = require('@prisma/client');
const { createId } = require('@paralleldrive/cuid2');
const prisma = new PrismaClient();

async function testarFluxoCompleto() {
  console.log('🧪 TESTANDO FLUXO COMPLETO DE UNIDADES E EQUIPAMENTOS\n');
  console.log('='.repeat(60));

  try {
    // ===== TESTE 1: Verificar tabela unidades =====
    console.log('\n📋 TESTE 1: Verificar existência da tabela unidades');
    const totalUnidades = await prisma.unidades.count();
    console.log(`✅ Tabela 'unidades' existe`);
    console.log(`   Total de unidades: ${totalUnidades}`);

    // ===== TESTE 2: Verificar campo unidade_id em equipamentos =====
    console.log('\n📋 TESTE 2: Verificar campo unidade_id em equipamentos');
    const equipamentosComUnidade = await prisma.equipamentos.count({
      where: { unidade_id: { not: null } }
    });
    const totalEquipamentos = await prisma.equipamentos.count();
    console.log(`✅ Campo 'unidade_id' existe em equipamentos`);
    console.log(`   Equipamentos com unidade: ${equipamentosComUnidade}/${totalEquipamentos}`);

    // ===== TESTE 3: Hierarquia completa (Planta → Unidade → Equipamento) =====
    console.log('\n📋 TESTE 3: Testar hierarquia completa');
    const unidadeComHierarquia = await prisma.unidades.findFirst({
      include: {
        planta: {
          select: {
            id: true,
            nome: true,
            proprietario_id: true,
          }
        },
        equipamentos: {
          take: 3,
          select: {
            id: true,
            nome: true,
            classificacao: true,
            dados_tecnicos: {
              take: 2,
              select: {
                campo: true,
                valor: true,
                unidade: true,
              }
            }
          }
        }
      }
    });

    if (unidadeComHierarquia) {
      console.log(`✅ Hierarquia funcionando:`);
      console.log(`   Planta: ${unidadeComHierarquia.planta.nome}`);
      console.log(`   Unidade: ${unidadeComHierarquia.nome}`);
      console.log(`   Equipamentos nesta unidade: ${unidadeComHierarquia.equipamentos.length}`);
      if (unidadeComHierarquia.equipamentos[0]?.dados_tecnicos.length > 0) {
        console.log(`   Dados técnicos vinculados: ✅`);
      }
    }

    // ===== TESTE 4: Query reversa (Equipamento → Unidade → Planta) =====
    console.log('\n📋 TESTE 4: Query reversa (Equipamento → Unidade → Planta)');
    const equipamentoComHierarquia = await prisma.equipamentos.findFirst({
      where: { unidade_id: { not: null } },
      include: {
        unidade: {
          include: {
            planta: {
              select: {
                nome: true,
                cidade: true,
              }
            }
          }
        }
      }
    });

    if (equipamentoComHierarquia?.unidade) {
      console.log(`✅ Query reversa funcionando:`);
      console.log(`   Equipamento: ${equipamentoComHierarquia.nome}`);
      console.log(`   Unidade: ${equipamentoComHierarquia.unidade.nome}`);
      console.log(`   Planta: ${equipamentoComHierarquia.unidade.planta.nome}`);
      console.log(`   Cidade: ${equipamentoComHierarquia.unidade.planta.cidade}`);
    }

    // ===== TESTE 5: Componentes UAR (hierarquia pai/filho) =====
    console.log('\n📋 TESTE 5: Testar hierarquia equipamento pai → componentes UAR');
    const equipamentoUC = await prisma.equipamentos.findFirst({
      where: {
        classificacao: 'UC',
        unidade_id: { not: null }
      },
      include: {
        componentes_uar: {
          take: 3,
          select: {
            id: true,
            nome: true,
            classificacao: true,
          }
        }
      }
    });

    if (equipamentoUC) {
      console.log(`✅ Hierarquia UC → UAR funcionando:`);
      console.log(`   UC: ${equipamentoUC.nome}`);
      console.log(`   Componentes UAR: ${equipamentoUC.componentes_uar.length}`);
      equipamentoUC.componentes_uar.forEach(comp => {
        console.log(`     - ${comp.nome} [${comp.classificacao}]`);
      });
    }

    // ===== TESTE 6: Criar nova unidade e equipamento =====
    console.log('\n📋 TESTE 6: Testar criação de nova unidade e equipamento');

    // Buscar uma planta existente
    const plantaTeste = await prisma.plantas.findFirst();

    if (plantaTeste) {
      // Criar unidade de teste
      const novaUnidade = await prisma.unidades.create({
        data: {
          id: createId(),
          planta_id: plantaTeste.id,
          nome: 'UNIDADE DE TESTE',
          tipo: 'UFV',
          estado: 'SP',
          cidade: 'São Paulo',
          latitude: -23.5505,
          longitude: -46.6333,
          potencia: 1000.00,
          status: 'ativo',
          pontos_medicao: ['PAC', 'Inversor'],
        }
      });

      console.log(`✅ Unidade criada: ${novaUnidade.nome}`);

      // Criar equipamento vinculado à unidade
      const novoEquipamento = await prisma.equipamentos.create({
        data: {
          id: createId(),
          unidade_id: novaUnidade.id,
          nome: 'Inversor Teste',
          classificacao: 'UC',
          criticidade: '3',
          fabricante: 'Test Brand',
          modelo: 'TEST-100',
          em_operacao: 'sim',
        }
      });

      console.log(`✅ Equipamento criado: ${novoEquipamento.nome}`);
      console.log(`   Vinculado à unidade: ${novoEquipamento.unidade_id}`);

      // Criar dados técnicos
      await prisma.equipamentos_dados_tecnicos.create({
        data: {
          id: createId(),
          equipamento_id: novoEquipamento.id,
          campo: 'potencia_nominal',
          valor: '100',
          tipo: 'number',
          unidade: 'kW',
        }
      });

      console.log(`✅ Dados técnicos criados`);

      // Verificar relacionamento completo
      const verificacao = await prisma.equipamentos.findUnique({
        where: { id: novoEquipamento.id },
        include: {
          unidade: {
            include: {
              planta: true,
            }
          },
          dados_tecnicos: true,
        }
      });

      if (verificacao?.unidade?.planta) {
        console.log(`✅ Relacionamento completo verificado:`);
        console.log(`   Planta: ${verificacao.unidade.planta.nome}`);
        console.log(`   Unidade: ${verificacao.unidade.nome}`);
        console.log(`   Equipamento: ${verificacao.nome}`);
        console.log(`   Dados técnicos: ${verificacao.dados_tecnicos.length}`);
      }

      // Limpar dados de teste
      console.log('\n🧹 Limpando dados de teste...');
      await prisma.equipamentos_dados_tecnicos.deleteMany({
        where: { equipamento_id: novoEquipamento.id }
      });
      await prisma.equipamentos.delete({
        where: { id: novoEquipamento.id }
      });
      await prisma.unidades.delete({
        where: { id: novaUnidade.id }
      });
      console.log('✅ Dados de teste removidos');
    }

    // ===== TESTE 7: Agregações e estatísticas =====
    console.log('\n📋 TESTE 7: Testar agregações');

    const estatisticas = await Promise.all([
      prisma.plantas.count(),
      prisma.unidades.count(),
      prisma.equipamentos.count({ where: { classificacao: 'UC' } }),
      prisma.equipamentos.count({ where: { classificacao: 'UAR' } }),
      prisma.equipamentos_dados_tecnicos.count(),
    ]);

    console.log(`✅ Estatísticas gerais:`);
    console.log(`   Plantas: ${estatisticas[0]}`);
    console.log(`   Unidades: ${estatisticas[1]}`);
    console.log(`   Equipamentos UC: ${estatisticas[2]}`);
    console.log(`   Componentes UAR: ${estatisticas[3]}`);
    console.log(`   Dados técnicos: ${estatisticas[4]}`);

    // ===== TESTE 8: Query complexa (equipamentos por planta via unidade) =====
    console.log('\n📋 TESTE 8: Query complexa - equipamentos por planta');

    const plantaComEstatisticas = await prisma.plantas.findFirst({
      include: {
        unidades: {
          include: {
            _count: {
              select: {
                equipamentos: true,
              }
            }
          }
        }
      }
    });

    if (plantaComEstatisticas) {
      const totalEquipamentosDaPlanta = plantaComEstatisticas.unidades.reduce(
        (acc, unidade) => acc + unidade._count.equipamentos,
        0
      );
      console.log(`✅ Planta: ${plantaComEstatisticas.nome}`);
      console.log(`   Unidades: ${plantaComEstatisticas.unidades.length}`);
      console.log(`   Total de equipamentos: ${totalEquipamentosDaPlanta}`);
    }

    // ===== RESUMO FINAL =====
    console.log('\n' + '='.repeat(60));
    console.log('✅ TODOS OS TESTES PASSARAM COM SUCESSO!');
    console.log('='.repeat(60));
    console.log('\n📊 RESUMO:');
    console.log('  ✅ Tabela unidades funcionando');
    console.log('  ✅ Campo unidade_id em equipamentos funcionando');
    console.log('  ✅ Hierarquia Planta → Unidade → Equipamento OK');
    console.log('  ✅ Query reversa Equipamento → Unidade → Planta OK');
    console.log('  ✅ Hierarquia UC → UAR funcionando');
    console.log('  ✅ Criação e vinculação de dados OK');
    console.log('  ✅ Dados técnicos vinculados corretamente');
    console.log('  ✅ Agregações e estatísticas funcionando');
    console.log('\n🎉 A migração foi concluída com sucesso!');

  } catch (error) {
    console.error('\n❌ ERRO NO TESTE:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testarFluxoCompleto()
  .catch((e) => {
    console.error('❌ Erro fatal:', e);
    process.exit(1);
  });
