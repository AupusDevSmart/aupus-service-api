const { PrismaClient } = require('@prisma/client');
const { createId } = require('@paralleldrive/cuid2');
const prisma = new PrismaClient();

// IDs das plantas existentes
const PLANTAS = [
  { id: 'cmekb23pr00012f4o4nqp9ypz', nome: 'Planta Industrial São Paulo' },
  { id: 'cmekb23xd00032f4o1rw4g8rk', nome: 'Centro de Distribuição Rio' },
  { id: 'cmekb241300052f4o9frhlfqy', nome: 'Unidade Administrativa BH' },
  { id: 'cmekb245400072f4oyfcrcxzw', nome: 'Oficina João Silva' },
  { id: 'cmflg3wry00012fzgn0uu1ohv', nome: 'UFV Solar Power' },
];

// Seed de unidades
const UNIDADES = [
  // Planta São Paulo - 4 unidades
  {
    planta_id: 'cmekb23pr00012f4o4nqp9ypz',
    nome: 'UFV Principal SP',
    tipo: 'UFV',
    estado: 'SP',
    cidade: 'São Paulo',
    latitude: -23.5505,
    longitude: -46.6333,
    potencia: 5000.00,
    status: 'ativo',
    pontos_medicao: ['PAC', 'Inversor Central', 'String Box 1', 'String Box 2'],
  },
  {
    planta_id: 'cmekb23pr00012f4o4nqp9ypz',
    nome: 'Transformador SP-01',
    tipo: 'Transformador',
    estado: 'SP',
    cidade: 'São Paulo',
    latitude: -23.5508,
    longitude: -46.6335,
    potencia: 2500.00,
    status: 'ativo',
    pontos_medicao: ['Primário', 'Secundário', 'TAP'],
  },
  {
    planta_id: 'cmekb23pr00012f4o4nqp9ypz',
    nome: 'Carga Industrial SP',
    tipo: 'Carga',
    estado: 'SP',
    cidade: 'São Paulo',
    latitude: -23.5510,
    longitude: -46.6340,
    potencia: 1500.00,
    status: 'ativo',
    pontos_medicao: ['Entrada', 'Saída', 'Neutro'],
  },
  {
    planta_id: 'cmekb23pr00012f4o4nqp9ypz',
    nome: 'Inversor Central SP',
    tipo: 'Inversor',
    estado: 'SP',
    cidade: 'São Paulo',
    latitude: -23.5512,
    longitude: -46.6338,
    potencia: 500.00,
    status: 'ativo',
    pontos_medicao: ['DC Input', 'AC Output', 'MPPT 1', 'MPPT 2'],
  },

  // Planta Rio - 3 unidades
  {
    planta_id: 'cmekb23xd00032f4o1rw4g8rk',
    nome: 'UFV Porto Rio',
    tipo: 'UFV',
    estado: 'RJ',
    cidade: 'Rio de Janeiro',
    latitude: -22.9068,
    longitude: -43.1729,
    potencia: 3500.00,
    status: 'ativo',
    pontos_medicao: ['PAC', 'Inversor 1', 'Inversor 2'],
  },
  {
    planta_id: 'cmekb23xd00032f4o1rw4g8rk',
    nome: 'Motor Elevador Rio-01',
    tipo: 'Motor',
    estado: 'RJ',
    cidade: 'Rio de Janeiro',
    latitude: -22.9070,
    longitude: -43.1730,
    potencia: 75.00,
    status: 'ativo',
    pontos_medicao: ['Estator', 'Rotor', 'Mancal'],
  },
  {
    planta_id: 'cmekb23xd00032f4o1rw4g8rk',
    nome: 'Transformador Rio-01',
    tipo: 'Transformador',
    estado: 'RJ',
    cidade: 'Rio de Janeiro',
    latitude: -22.9072,
    longitude: -43.1732,
    potencia: 1000.00,
    status: 'ativo',
    pontos_medicao: ['Primário', 'Secundário'],
  },

  // Planta BH - 2 unidades
  {
    planta_id: 'cmekb241300052f4o9frhlfqy',
    nome: 'Carga Administrativa BH',
    tipo: 'Carga',
    estado: 'MG',
    cidade: 'Belo Horizonte',
    latitude: -19.9167,
    longitude: -43.9345,
    potencia: 300.00,
    status: 'ativo',
    pontos_medicao: ['QD Principal', 'QD Secundário'],
  },
  {
    planta_id: 'cmekb241300052f4o9frhlfqy',
    nome: 'Inversor BH-01',
    tipo: 'Inversor',
    estado: 'MG',
    cidade: 'Belo Horizonte',
    latitude: -19.9170,
    longitude: -43.9347,
    potencia: 50.00,
    status: 'ativo',
    pontos_medicao: ['DC', 'AC'],
  },

  // Planta Oficina - 2 unidades
  {
    planta_id: 'cmekb245400072f4oyfcrcxzw',
    nome: 'Motor Principal Oficina',
    tipo: 'Motor',
    estado: 'SP',
    cidade: 'São Paulo',
    latitude: -23.5600,
    longitude: -46.6500,
    potencia: 150.00,
    status: 'ativo',
    pontos_medicao: ['Bobina A', 'Bobina B', 'Bobina C'],
  },
  {
    planta_id: 'cmekb245400072f4oyfcrcxzw',
    nome: 'Carga Oficina',
    tipo: 'Carga',
    estado: 'SP',
    cidade: 'São Paulo',
    latitude: -23.5605,
    longitude: -46.6505,
    potencia: 100.00,
    status: 'ativo',
    pontos_medicao: ['Entrada'],
  },

  // Planta UFV Solar Power - 4 unidades
  {
    planta_id: 'cmflg3wry00012fzgn0uu1ohv',
    nome: 'UFV Solar Power Norte',
    tipo: 'UFV',
    estado: 'CE',
    cidade: 'Fortaleza',
    latitude: -3.7172,
    longitude: -38.5433,
    potencia: 10000.00,
    status: 'ativo',
    pontos_medicao: ['PAC Principal', 'Inversor 1', 'Inversor 2', 'Inversor 3', 'String Box 1-10'],
  },
  {
    planta_id: 'cmflg3wry00012fzgn0uu1ohv',
    nome: 'UFV Solar Power Sul',
    tipo: 'UFV',
    estado: 'CE',
    cidade: 'Fortaleza',
    latitude: -3.7180,
    longitude: -38.5440,
    potencia: 8000.00,
    status: 'ativo',
    pontos_medicao: ['PAC Secundário', 'Inversor 4', 'Inversor 5', 'String Box 11-18'],
  },
  {
    planta_id: 'cmflg3wry00012fzgn0uu1ohv',
    nome: 'Transformador Solar Power',
    tipo: 'Transformador',
    estado: 'CE',
    cidade: 'Fortaleza',
    latitude: -3.7175,
    longitude: -38.5435,
    potencia: 5000.00,
    status: 'ativo',
    pontos_medicao: ['Primário 13.8kV', 'Secundário 380V', 'TAP', 'Neutro'],
  },
  {
    planta_id: 'cmflg3wry00012fzgn0uu1ohv',
    nome: 'Inversor Central Solar',
    tipo: 'Inversor',
    estado: 'CE',
    cidade: 'Fortaleza',
    latitude: -3.7178,
    longitude: -38.5438,
    potencia: 1000.00,
    status: 'ativo',
    pontos_medicao: ['DC 1', 'DC 2', 'DC 3', 'AC Output', 'MPPT 1-6'],
  },
];

