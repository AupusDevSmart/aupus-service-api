const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const mqttSchema = {
  "timestamp": "number",
  "inverter_id": "number",
  "info": {
    "device_type": "string",
    "nominal_power": "number",
    "output_type": "number"
  },
  "energy": {
    "daily_yield": "number",
    "total_yield": "number",
    "total_running_time": "number",
    "Potencia Aparente1": "number",
    "Potencia Aparente2": "number",
    "daily_running_time": "number"
  },
  "temperature": {
    "internal": "number"
  },
  "dc": {
    "mppt1_voltage": "number",
    "mppt2_voltage": "number",
    "mppt3_voltage": "number",
    "mppt4_voltage": "number",
    "mppt5_voltage": "number",
    "mppt6_voltage": "number",
    "mppt7_voltage": "number",
    "mppt8_voltage": "number",
    "mppt9_voltage": "number",
    "mppt10_voltage": "number",
    "mppt11_voltage": "number",
    "mppt12_voltage": "number",
    "string1_current": "number",
    "string2_current": "number",
    "string3_current": "number",
    "string4_current": "number",
    "string5_current": "number",
    "string6_current": "number",
    "string7_current": "number",
    "string8_current": "number",
    "string9_current": "number",
    "string10_current": "number",
    "string11_current": "number",
    "string12_current": "number",
    "string13_current": "number",
    "string14_current": "number",
    "string15_current": "number",
    "string16_current": "number",
    "string17_current": "number",
    "string18_current": "number",
    "string19_current": "number",
    "string20_current": "number",
    "string21_current": "number",
    "string22_current": "number",
    "string23_current": "number",
    "string24_current": "number",
    "total_power": "number"
  },
  "voltage": {
    "phase_a-b": "number",
    "phase_b-c": "number",
    "phase_c-a": "number"
  },
  "current": {
    "phase_a": "number",
    "phase_b": "number",
    "phase_c": "number"
  },
  "power": {
    "active_total": "number",
    "reactive_total": "number",
    "apparent_total": "number",
    "power_factor": "number",
    "frequency": "number"
  },
  "status": {
    "work_state": "number",
    "work_state_text": "string"
  },
  "protection": {
    "insulation_resistance": "number",
    "bus_voltage": "number"
  },
  "regulation": {
    "nominal_reactive_power": "number"
  },
  "pid": {
    "work_state": "number",
    "alarm_code": "number"
  }
};

async function runMigration() {
  try {
    console.log('🔄 Executando migration add_mqtt_schema...\n');

    // 1. Adicionar coluna se não existir
    console.log('1️⃣ Adicionando coluna mqtt_schema...');
    try {
      await prisma.$executeRaw`
        ALTER TABLE tipos_equipamentos
        ADD COLUMN IF NOT EXISTS mqtt_schema JSONB
      `;
      console.log('✅ Coluna mqtt_schema adicionada');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('ℹ️  Coluna mqtt_schema já existe');
      } else {
        throw error;
      }
    }

    // 2. Atualizar inversores com o schema
    console.log('\n2️⃣ Atualizando tipos de equipamento inversor com schema MQTT...');

    const result = await prisma.$executeRaw`
      UPDATE tipos_equipamentos
      SET mqtt_schema = ${JSON.stringify(mqttSchema)}::jsonb
      WHERE codigo = 'INVERSOR' OR nome ILIKE '%inversor%'
    `;

    console.log(`✅ ${result} tipo(s) de equipamento atualizado(s)`);

    // 3. Verificar tipos de equipamento com schema
    console.log('\n3️⃣ Verificando tipos de equipamento com mqtt_schema...');
    const tipos = await prisma.$queryRaw`
      SELECT id, codigo, nome,
             CASE WHEN mqtt_schema IS NOT NULL THEN 'SIM' ELSE 'NÃO' END as tem_schema
      FROM tipos_equipamentos
      WHERE mqtt_schema IS NOT NULL
      LIMIT 10
    `;

    console.log('\n📋 Tipos de equipamento com mqtt_schema:');
    tipos.forEach(tipo => {
      console.log(`  ✓ ${tipo.nome} (${tipo.codigo}): Schema configurado`);
    });

    console.log('\n✅ Migration concluída com sucesso!');

  } catch (error) {
    console.error('\n❌ Erro ao executar migration:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();
