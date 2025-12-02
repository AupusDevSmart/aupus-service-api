const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function criarEquipamentosTeste() {
  console.log('🚀 Criando equipamentos de teste para agrupamento...');

  try {
    // Verificar se já existem tipos de equipamento
    const tipoInversor = await prisma.tipos_equipamentos.findFirst({
      where: { codigo: 'INVERSOR' }
    });

    const tipoM160 = await prisma.tipos_equipamentos.findFirst({
      where: { codigo: 'M160' }
    });

    if (!tipoInversor) {
      console.log('❌ Tipo INVERSOR não encontrado. Criando...');
      await prisma.tipos_equipamentos.create({
        data: {
          id: 'cltest001',
          codigo: 'INVERSOR',
          nome: 'Inversor Solar',
          categoria: 'GERACAO',
          descricao: 'Inversor fotovoltaico'
        }
      });
    }

    if (!tipoM160) {
      console.log('❌ Tipo M160 não encontrado. Criando...');
      await prisma.tipos_equipamentos.create({
        data: {
          id: 'cltest002',
          codigo: 'M160',
          nome: 'Multimedidor M160',
          categoria: 'MEDICAO',
          descricao: 'Medidor de energia multifásico'
        }
      });
    }

    // Criar equipamentos de teste
    const equipamentos = [
      {
        id: 'inv001test',
        nome: 'Inversor 1 - Teste',
        tipo_equipamento: 'cltest001', // INVERSOR
        classificacao: 'GERACAO',
        criticidade: 'B', // Média criticidade
        fabricante: 'SMA',
        modelo: 'Sunny Tripower',
        mqtt_habilitado: true,
        topico_mqtt: 'solar/inversor1'
      },
      {
        id: 'inv002test',
        nome: 'Inversor 2 - Teste',
        tipo_equipamento: 'cltest001', // INVERSOR
        classificacao: 'GERACAO',
        criticidade: 'B', // Média criticidade
        fabricante: 'Fronius',
        modelo: 'Symo',
        mqtt_habilitado: true,
        topico_mqtt: 'solar/inversor2'
      },
      {
        id: 'inv003test',
        nome: 'Inversor 3 - Teste',
        tipo_equipamento: 'cltest001', // INVERSOR
        classificacao: 'GERACAO',
        criticidade: 'B', // Média criticidade
        fabricante: 'Huawei',
        modelo: 'SUN2000',
        mqtt_habilitado: true,
        topico_mqtt: 'solar/inversor3'
      },
      {
        id: 'm160test01',
        nome: 'M160 - Prédio Admin',
        tipo_equipamento: 'cltest002', // M160
        classificacao: 'CONSUMO',
        criticidade: 'A', // Alta criticidade (consumo do prédio)
        fabricante: 'Schneider',
        modelo: 'PM5560',
        mqtt_habilitado: true,
        topico_mqtt: 'energia/m160/admin'
      }
    ];

    for (const equip of equipamentos) {
      const existe = await prisma.equipamentos.findUnique({
        where: { id: equip.id }
      });

      if (existe) {
        console.log(`⚠️  Equipamento ${equip.nome} já existe`);
      } else {
        await prisma.equipamentos.create({
          data: equip
        });
        console.log(`✅ Criado: ${equip.nome}`);
      }
    }

    // Criar alguns dados de teste para os inversores
    console.log('\n📊 Criando dados históricos de teste...');

    const agora = new Date();
    const dadosInversores = [];

    // Gerar dados para as últimas 24 horas (a cada 5 minutos)
    for (let horasAtras = 24; horasAtras >= 0; horasAtras -= 0.083) { // 0.083 = 5 minutos
      const timestamp = new Date(agora.getTime() - horasAtras * 60 * 60 * 1000);
      const hora = timestamp.getHours();

      // Simular curva de geração solar
      let fatorGeracao = 0;
      if (hora >= 6 && hora < 18) {
        // Pico ao meio-dia
        const horaDecimal = hora + timestamp.getMinutes() / 60;
        fatorGeracao = Math.sin((horaDecimal - 6) * Math.PI / 12);
      }

      // Inversor 1 - 60kW nominal
      dadosInversores.push({
        equipamento_id: 'inv001test',
        timestamp_dados: timestamp,
        dados: {
          power: {
            active_total: Math.round(60000 * fatorGeracao * (0.9 + Math.random() * 0.1)) // W
          },
          voltage: {
            line_average: 380 + Math.random() * 10
          },
          current: {
            phase_a: fatorGeracao * 90 + Math.random() * 10,
            phase_b: fatorGeracao * 90 + Math.random() * 10,
            phase_c: fatorGeracao * 90 + Math.random() * 10
          },
          energy: {
            daily_yield: Math.round(60 * fatorGeracao * horasAtras),
            total_yield: 150000 + Math.round(60 * fatorGeracao * horasAtras)
          }
        },
        fonte: 'TESTE',
        qualidade: 'BOA'
      });

      // Inversor 2 - 50kW nominal
      dadosInversores.push({
        equipamento_id: 'inv002test',
        timestamp_dados: timestamp,
        dados: {
          power: {
            active_total: Math.round(50000 * fatorGeracao * (0.85 + Math.random() * 0.15)) // W
          },
          voltage: {
            line_average: 380 + Math.random() * 10
          },
          current: {
            phase_a: fatorGeracao * 75 + Math.random() * 10,
            phase_b: fatorGeracao * 75 + Math.random() * 10,
            phase_c: fatorGeracao * 75 + Math.random() * 10
          },
          energy: {
            daily_yield: Math.round(50 * fatorGeracao * horasAtras),
            total_yield: 120000 + Math.round(50 * fatorGeracao * horasAtras)
          }
        },
        fonte: 'TESTE',
        qualidade: 'BOA'
      });

      // Inversor 3 - 40kW nominal
      dadosInversores.push({
        equipamento_id: 'inv003test',
        timestamp_dados: timestamp,
        dados: {
          power: {
            active_total: Math.round(40000 * fatorGeracao * (0.88 + Math.random() * 0.12)) // W
          },
          voltage: {
            line_average: 380 + Math.random() * 10
          },
          current: {
            phase_a: fatorGeracao * 60 + Math.random() * 10,
            phase_b: fatorGeracao * 60 + Math.random() * 10,
            phase_c: fatorGeracao * 60 + Math.random() * 10
          },
          energy: {
            daily_yield: Math.round(40 * fatorGeracao * horasAtras),
            total_yield: 100000 + Math.round(40 * fatorGeracao * horasAtras)
          }
        },
        fonte: 'TESTE',
        qualidade: 'BOA'
      });

      // M160 - Consumo do prédio (varia durante o dia)
      let fatorConsumo = 0.3; // Consumo base noturno
      if (hora >= 7 && hora < 19) {
        fatorConsumo = 0.6 + 0.3 * Math.sin((hora - 7) * Math.PI / 12);
      }

      dadosInversores.push({
        equipamento_id: 'm160test01',
        timestamp_dados: timestamp,
        dados: {
          Dados: {
            Pa: Math.round(30000 * fatorConsumo * (0.9 + Math.random() * 0.1)), // W
            Pb: Math.round(35000 * fatorConsumo * (0.9 + Math.random() * 0.1)), // W
            Pc: Math.round(35000 * fatorConsumo * (0.9 + Math.random() * 0.1)), // W
            Va: 220 + Math.random() * 5,
            Vb: 220 + Math.random() * 5,
            Vc: 220 + Math.random() * 5,
            Ia: fatorConsumo * 150 + Math.random() * 20,
            Ib: fatorConsumo * 160 + Math.random() * 20,
            Ic: fatorConsumo * 160 + Math.random() * 20,
            FPa: 0.92 + Math.random() * 0.06,
            FPb: 0.92 + Math.random() * 0.06,
            FPc: 0.92 + Math.random() * 0.06
          }
        },
        fonte: 'TESTE',
        qualidade: 'BOA'
      });
    }

    // Inserir dados em lote
    console.log(`Inserindo ${dadosInversores.length} registros de dados...`);
    await prisma.equipamentos_dados.createMany({
      data: dadosInversores,
      skipDuplicates: true
    });

    console.log('\n✅ Equipamentos de teste criados com sucesso!');
    console.log('\n📊 Resumo:');
    console.log('- 3 Inversores (60kW, 50kW, 40kW) = 150kW total de geração');
    console.log('- 1 M160 (consumo do prédio) = ~60kW médio');
    console.log('- Dados históricos das últimas 24h');
    console.log('\n💡 Agora você pode testar o agrupamento no frontend!');

  } catch (error) {
    console.error('❌ Erro ao criar equipamentos:', error);
  } finally {
    await prisma.$disconnect();
  }
}

criarEquipamentosTeste();