const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function insertMockData() {
  try {
    console.log('🚀 Inserindo dados MQTT de teste para inversores...\n');

    // IDs dos inversores da unidade cmhcfvf5k0001jqo8nff75bcv
    const inversores = [
      'cmhcfyoj30003jqo8bhhaexlp', // Inversor 1
      'cmhdd6wkv001kjqo8rl39taa6', // Inversor 2
      'cmhddtv0h0024jqo8h4dzm4gq', // Inversor 3
    ];

    for (const inversorId of inversores) {
      // Dados completos estruturados conforme o tipo InversorMqttData
      const mockData = {
        timestamp: new Date().toISOString(),
        inverter_id: 1,
        info: {
          device_type: 'SG350HX',
          nominal_power: 350000,
          output_type: 1,
        },
        energy: {
          daily_yield: 1850.5 + Math.random() * 50,
          total_yield: 1250000 + Math.random() * 1000,
          total_running_time: 45678,
          Potencia_Aparente1: 298.5,
          Potencia_Aparente2: 298.2,
          daily_running_time: 450,
        },
        temperature: {
          internal: 45.2 + Math.random() * 5,
        },
        dc: {
          mppt1_voltage: 620.5 + Math.random() * 5,
          mppt2_voltage: 618.3 + Math.random() * 5,
          mppt3_voltage: 622.1 + Math.random() * 5,
          mppt4_voltage: 619.8 + Math.random() * 5,
          mppt5_voltage: 621.3 + Math.random() * 5,
          mppt6_voltage: 617.9 + Math.random() * 5,
          mppt7_voltage: 620.2 + Math.random() * 5,
          mppt8_voltage: 619.5 + Math.random() * 5,
          mppt9_voltage: 621.8 + Math.random() * 5,
          mppt10_voltage: 618.7 + Math.random() * 5,
          mppt11_voltage: 622.3 + Math.random() * 5,
          mppt12_voltage: 619.1 + Math.random() * 5,
          string1_current: 8.5 + Math.random() * 1,
          string2_current: 8.3 + Math.random() * 1,
          string3_current: 8.7 + Math.random() * 1,
          string4_current: 8.4 + Math.random() * 1,
          string5_current: 8.6 + Math.random() * 1,
          string6_current: 8.2 + Math.random() * 1,
          string7_current: 8.8 + Math.random() * 1,
          string8_current: 8.5 + Math.random() * 1,
          string9_current: 8.4 + Math.random() * 1,
          string10_current: 8.6 + Math.random() * 1,
          string11_current: 8.3 + Math.random() * 1,
          string12_current: 8.7 + Math.random() * 1,
          string13_current: 8.5 + Math.random() * 1,
          string14_current: 8.4 + Math.random() * 1,
          string15_current: 8.6 + Math.random() * 1,
          string16_current: 8.3 + Math.random() * 1,
          string17_current: 8.8 + Math.random() * 1,
          string18_current: 8.2 + Math.random() * 1,
          string19_current: 8.7 + Math.random() * 1,
          string20_current: 8.5 + Math.random() * 1,
          string21_current: 8.4 + Math.random() * 1,
          string22_current: 8.6 + Math.random() * 1,
          string23_current: 8.3 + Math.random() * 1,
          string24_current: 8.7 + Math.random() * 1,
          total_power: 295500 + Math.random() * 10000,
        },
        voltage: {
          'phase_a-b': 380.5 + Math.random() * 5,
          'phase_b-c': 381.2 + Math.random() * 5,
          'phase_c-a': 379.8 + Math.random() * 5,
        },
        current: {
          phase_a: 450.3 + Math.random() * 10,
          phase_b: 448.7 + Math.random() * 10,
          phase_c: 451.2 + Math.random() * 10,
        },
        power: {
          active_total: 295200 + Math.random() * 10000,
          reactive_total: 12300 + Math.random() * 5000,
          apparent_total: 296500 + Math.random() * 10000,
          power_factor: 0.98 + Math.random() * 0.02,
          frequency: 60.0 + Math.random() * 0.1,
        },
        status: {
          work_state: 0,
          work_state_text: 'Run',
        },
        protection: {
          insulation_resistance: 1500 + Math.random() * 100,
          bus_voltage: 850 + Math.random() * 50,
        },
        regulation: {
          nominal_reactive_power: 0,
        },
        pid: {
          work_state: 0,
          alarm_code: 0,
        },
      };

      const result = await prisma.equipamentos_dados.create({
        data: {
          equipamento_id: inversorId,
          dados: mockData,
          timestamp_dados: new Date(),
          fonte: 'MQTT',
        },
      });

      console.log(`✅ Dados inseridos para inversor ${inversorId}`);
    }

    console.log('\n🎉 Dados de teste inseridos com sucesso!');
    console.log('\n📝 Agora você pode:');
    console.log('1. Recarregar a página do sinóptico (F5)');
    console.log('2. Clicar em qualquer inversor');
    console.log('3. Ver os dados MQTT em tempo real no modal!');
  } catch (error) {
    console.error('❌ Erro ao inserir dados:', error);
  } finally {
    await prisma.$disconnect();
  }
}

insertMockData();