// Template de equipamentos por tipo de unidade
function gerarEquipamentos(unidadeId, tipoUnidade, nomeUnidade) {
  const equipamentos = [];

  switch (tipoUnidade) {
    case 'UFV':
      // Inversores (UCs)
      for (let i = 1; i <= 3; i++) {
        const inversorId = createId();
        equipamentos.push({
          id: inversorId,
          unidade_id: unidadeId,
          nome: `Inversor ${i} - ${nomeUnidade}`,
          classificacao: 'UC',
          criticidade: '4',
          fabricante: 'ABB',
          modelo: `PVS-100-TL-${i}`,
          numero_serie: `INV${Date.now()}${i}`,
          em_operacao: 'sim',
          valor_imobilizado: 150000.00,
          valor_contabil: 135000.00,
          vida_util: 15,
          localizacao: 'Campo Solar - Área ${i}',
          dados_tecnicos: [
            { campo: 'potencia_nominal', valor: '100', tipo: 'number', unidade: 'kW' },
            { campo: 'tensao_entrada', valor: '800', tipo: 'number', unidade: 'Vdc' },
            { campo: 'tensao_saida', valor: '380', tipo: 'number', unidade: 'Vac' },
            { campo: 'eficiencia', valor: '98.5', tipo: 'number', unidade: '%' },
          ],
        });

        // Componentes UAR do inversor
        equipamentos.push(
          {
            id: createId(),
            unidade_id: unidadeId,
            equipamento_pai_id: inversorId,
            nome: `MPPT 1 - Inversor ${i}`,
            classificacao: 'UAR',
            criticidade: '3',
            fabricante: 'ABB',
            modelo: 'MPPT-Module',
            localizacao_especifica: 'Módulo MPPT Superior',
            dados_tecnicos: [
              { campo: 'corrente_maxima', valor: '50', tipo: 'number', unidade: 'A' },
              { campo: 'tensao_maxima', valor: '1000', tipo: 'number', unidade: 'Vdc' },
            ],
          },
          {
            id: createId(),
            unidade_id: unidadeId,
            equipamento_pai_id: inversorId,
            nome: `MPPT 2 - Inversor ${i}`,
            classificacao: 'UAR',
            criticidade: '3',
            fabricante: 'ABB',
            modelo: 'MPPT-Module',
            localizacao_especifica: 'Módulo MPPT Inferior',
            dados_tecnicos: [
              { campo: 'corrente_maxima', valor: '50', tipo: 'number', unidade: 'A' },
              { campo: 'tensao_maxima', valor: '1000', tipo: 'number', unidade: 'Vdc' },
            ],
          },
          {
            id: createId(),
            unidade_id: unidadeId,
            equipamento_pai_id: inversorId,
            nome: `Filtro EMI - Inversor ${i}`,
            classificacao: 'UAR',
            criticidade: '2',
            fabricante: 'ABB',
            modelo: 'EMI-Filter-100',
            localizacao_especifica: 'Entrada AC',
          }
        );
      }

      // String Boxes (UCs)
      for (let i = 1; i <= 5; i++) {
        const stringBoxId = createId();
        equipamentos.push({
          id: stringBoxId,
          unidade_id: unidadeId,
          nome: `String Box ${i} - ${nomeUnidade}`,
          classificacao: 'UC',
          criticidade: '3',
          fabricante: 'Phoenix Contact',
          modelo: `SB-16-${i}`,
          numero_serie: `SB${Date.now()}${i}`,
          em_operacao: 'sim',
          valor_imobilizado: 8000.00,
          valor_contabil: 7200.00,
          vida_util: 20,
          localizacao: `String ${i}`,
          dados_tecnicos: [
            { campo: 'num_strings', valor: '16', tipo: 'number', unidade: 'un' },
            { campo: 'corrente_maxima', valor: '12', tipo: 'number', unidade: 'A' },
          ],
        });

        // Fusíveis UAR
        for (let j = 1; j <= 3; j++) {
          equipamentos.push({
            id: createId(),
            unidade_id: unidadeId,
            equipamento_pai_id: stringBoxId,
            nome: `Fusível String ${j}`,
            classificacao: 'UAR',
            criticidade: '2',
            fabricante: 'Phoenix Contact',
            modelo: 'FUSE-15A',
            localizacao_especifica: `Posição ${j}`,
          });
        }
      }
      break;

    case 'Transformador':
      const trafoId = createId();
      equipamentos.push({
        id: trafoId,
        unidade_id: unidadeId,
        nome: `Transformador Principal - ${nomeUnidade}`,
        classificacao: 'UC',
        criticidade: '5',
        fabricante: 'WEG',
        modelo: 'TTD-2500',
        numero_serie: `TRF${Date.now()}`,
        em_operacao: 'sim',
        valor_imobilizado: 250000.00,
        valor_contabil: 225000.00,
        vida_util: 25,
        localizacao: 'Subestação Principal',
        dados_tecnicos: [
          { campo: 'potencia', valor: '2500', tipo: 'number', unidade: 'kVA' },
          { campo: 'tensao_primaria', valor: '13800', tipo: 'number', unidade: 'V' },
          { campo: 'tensao_secundaria', valor: '380', tipo: 'number', unidade: 'V' },
          { campo: 'frequencia', valor: '60', tipo: 'number', unidade: 'Hz' },
        ],
      });

      // Componentes UAR
      equipamentos.push(
        {
          id: createId(),
          unidade_id: unidadeId,
          equipamento_pai_id: trafoId,
          nome: 'Núcleo Magnético',
          classificacao: 'UAR',
          criticidade: '5',
          fabricante: 'WEG',
          modelo: 'CORE-FE-SI',
          localizacao_especifica: 'Centro do transformador',
        },
        {
          id: createId(),
          unidade_id: unidadeId,
          equipamento_pai_id: trafoId,
          nome: 'Comutador TAP',
          classificacao: 'UAR',
          criticidade: '4',
          fabricante: 'WEG',
          modelo: 'TAP-CHANGER-17',
          localizacao_especifica: 'Lado primário',
        },
        {
          id: createId(),
          unidade_id: unidadeId,
          equipamento_pai_id: trafoId,
          nome: 'Bucha Alta Tensão',
          classificacao: 'UAR',
          criticidade: '4',
          fabricante: 'WEG',
          modelo: 'BUSHING-15kV',
          localizacao_especifica: 'Tampa superior',
        }
      );
      break;

    case 'Motor':
      const motorId = createId();
      equipamentos.push({
        id: motorId,
        unidade_id: unidadeId,
        nome: `Motor Elétrico - ${nomeUnidade}`,
        classificacao: 'UC',
        criticidade: '4',
        fabricante: 'WEG',
        modelo: 'W22-150HP',
        numero_serie: `MOT${Date.now()}`,
        em_operacao: 'sim',
        valor_imobilizado: 45000.00,
        valor_contabil: 40500.00,
        vida_util: 20,
        localizacao: 'Área de Produção',
        dados_tecnicos: [
          { campo: 'potencia', valor: '150', tipo: 'number', unidade: 'HP' },
          { campo: 'rotacao', valor: '1780', tipo: 'number', unidade: 'RPM' },
          { campo: 'tensao', valor: '380', tipo: 'number', unidade: 'V' },
          { campo: 'corrente', valor: '180', tipo: 'number', unidade: 'A' },
        ],
      });

      equipamentos.push(
        {
          id: createId(),
          unidade_id: unidadeId,
          equipamento_pai_id: motorId,
          nome: 'Rotor',
          classificacao: 'UAR',
          criticidade: '5',
          fabricante: 'WEG',
          modelo: 'ROTOR-150',
          localizacao_especifica: 'Centro do motor',
        },
        {
          id: createId(),
          unidade_id: unidadeId,
          equipamento_pai_id: motorId,
          nome: 'Mancal Dianteiro',
          classificacao: 'UAR',
          criticidade: '4',
          fabricante: 'SKF',
          modelo: 'BEARING-6320',
          localizacao_especifica: 'Lado acoplamento',
        },
        {
          id: createId(),
          unidade_id: unidadeId,
          equipamento_pai_id: motorId,
          nome: 'Mancal Traseiro',
          classificacao: 'UAR',
          criticidade: '4',
          fabricante: 'SKF',
          modelo: 'BEARING-6320',
          localizacao_especifica: 'Lado oposto',
        }
      );
      break;

    case 'Inversor':
      const invId = createId();
      equipamentos.push({
        id: invId,
        unidade_id: unidadeId,
        nome: `Inversor Central - ${nomeUnidade}`,
        classificacao: 'UC',
        criticidade: '4',
        fabricante: 'SMA',
        modelo: 'Sunny Central 500',
        numero_serie: `SMA${Date.now()}`,
        em_operacao: 'sim',
        valor_imobilizado: 80000.00,
        valor_contabil: 72000.00,
        vida_util: 15,
        localizacao: 'Casa de Inversores',
        dados_tecnicos: [
          { campo: 'potencia', valor: '500', tipo: 'number', unidade: 'kW' },
          { campo: 'eficiencia', valor: '98.8', tipo: 'number', unidade: '%' },
        ],
      });

      equipamentos.push(
        {
          id: createId(),
          unidade_id: unidadeId,
          equipamento_pai_id: invId,
          nome: 'Módulo IGBT',
          classificacao: 'UAR',
          criticidade: '5',
          fabricante: 'SMA',
          modelo: 'IGBT-1200V',
          localizacao_especifica: 'Placa de potência',
        },
        {
          id: createId(),
          unidade_id: unidadeId,
          equipamento_pai_id: invId,
          nome: 'Banco Capacitores DC',
          classificacao: 'UAR',
          criticidade: '4',
          fabricante: 'SMA',
          modelo: 'CAP-BANK-500',
          localizacao_especifica: 'Entrada DC',
        }
      );
      break;

    case 'Carga':
      const cargaId = createId();
      equipamentos.push({
        id: cargaId,
        unidade_id: unidadeId,
        nome: `Quadro Distribuição - ${nomeUnidade}`,
        classificacao: 'UC',
        criticidade: '3',
        fabricante: 'Schneider',
        modelo: 'QD-380-400A',
        numero_serie: `QD${Date.now()}`,
        em_operacao: 'sim',
        valor_imobilizado: 15000.00,
        valor_contabil: 13500.00,
        vida_util: 20,
        localizacao: 'Área Elétrica',
        dados_tecnicos: [
          { campo: 'corrente_nominal', valor: '400', tipo: 'number', unidade: 'A' },
          { campo: 'tensao', valor: '380', tipo: 'number', unidade: 'V' },
        ],
      });

      equipamentos.push(
        {
          id: createId(),
          unidade_id: unidadeId,
          equipamento_pai_id: cargaId,
          nome: 'Disjuntor Geral',
          classificacao: 'UAR',
          criticidade: '4',
          fabricante: 'Schneider',
          modelo: 'NSX400',
          localizacao_especifica: 'Entrada principal',
        },
        {
          id: createId(),
          unidade_id: unidadeId,
          equipamento_pai_id: cargaId,
          nome: 'Barramento Cobre',
          classificacao: 'UAR',
          criticidade: '3',
          fabricante: 'Schneider',
          modelo: 'BAR-CU-400A',
          localizacao_especifica: 'Interior do quadro',
        }
      );
      break;
  }

  return equipamentos;
}

