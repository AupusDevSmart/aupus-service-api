const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkEncoding() {
  console.log('========================================');
  console.log('Verificando Encoding do Banco de Dados');
  console.log('========================================');
  console.log('');

  try {
    await prisma.$connect();

    // Verifica encoding do banco
    const encodingInfo = await prisma.$queryRaw`
      SELECT
        pg_encoding_to_char(encoding) as database_encoding,
        datcollate as collate,
        datctype as ctype
      FROM pg_database
      WHERE datname = current_database()
    `;

    console.log('Configuração do Banco:');
    console.log('----------------------------------------');
    console.log(encodingInfo[0]);
    console.log('');

    // Busca dados com acentuação para testar
    const testData = await prisma.$queryRaw`
      SELECT
        'Goiânia' as teste_direto,
        cidade,
        logradouro,
        bairro
      FROM enderecos
      WHERE cidade LIKE '%Go%' OR cidade LIKE '%Catal%' OR cidade LIKE '%Bras%'
      LIMIT 10
    `;

    console.log('Teste de Acentuação - Dados do Banco:');
    console.log('----------------------------------------');
    testData.forEach((row, i) => {
      console.log(`${i + 1}. Cidade: "${row.cidade}"`);
      console.log(`   Logradouro: "${row.logradouro}"`);
      console.log(`   Bairro: "${row.bairro}"`);
      console.log(`   Teste direto SQL: "${row.teste_direto}"`);
      console.log('');
    });

    // Verifica encoding das tabelas
    const tableEncoding = await prisma.$queryRaw`
      SELECT
        schemaname,
        tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename IN ('unidades_consumidoras', 'usuarios', 'equipamentos')
      LIMIT 5
    `;

    console.log('Tabelas no schema public:');
    console.log('----------------------------------------');
    console.log(tableEncoding);
    console.log('');

  } catch (error) {
    console.error('ERRO:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkEncoding();
