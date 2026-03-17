const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createMissingEnums() {
  console.log('🚀 Criando enums faltantes...\n');

  try {
    // Verificar quais enums já existem
    const existingEnums = await prisma.$queryRaw`
      SELECT typname FROM pg_type WHERE typname IN (
        'StatusSolicitacaoServico',
        'TipoSolicitacaoServico',
        'PrioridadeSolicitacao',
        'OrigemSolicitacao'
      );
    `;

    const existing = existingEnums.map(e => e.typname.toLowerCase());
    console.log(`Enums já existentes: ${existing.join(', ')}\n`);

    // Criar StatusSolicitacaoServico se não existir
    if (!existing.includes('statussolicitacaoservico')) {
      console.log('📌 Criando enum StatusSolicitacaoServico...');
      await prisma.$executeRawUnsafe(`
        CREATE TYPE "StatusSolicitacaoServico" AS ENUM (
          'RASCUNHO',
          'AGUARDANDO',
          'EM_ANALISE',
          'APROVADA',
          'REJEITADA',
          'CANCELADA',
          'OS_GERADA',
          'CONCLUIDA'
        )
      `);
      console.log('   ✅ Criado com sucesso\n');
    }

    // Criar TipoSolicitacaoServico se não existir
    if (!existing.includes('tiposolicitacaoservico')) {
      console.log('📌 Criando enum TipoSolicitacaoServico...');
      await prisma.$executeRawUnsafe(`
        CREATE TYPE "TipoSolicitacaoServico" AS ENUM (
          'INSTALACAO',
          'MANUTENCAO_PREVENTIVA',
          'MANUTENCAO_CORRETIVA',
          'INSPECAO',
          'CALIBRACAO',
          'MODIFICACAO',
          'REMOCAO',
          'CONSULTORIA',
          'TREINAMENTO',
          'OUTRO'
        )
      `);
      console.log('   ✅ Criado com sucesso\n');
    }

    // Criar PrioridadeSolicitacao se não existir
    if (!existing.includes('prioridadesolicitacao')) {
      console.log('📌 Criando enum PrioridadeSolicitacao...');
      await prisma.$executeRawUnsafe(`
        CREATE TYPE "PrioridadeSolicitacao" AS ENUM (
          'BAIXA',
          'MEDIA',
          'ALTA',
          'URGENTE',
          'CRITICA'
        )
      `);
      console.log('   ✅ Criado com sucesso\n');
    }

    // Criar OrigemSolicitacao se não existir
    if (!existing.includes('origemsolicitacao')) {
      console.log('📌 Criando enum OrigemSolicitacao...');
      await prisma.$executeRawUnsafe(`
        CREATE TYPE "OrigemSolicitacao" AS ENUM (
          'PORTAL',
          'EMAIL',
          'TELEFONE',
          'PRESENCIAL',
          'SISTEMA',
          'APLICATIVO'
        )
      `);
      console.log('   ✅ Criado com sucesso\n');
    }

    // Verificar novamente
    const finalCheck = await prisma.$queryRaw`
      SELECT typname FROM pg_type WHERE typname IN (
        'StatusSolicitacaoServico',
        'TipoSolicitacaoServico',
        'PrioridadeSolicitacao',
        'OrigemSolicitacao'
      );
    `;

    console.log('\n✅ Enums verificados:');
    finalCheck.forEach(e => console.log(`   - ${e.typname}`));

    console.log('\n✨ Todos os enums necessários estão presentes!');

  } catch (error) {
    console.error('❌ Erro ao criar enums:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createMissingEnums();