async function seed() {
  console.log('🌱 Iniciando seed de unidades e equipamentos...\n');

  const unidadesCriadas = [];
  const equipamentosCriados = [];

  // Criar unidades
  console.log('📦 Criando unidades...');
  for (const unidade of UNIDADES) {
    const unidadeCriada = await prisma.unidades.create({
      data: unidade,
    });
    unidadesCriadas.push(unidadeCriada);
    console.log(`  ✅ ${unidadeCriada.nome} (${unidadeCriada.tipo})`);
  }

  console.log(`\n✅ Total de unidades criadas: ${unidadesCriadas.length}\n`);

  // Criar equipamentos
  console.log('🔧 Criando equipamentos...');
  for (const unidade of unidadesCriadas) {
    const equipamentos = gerarEquipamentos(unidade.id, unidade.tipo, unidade.nome);

    for (const equipamento of equipamentos) {
      const { dados_tecnicos, ...equipamentoData } = equipamento;

      try {
        const equipamentoCriado = await prisma.equipamentos.create({
          data: equipamentoData,
        });

      // Criar dados técnicos se existirem
      if (dados_tecnicos && dados_tecnicos.length > 0) {
        await prisma.equipamentos_dados_tecnicos.createMany({
          data: dados_tecnicos.map(dt => ({
            equipamento_id: equipamentoCriado.id,
            ...dt,
          })),
        });
      }

        equipamentosCriados.push(equipamentoCriado);
        console.log(`  ✅ ${equipamentoCriado.nome} [${equipamentoCriado.classificacao}]`);
      } catch (error) {
        console.error(`  ❌ Erro ao criar equipamento:`, equipamento.nome);
        console.error(`  Dados:`, JSON.stringify(equipamentoData, null, 2));
        throw error;
      }
    }
  }

  console.log(`\n✅ Total de equipamentos criados: ${equipamentosCriados.length}\n`);

  // Estatísticas finais
  console.log('📊 ESTATÍSTICAS FINAIS:');
  console.log('='.repeat(50));

  const stats = await Promise.all([
    prisma.unidades.count({ where: { deleted_at: null } }),
    prisma.equipamentos.count({ where: { deleted_at: null, classificacao: 'UC' } }),
    prisma.equipamentos.count({ where: { deleted_at: null, classificacao: 'UAR' } }),
    prisma.equipamentos_dados_tecnicos.count(),
  ]);

  console.log(`Unidades: ${stats[0]}`);
  console.log(`Equipamentos UC: ${stats[1]}`);
  console.log(`Componentes UAR: ${stats[2]}`);
  console.log(`Dados Técnicos: ${stats[3]}`);
  console.log('='.repeat(50));

  // Resumo por planta
  console.log('\n📋 RESUMO POR PLANTA:');
  for (const planta of PLANTAS) {
    const numUnidades = await prisma.unidades.count({
      where: { planta_id: planta.id, deleted_at: null }
    });

    const numEquipamentos = await prisma.equipamentos.count({
      where: {
        unidade: {
          planta_id: planta.id,
        },
        deleted_at: null,
      }
    });

    console.log(`\n${planta.nome}:`);
    console.log(`  - Unidades: ${numUnidades}`);
    console.log(`  - Equipamentos: ${numEquipamentos}`);
  }

  console.log('\n✅ Seed concluído com sucesso!');
}

seed()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    prisma.$disconnect();
    process.exit(1);
  });
