/**
 * Script para limpar TODOS os diagramas e conexões do banco de dados
 * Prepara o banco para usar apenas o sistema V2
 * 
 * Uso: node limpar-diagramas.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function limparDiagramas() {
  console.log('🗑️  Iniciando limpeza de diagramas...\n');

  try {
    // 1. Deletar todas as conexões
    console.log('1️⃣  Deletando conexões...');
    const conexoesDeletadas = await prisma.equipamentos_conexoes.deleteMany({});
    console.log(`   ✅ ${conexoesDeletadas.count} conexões deletadas\n`);

    // 2. Deletar todos os diagramas
    console.log('2️⃣  Deletando diagramas...');
    const diagramasDeletados = await prisma.diagramas_unitarios.deleteMany({});
    console.log(`   ✅ ${diagramasDeletados.count} diagramas deletados\n`);

    // 3. Limpar posições dos equipamentos
    console.log('3️⃣  Limpando posições dos equipamentos...');
    const equipamentosAtualizados = await prisma.equipamentos.updateMany({
      where: {
        OR: [
          { diagrama_id: { not: null } },
          { posicao_x: { not: null } },
          { posicao_y: { not: null } },
        ]
      },
      data: {
        diagrama_id: null,
        posicao_x: null,
        posicao_y: null,
        rotacao: 0,
        label_position: 'top',
        label_offset_x: null,
        label_offset_y: null,
      }
    });
    console.log(`   ✅ ${equipamentosAtualizados.count} equipamentos limpos\n`);

    // 4. Verificar resultado
    console.log('4️⃣  Verificando resultado...');
    const [conexoes, diagramas, eqDiagrama, eqPosicao] = await Promise.all([
      prisma.equipamentos_conexoes.count(),
      prisma.diagramas_unitarios.count(),
      prisma.equipamentos.count({ where: { diagrama_id: { not: null } } }),
      prisma.equipamentos.count({ 
        where: { 
          OR: [
            { posicao_x: { not: null } },
            { posicao_y: { not: null } }
          ]
        } 
      }),
    ]);

    console.log('\n📊 RESULTADO FINAL:');
    console.log(`   Conexões restantes: ${conexoes}`);
    console.log(`   Diagramas restantes: ${diagramas}`);
    console.log(`   Equipamentos em diagrama: ${eqDiagrama}`);
    console.log(`   Equipamentos com posição: ${eqPosicao}`);

    if (conexoes === 0 && diagramas === 0 && eqDiagrama === 0 && eqPosicao === 0) {
      console.log('\n✅ SUCESSO! Banco de dados limpo e pronto para V2!');
    } else {
      console.log('\n⚠️  AVISO: Alguns dados ainda restam no banco!');
    }

  } catch (error) {
    console.error('\n❌ ERRO ao limpar diagramas:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar
limparDiagramas()
  .then(() => {
    console.log('\n🎉 Processo concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Falha na execução:', error);
    process.exit(1);
  });
