const { readFileSync } = require('fs');
const { join } = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Executando seed de tipos de equipamentos...\n');

  try {
    // Ler o arquivo SQL
    const sqlPath = join(__dirname, '..', 'prisma', 'seed-tipos-equipamentos-completo.sql');
    const sql = readFileSync(sqlPath, 'utf-8');

    // Separar os comandos SQL (ignorar comentários e queries SELECT finais)
    const commands = sql
      .split('\n')
      .filter(line => !line.trim().startsWith('--') && line.trim() !== '')
      .join('\n')
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd && cmd.toUpperCase().startsWith('INSERT'));

    console.log(`📝 Encontrados ${commands.length} comandos INSERT\n`);

    // Executar cada comando
    for (const [index, command] of commands.entries()) {
      try {
        await prisma.$executeRawUnsafe(command);
        console.log(`✅ [${index + 1}/${commands.length}] Executado com sucesso`);
      } catch (error) {
        if (error.code === 'P2002') {
          console.log(`⚠️  [${index + 1}/${commands.length}] Registro já existe (atualizado)`);
        } else {
          console.error(`❌ [${index + 1}/${commands.length}] Erro:`, error.message);
        }
      }
    }

    // Verificar resultados
    console.log('\n📊 Verificando dados inseridos...\n');

    const estatisticas = await prisma.$queryRaw`
      SELECT
        categoria,
        COUNT(*) as quantidade
      FROM tipos_equipamentos
      GROUP BY categoria
      ORDER BY categoria
    `;

    console.log('Tipos por categoria:');
    for (const stat of estatisticas) {
      console.log(`  ${stat.categoria}: ${stat.quantidade} tipos`);
    }

    const total = await prisma.tipos_equipamentos.count();
    console.log(`\n✅ Total de tipos de equipamentos: ${total}`);

    // Verificar tipos com campos técnicos
    const comCampos = await prisma.$queryRaw`
      SELECT
        codigo,
        nome,
        jsonb_array_length(propriedades_schema->'campos') as num_campos
      FROM tipos_equipamentos
      WHERE propriedades_schema IS NOT NULL
        AND propriedades_schema->'campos' IS NOT NULL
      ORDER BY num_campos DESC
      LIMIT 5
    `;

    console.log('\n📋 Tipos com mais campos técnicos:');
    for (const tipo of comCampos) {
      console.log(`  ${tipo.codigo} (${tipo.nome}): ${tipo.num_campos} campos`);
    }

    console.log('\n🎉 Seed executado com sucesso!');
  } catch (error) {
    console.error('\n❌ Erro ao executar seed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
