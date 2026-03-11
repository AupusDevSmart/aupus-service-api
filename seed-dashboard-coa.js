// Script de seed para popular o Dashboard COA com dados realistas
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ===== IDS REAIS DO BANCO =====
const ADMIN_ID = '01K2CPBYE07B3HWW0CZHHB3ZCR'; // Administrador
const PLANTA_ID = 'cmkfrzdae00fl2f5wui3mvx9l'; // Aupus Energia

// ===== CONFIGURAÇÕES =====
const CONFIG = {
  limparAnomalias: true,  // Deletar anomalias antigas?
  limparDadosMQTT: false, // Deletar dados MQTT antigos? (pode ser pesado)
  criarAnomalias: 20,     // Quantidade de anomalias a criar
  criarLeituras: 100,     // Quantidade de leituras MQTT a criar
};

// ===== FUNÇÕES AUXILIARES =====

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomFloat(min, max, decimals = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function getHorasAtras(horas) {
  const date = new Date();
  date.setHours(date.getHours() - horas);
  return date;
}

// ===== SEED PRINCIPAL =====

async function seedDashboardCOA() {
  console.log('\n🌱 INICIANDO SEED DO DASHBOARD COA\n');
  console.log('='.repeat(80));

  try {
    // PASSO 1: LIMPEZA (SE CONFIGURADO)
    if (CONFIG.limparAnomalias) {
      console.log('\n🗑️  LIMPEZA: Deletando anomalias antigas...');
      const deleted = await prisma.anomalias.updateMany({
        where: { deleted_at: null },
        data: { deleted_at: new Date() },
      });
      console.log(`   ✅ ${deleted.count} anomalias deletadas (soft delete)`);
    }

    if (CONFIG.limparDadosMQTT) {
      console.log('\n🗑️  LIMPEZA: Deletando dados MQTT antigos (últimos 7 dias)...');
      const seteDiasAtras = new Date();
      seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);

      const deleted = await prisma.equipamentos_dados.deleteMany({
        where: {
          timestamp_dados: {
            lt: seteDiasAtras,
          },
        },
      });
      console.log(`   ✅ ${deleted.count} leituras deletadas`);
    }

    // PASSO 2: BUSCAR UNIDADES DA PLANTA
    console.log('\n📍 BUSCANDO UNIDADES DA PLANTA...');

    const unidades = await prisma.unidades.findMany({
      where: {
        deleted_at: null,
        planta_id: PLANTA_ID,
      },
      select: {
        id: true,
        nome: true,
        tipo: true,
        equipamentos: {
          where: { deleted_at: null },
          select: {
            id: true,
            nome: true,
            tipo_equipamento: true,
          },
        },
      },
    });

    console.log(`   ✅ ${unidades.length} unidades encontradas`);

    if (unidades.length === 0) {
      console.log('\n   ⚠️  NENHUMA UNIDADE ENCONTRADA NA PLANTA!');
      console.log('   Criando unidades de exemplo...\n');

      // Criar unidades de exemplo
      const unidadeUFV = await prisma.unidades.create({
        data: {
          nome: 'UFV Dashboard Test',
          tipo: 'UFV',
          planta_id: PLANTA_ID,
          proprietario_id: ADMIN_ID,
          cidade: 'Goiânia',
          estado: 'GO',
          latitude: -16.6869,
          longitude: -49.2648,
          potencia: 100.0,
        },
      });

      const unidadeCarga = await prisma.unidades.create({
        data: {
          nome: 'Carga Dashboard Test',
          tipo: 'Carga',
          planta_id: PLANTA_ID,
          proprietario_id: ADMIN_ID,
          cidade: 'Goiânia',
          estado: 'GO',
          latitude: -16.6969,
          longitude: -49.2748,
          potencia: 150.0,
        },
      });

      console.log(`   ✅ Unidades criadas: ${unidadeUFV.nome}, ${unidadeCarga.nome}`);

      // Recarregar unidades
      unidades.push(...await prisma.unidades.findMany({
        where: {
          deleted_at: null,
          id: { in: [unidadeUFV.id, unidadeCarga.id] },
        },
        select: {
          id: true,
          nome: true,
          tipo: true,
          equipamentos: {
            where: { deleted_at: null },
            select: {
              id: true,
              nome: true,
              tipo_equipamento: true,
            },
          },
        },
      }));
    }

    unidades.forEach(u => {
      console.log(`   - ${u.nome} (${u.tipo}) - ${u.equipamentos.length} equipamentos`);
    });

    // PASSO 3: BUSCAR EQUIPAMENTOS
    console.log('\n⚙️  BUSCANDO EQUIPAMENTOS...');

    const equipamentos = unidades.flatMap(u => u.equipamentos);

    if (equipamentos.length === 0) {
      console.log('   ⚠️  NENHUM EQUIPAMENTO ENCONTRADO!');
      console.log('   Criando equipamentos de exemplo...\n');

      for (const unidade of unidades) {
        if (unidade.tipo === 'UFV') {
          // Criar inversor
          const inversor = await prisma.equipamentos.create({
            data: {
              nome: `Inversor Test ${unidade.nome}`,
              tipo_equipamento: 'INVERSOR',
              classificacao: 'MEDIDOR',
              unidade_id: unidade.id,
              planta_id: PLANTA_ID,
              proprietario_id: ADMIN_ID,
              topico_mqtt: `inversor/test/${unidade.id}`,
            },
          });
          equipamentos.push({
            id: inversor.id,
            nome: inversor.nome,
            tipo_equipamento: inversor.tipo_equipamento,
          });
        } else if (unidade.tipo === 'Carga') {
          // Criar medidor M160
          const medidor = await prisma.equipamentos.create({
            data: {
              nome: `M160 Test ${unidade.nome}`,
              tipo_equipamento: 'M-160',
              classificacao: 'MEDIDOR',
              unidade_id: unidade.id,
              planta_id: PLANTA_ID,
              proprietario_id: ADMIN_ID,
              topico_mqtt: `m160/test/${unidade.id}`,
            },
          });
          equipamentos.push({
            id: medidor.id,
            nome: medidor.nome,
            tipo_equipamento: medidor.tipo_equipamento,
          });
        } else {
          // Para outros tipos, criar equipamento genérico
          const equipGenerico = await prisma.equipamentos.create({
            data: {
              nome: `Equipamento ${unidade.nome}`,
              tipo_equipamento: 'GENERICO',
              classificacao: 'MEDIDOR',
              unidade_id: unidade.id,
              planta_id: PLANTA_ID,
              proprietario_id: ADMIN_ID,
              topico_mqtt: `generico/test/${unidade.id}`,
            },
          });
          equipamentos.push({
            id: equipGenerico.id,
            nome: equipGenerico.nome,
            tipo_equipamento: equipGenerico.tipo_equipamento,
          });
        }
      }

      console.log(`   ✅ ${equipamentos.length} equipamentos criados`);
    }

    console.log(`   ✅ ${equipamentos.length} equipamentos disponíveis`);

    if (equipamentos.length === 0) {
      console.log('\n   ❌ ERRO: Nenhum equipamento disponível para criar leituras!');
      console.log('   Abortando seed...\n');
      return;
    }

    // PASSO 4: CRIAR LEITURAS MQTT
    console.log(`\n📊 CRIANDO ${CONFIG.criarLeituras} LEITURAS MQTT...`);

    let leiturasCriadas = 0;

    for (let i = 0; i < CONFIG.criarLeituras; i++) {
      const equipamento = getRandomElement(equipamentos);
      const horasAtras = getRandomInt(0, 24);
      const timestamp = getHorasAtras(horasAtras);

      const isInversor = equipamento.tipo_equipamento?.includes('INVERSOR');
      const isM160 = equipamento.tipo_equipamento?.includes('M-160') || equipamento.tipo_equipamento?.includes('M160');

      let dados, potenciaKw, energiaKwh;

      if (isInversor) {
        // Dados de INVERSOR (geração)
        const potenciaW = getRandomInt(5000, 20000); // 5-20 kW
        const energiaDiariaWh = getRandomInt(50000, 150000); // 50-150 kWh

        dados = {
          power: {
            active_total: potenciaW,
          },
          energy: {
            daily_yield: energiaDiariaWh,
          },
        };

        potenciaKw = potenciaW / 1000;
        energiaKwh = energiaDiariaWh / 1000;

      } else if (isM160) {
        // Dados de M160 (consumo)
        const potenciaW = getRandomInt(15000, 40000); // 15-40 kW
        const consumoPhf = getRandomFloat(0.2, 1.0); // 0.2-1.0 kWh

        dados = {
          Pt: potenciaW,
          consumo_phf: consumoPhf,
          Dados: {
            Pa: potenciaW / 3,
            Pb: potenciaW / 3,
            Pc: potenciaW / 3,
            fp: getRandomFloat(0.90, 0.99),
          },
        };

        potenciaKw = potenciaW / 1000;
        energiaKwh = consumoPhf * 48; // Simular energia do dia

      } else {
        // Outros equipamentos (genérico)
        potenciaKw = getRandomFloat(5.0, 30.0);
        energiaKwh = potenciaKw * horasAtras;
        dados = {
          potencia_kw: potenciaKw,
          energia_kwh: energiaKwh,
        };
      }

      await prisma.equipamentos_dados.create({
        data: {
          equipamento_id: equipamento.id,
          dados: dados,
          potencia_ativa_kw: potenciaKw,
          energia_kwh: energiaKwh,
          timestamp_dados: timestamp,
          qualidade: getRandomElement(['BOM', 'BOM', 'BOM', 'SUSPEITO']), // 75% BOM
        },
      });

      leiturasCriadas++;

      if (leiturasCriadas % 25 === 0) {
        console.log(`   ${leiturasCriadas} leituras criadas...`);
      }
    }

    console.log(`   ✅ ${leiturasCriadas} leituras MQTT criadas`);

    // PASSO 5: CRIAR ANOMALIAS
    console.log(`\n⚠️  CRIANDO ${CONFIG.criarAnomalias} ANOMALIAS...`);

    const anomaliasData = [
      {
        descricao: 'Superaquecimento detectado no inversor principal',
        status: 'AGUARDANDO',
        prioridade: 'ALTA',
        condicao: 'FUNCIONANDO',
        origem: 'SISTEMA',
      },
      {
        descricao: 'Geração abaixo do esperado para condições climáticas atuais',
        status: 'EM_ANALISE',
        prioridade: 'MEDIA',
        condicao: 'FUNCIONANDO',
        origem: 'INSPECAO',
      },
      {
        descricao: 'Falha de comunicação intermitente com inversor',
        status: 'AGUARDANDO',
        prioridade: 'ALTA',
        condicao: 'FUNCIONANDO',
        origem: 'SISTEMA',
      },
      {
        descricao: 'Necessária limpeza dos painéis solares',
        status: 'OS_GERADA',
        prioridade: 'BAIXA',
        condicao: 'FUNCIONANDO',
        origem: 'PREVENTIVA',
      },
      {
        descricao: 'Tensão DC fora da faixa normal',
        status: 'AGUARDANDO',
        prioridade: 'MEDIA',
        condicao: 'FUNCIONANDO',
        origem: 'SISTEMA',
      },
      {
        descricao: 'Corrente elevada detectada na string 3',
        status: 'EM_ANALISE',
        prioridade: 'ALTA',
        condicao: 'FUNCIONANDO',
        origem: 'INSPECAO',
      },
      {
        descricao: 'Degradação de performance observada nos últimos 30 dias',
        status: 'EM_ANALISE',
        prioridade: 'MEDIA',
        condicao: 'FUNCIONANDO',
        origem: 'MONITORAMENTO',
      },
      {
        descricao: 'Manutenção preventiva trimestral agendada',
        status: 'OS_GERADA',
        prioridade: 'BAIXA',
        condicao: 'FUNCIONANDO',
        origem: 'PREVENTIVA',
      },
      {
        descricao: 'Fator de potência baixo detectado',
        status: 'AGUARDANDO',
        prioridade: 'MEDIA',
        condicao: 'FUNCIONANDO',
        origem: 'SISTEMA',
      },
      {
        descricao: 'Desconexão não programada durante madrugada',
        status: 'AGUARDANDO',
        prioridade: 'ALTA',
        condicao: 'PARADO',
        origem: 'SISTEMA',
      },
    ];

    for (let i = 0; i < CONFIG.criarAnomalias; i++) {
      const template = getRandomElement(anomaliasData);
      const equipamento = getRandomElement(equipamentos);
      const horasAtras = getRandomInt(1, 72);
      const dataAnomalia = getHorasAtras(horasAtras);

      await prisma.anomalias.create({
        data: {
          descricao: `${template.descricao} - ${equipamento.nome}`,
          local: equipamento.nome,
          ativo: equipamento.nome,
          data: dataAnomalia,
          status: template.status,
          prioridade: template.prioridade,
          condicao: template.condicao,
          origem: template.origem,
          planta_id: PLANTA_ID,  // ✅ IMPORTANTE: COM PLANTA!
          equipamento_id: equipamento.id,
          usuario_id: ADMIN_ID,
          criado_por: 'Sistema Automático',
        },
      });

      if ((i + 1) % 5 === 0) {
        console.log(`   ${i + 1} anomalias criadas...`);
      }
    }

    console.log(`   ✅ ${CONFIG.criarAnomalias} anomalias criadas`);

    // PASSO 6: VALIDAÇÃO
    console.log('\n✅ VALIDAÇÃO FINAL\n');

    const stats = {
      anomalias: await prisma.anomalias.count({ where: { deleted_at: null } }),
      anomaliasComPlanta: await prisma.anomalias.count({
        where: { deleted_at: null, planta_id: PLANTA_ID },
      }),
      leituras: await prisma.equipamentos_dados.count({
        where: {
          timestamp_dados: {
            gte: getHorasAtras(24),
          },
        },
      }),
    };

    console.log(`   Anomalias ativas: ${stats.anomalias}`);
    console.log(`   └─ Com planta ${PLANTA_ID.substring(0, 8)}...: ${stats.anomaliasComPlanta}`);
    console.log(`   Leituras MQTT (últimas 24h): ${stats.leituras}`);

    console.log('\n' + '='.repeat(80));
    console.log('\n🎉 SEED CONCLUÍDO COM SUCESSO!\n');

    console.log('📝 PRÓXIMOS PASSOS:');
    console.log('   1. Reiniciar backend: npm run start:dev');
    console.log('   2. Acessar: http://localhost:5173/dashboard');
    console.log('   3. Verificar card "Anomalias Ativas"');
    console.log('   4. Verificar mapa e tabelas');

    console.log('\n' + '='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

// EXECUTAR SEED
seedDashboardCOA();
