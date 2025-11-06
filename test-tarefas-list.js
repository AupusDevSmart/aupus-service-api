const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testTarefasList() {
  try {
    console.log('🧪 Testando listagem de tarefas após regeneração do Prisma Client...\n');

    const tarefas = await prisma.tarefas.findMany({
      include: {
        plano_manutencao: {
          select: {
            id: true,
            nome: true
          }
        }
      }
    });

    console.log(`✅ Listagem de tarefas funcionando!`);
    console.log(`📋 Total de tarefas: ${tarefas.length}\n`);

    tarefas.forEach((tarefa, index) => {
      console.log(`${index + 1}. ${tarefa.nome}`);
      console.log(`   ID: ${tarefa.id} (${tarefa.id.length} chars)`);
      console.log(`   Plano: ${tarefa.plano_manutencao?.nome || 'N/A'}`);
      console.log(`   ID válido: ${tarefa.id.length === 26 && tarefa.id === tarefa.id.trim() ? '✅ SIM' : '❌ NÃO'}`);
      console.log('');
    });

    console.log('✅ Teste concluído com sucesso!');
    console.log('✅ Erro "plano_manutencao is required but got null" foi resolvido!');

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testTarefasList();
