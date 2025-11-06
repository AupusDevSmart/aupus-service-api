const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Dados mock baseados no JSON fornecido pelo usuário
const mockInversorData = {
  "timestamp": Date.now(),
  "inverter_id": 2,
  "info": {
    "device_type": "2c46",
    "nominal_power": 320,
    "output_type": 2
  },
  "energy": {
    "daily_yield": 2149.9,
    "total_yield": 267922,
    "total_running_time": 1364,
    "Potencia_Aparente1": 18629,
    "Potencia_Aparente2": 722731008,
    "daily_running_time": 705
  },
  "temperature": {
    "internal": 48.1
  },
  "dc": {
    "mppt1_voltage": 1102.8,
    "mppt2_voltage": 1112.9,
    "mppt3_voltage": 1106.5,
    "mppt4_voltage": 1119.5,
    "mppt5_voltage": 1072.6,
    "mppt6_voltage": 1078.2,
    "mppt7_voltage": 1095.5,
    "mppt8_voltage": 1103.3,
    "mppt9_voltage": 1097.7,
    "mppt10_voltage": 1115.2,
    "mppt11_voltage": 1118.2,
    "mppt12_voltage": 1118.1,
    "string1_current": 4240.5,
    "string2_current": 4240.5,
    "string3_current": 4240.5,
    "string4_current": 4240.5,
    "string5_current": 4240.5,
    "string6_current": 4240.5,
    "string7_current": 4240.5,
    "string8_current": 4240.5,
    "string9_current": 4240.5,
    "string10_current": 4240.5,
    "string11_current": 4240.5,
    "string12_current": 4240.5,
    "string13_current": 4240.5,
    "string14_current": 4240.5,
    "string15_current": 4240.5,
    "string16_current": 4240.5,
    "string17_current": 4240.5,
    "string18_current": 4240.5,
    "string19_current": 4240.5,
    "string20_current": 4240.5,
    "string21_current": 4240.5,
    "string22_current": 4240.5,
    "string23_current": 4240.5,
    "string24_current": 4240.5,
    "total_power": 19215
  },
  "voltage": {
    "phase_a-b": 787.8,
    "phase_b-c": 790.4,
    "phase_c-a": 796.8
  },
  "current": {
    "phase_a": 13.9,
    "phase_b": 14.1,
    "phase_c": 14.1
  },
  "power": {
    "active_total": 18629,
    "reactive_total": 0,
    "apparent_total": 18629,
    "power_factor": 1,
    "frequency": 60
  },
  "status": {
    "work_state": 0,
    "work_state_text": "Run"
  },
  "protection": {
    "insulation_resistance": 73,
    "bus_voltage": 1174.3
  },
  "regulation": {
    "nominal_reactive_power": 199.8
  },
  "pid": {
    "work_state": 0,
    "alarm_code": 0
  }
};

async function insertMockData() {
  try {
    console.log('🔄 Buscando equipamentos do tipo Inversor com MQTT habilitado...\n');

    // Buscar todos equipamentos inversores com MQTT habilitado
    const inversores = await prisma.equipamentos.findMany({
      where: {
        mqtt_habilitado: true,
        topico_mqtt: {
          not: null
        }
      },
      include: {
        tipo_equipamento_rel: true
      },
      take: 10
    });

    if (inversores.length === 0) {
      console.log('⚠️  Nenhum equipamento com MQTT habilitado encontrado!');
      console.log('\n💡 Para testar, você precisa:');
      console.log('   1. Ter um equipamento cadastrado');
      console.log('   2. Marcar mqtt_habilitado = true');
      console.log('   3. Definir um topico_mqtt');
      return;
    }

    console.log(`✅ Encontrados ${inversores.length} equipamento(s) com MQTT habilitado:\n`);
    inversores.forEach((inv, idx) => {
      console.log(`${idx + 1}. ${inv.nome} (ID: ${inv.id})`);
      console.log(`   Tipo: ${inv.tipo_equipamento_rel?.nome || 'N/A'}`);
      console.log(`   Tópico MQTT: ${inv.topico_mqtt}`);
      console.log('');
    });

    // Inserir dados para cada inversor
    console.log('📝 Inserindo dados mock para os equipamentos...\n');

    for (const inversor of inversores) {
      // Adicionar variação nos dados para cada equipamento
      const dataWithVariation = {
        ...mockInversorData,
        timestamp: Date.now(),
        inverter_id: Math.floor(Math.random() * 100),
        temperature: {
          internal: 40 + Math.random() * 20 // 40-60°C
        },
        power: {
          ...mockInversorData.power,
          active_total: Math.floor(15000 + Math.random() * 8000) // 15-23kW
        }
      };

      const result = await prisma.equipamentos_dados.create({
        data: {
          equipamento_id: inversor.id,
          dados: dataWithVariation,
          fonte: 'MQTT',
          qualidade: 'GOOD',
          timestamp_dados: new Date()
        }
      });

      console.log(`✅ Dado inserido para ${inversor.nome} (ID: ${result.id})`);
    }

    console.log('\n✅ Dados mock inseridos com sucesso!');
    console.log('\n📊 Para visualizar os dados, acesse:');
    inversores.forEach(inv => {
      console.log(`   http://localhost:3000/api/v1/equipamentos-dados/${inv.id}/latest`);
    });

  } catch (error) {
    console.error('\n❌ Erro ao inserir dados mock:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

insertMockData();
