const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Migrando estrutura: Adicionar mqtt_schema e remover categoria antiga...\n');

  try {
    // STEP 1: Adicionar coluna mqtt_schema
    console.log('📝 STEP 1: Adicionando coluna mqtt_schema...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE tipos_equipamentos
      ADD COLUMN IF NOT EXISTS mqtt_schema JSONB;
    `);
    console.log('✅ Coluna mqtt_schema adicionada\n');

    // STEP 2: Migrar schemas MQTT do METER_M160, INVERSOR e PIVO
    console.log('📝 STEP 2: Migrando schemas MQTT...');

    // METER_M160
    await prisma.$executeRawUnsafe(`
      UPDATE tipos_equipamentos
      SET mqtt_schema = propriedades_schema,
          propriedades_schema = NULL
      WHERE codigo = 'METER_M160'
        AND propriedades_schema IS NOT NULL
        AND propriedades_schema->>'type' = 'object';
    `);
    console.log('   ✅ METER_M160 migrado');

    // INVERSOR
    await prisma.$executeRawUnsafe(`
      UPDATE tipos_equipamentos
      SET mqtt_schema = propriedades_schema,
          propriedades_schema = NULL
      WHERE codigo = 'INVERSOR'
        AND propriedades_schema IS NOT NULL
        AND propriedades_schema->>'type' = 'object';
    `);
    console.log('   ✅ INVERSOR migrado');

    // PIVO
    await prisma.$executeRawUnsafe(`
      UPDATE tipos_equipamentos
      SET mqtt_schema = propriedades_schema,
          propriedades_schema = NULL
      WHERE codigo = 'PIVO'
        AND propriedades_schema IS NOT NULL
        AND propriedades_schema->>'type' = 'object';
    `);
    console.log('   ✅ PIVO migrado\n');

    // STEP 3: Remover coluna categoria antiga (STRING)
    console.log('📝 STEP 3: Removendo coluna categoria antiga (STRING)...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE tipos_equipamentos
      DROP COLUMN IF EXISTS categoria;
    `);
    console.log('✅ Coluna categoria antiga removida\n');

    // STEP 4: Verificar resultado
    console.log('📊 Verificando resultado...\n');
    const tipos = await prisma.$queryRaw`
      SELECT
        codigo,
        nome,
        CASE
          WHEN propriedades_schema IS NOT NULL THEN '✅ Campos Técnicos'
          ELSE '❌ Sem campos'
        END as tem_campos_tecnicos,
        CASE
          WHEN mqtt_schema IS NOT NULL THEN '🔌 MQTT Schema'
          ELSE '❌ Sem MQTT'
        END as tem_mqtt
      FROM tipos_equipamentos
      WHERE propriedades_schema IS NOT NULL OR mqtt_schema IS NOT NULL
      ORDER BY nome;
    `;

    console.log('Tipos com schemas definidos:');
    tipos.forEach(tipo => {
      console.log(`  ${tipo.codigo.trim()}: ${tipo.tem_campos_tecnicos} | ${tipo.tem_mqtt}`);
    });

    console.log('\n🎉 Migração concluída com sucesso!');
  } catch (error) {
    console.error('\n❌ Erro:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
