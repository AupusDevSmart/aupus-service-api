const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testConnection() {
  console.log('========================================');
  console.log('Testando conexao com banco de dados local');
  console.log('========================================');
  console.log('');

  try {
    // Testa conexão básica
    console.log('1. Testando conexao...');
    await prisma.$connect();
    console.log('   ✓ Conexao estabelecida com sucesso!');
    console.log('');

    // Conta total de usuários
    console.log('2. Contando registros...');
    const userCount = await prisma.usuarios.count();
    console.log(`   ✓ Total de usuarios: ${userCount}`);

    const organizacaoCount = await prisma.organizacoes.count();
    console.log(`   ✓ Total de organizacoes: ${organizacaoCount}`);

    const unidadeCount = await prisma.unidades_consumidoras.count();
    console.log(`   ✓ Total de unidades consumidoras: ${unidadeCount}`);

    const concessionariaCount = await prisma.concessionarias.count();
    console.log(`   ✓ Total de concessionarias: ${concessionariaCount}`);
    console.log('');

    // Busca um usuário exemplo
    console.log('3. Buscando dados de exemplo...');
    const firstUser = await prisma.usuarios.findFirst({
      select: {
        id: true,
        nome: true,
        email: true,
        created_at: true
      }
    });

    if (firstUser) {
      console.log('   ✓ Usuario encontrado:');
      console.log(`     ID: ${firstUser.id}`);
      console.log(`     Nome: ${firstUser.nome}`);
      console.log(`     Email: ${firstUser.email}`);
      console.log(`     Criado em: ${firstUser.created_at}`);
    }
    console.log('');

    console.log('========================================');
    console.log('✓ TESTE CONCLUIDO COM SUCESSO!');
    console.log('========================================');
    console.log('');
    console.log('O banco de dados local esta funcionando corretamente!');
    console.log('Voce pode agora rodar a aplicacao normalmente.');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('========================================');
    console.error('✗ ERRO ao conectar no banco de dados!');
    console.error('========================================');
    console.error('');
    console.error('Erro:', error.message);
    console.error('');
    console.error('Verifique se:');
    console.error('1. O container PostgreSQL esta rodando (docker ps)');
    console.error('2. A DATABASE_URL no .env esta correta');
    console.error('3. O banco foi restaurado corretamente');
    console.error('');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
