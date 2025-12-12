// Verificar qual model_type está sendo usado
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkModelTypes() {
  console.log('🔍 Verificando model_types usados...\n');

  try {
    // Ver todos os model_types na tabela
    const modelTypes = await prisma.$queryRaw`
      SELECT DISTINCT model_type, COUNT(*) as count
      FROM model_has_roles
      GROUP BY model_type
    `;

    console.log('📊 Model types encontrados:');
    if (Array.isArray(modelTypes)) {
      modelTypes.forEach((mt: any) => {
        console.log(`   - ${mt.model_type}: ${mt.count} registros`);
      });
    }

    // Ver alguns exemplos
    console.log('\n📋 Exemplos de registros:');
    const examples = await prisma.$queryRaw`
      SELECT mhr.*, r.name as role_name
      FROM model_has_roles mhr
      JOIN roles r ON r.id = mhr.role_id
      LIMIT 5
    `;

    if (Array.isArray(examples)) {
      examples.forEach((ex: any, i: number) => {
        console.log(`\n${i+1}. Model: ${ex.model_type}`);
        console.log(`   Model ID: ${ex.model_id}`);
        console.log(`   Role: ${ex.role_name} (ID: ${ex.role_id})`);
      });
    }

    // Verificar especificamente o admin
    console.log('\n🔍 Buscando registros do admin (k6g72ojagrl415bsak6y68qi96)...');
    const adminRecords = await prisma.$queryRaw`
      SELECT *
      FROM model_has_roles
      WHERE model_id = 'k6g72ojagrl415bsak6y68qi96'
    `;

    if (Array.isArray(adminRecords) && adminRecords.length > 0) {
      console.log(`✅ Encontrado ${adminRecords.length} registros`);
      adminRecords.forEach((r: any) => {
        console.log(`   - Role ID: ${r.role_id}, Model Type: ${r.model_type}`);
      });
    } else {
      console.log('⚠️  Nenhum registro encontrado para o admin');
    }

  } catch (error: any) {
    console.error('❌ Erro:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkModelTypes().catch(console.error);
