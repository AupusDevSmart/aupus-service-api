/**
 * Script para adicionar categoria "Carregador Elétrico" e tipo "Carregador Elétrico Genérico"
 *
 * Uso: node scripts/add-carregador-eletrico.js
 */

const { PrismaClient } = require('@prisma/client');
const { createId } = require('@paralleldrive/cuid2');

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando script para adicionar Carregador Elétrico...\n');

  try {
    // 1. Verificar se a categoria já existe
    console.log('📋 Verificando se categoria já existe...');
    const categoriaExistente = await prisma.categorias_equipamentos.findFirst({
      where: {
        nome: {
          in: ['Carregador Elétrico', 'CARREGADOR_ELETRICO', 'Carregador Eletrico']
        }
      }
    });

    let categoria;
    if (categoriaExistente) {
      console.log('✅ Categoria já existe:', categoriaExistente.nome);
      categoria = categoriaExistente;
    } else {
      // 2. Criar a categoria
      console.log('➕ Criando categoria "Carregador Elétrico"...');
      categoria = await prisma.categorias_equipamentos.create({
        data: {
          id: createId(),
          nome: 'Carregador Elétrico'
        }
      });
      console.log('✅ Categoria criada:', categoria.nome, '(ID:', categoria.id + ')');
    }

    // 3. Verificar se o tipo já existe
    console.log('\n📋 Verificando se tipo já existe...');
    const tipoExistente = await prisma.tipos_equipamentos.findFirst({
      where: {
        OR: [
          { codigo: 'CARREGADOR_ELETRICO' },
          { nome: 'Carregador Elétrico Genérico' }
        ]
      }
    });

    if (tipoExistente) {
      console.log('✅ Tipo já existe:', tipoExistente.nome);
    } else {
      // 4. Criar o tipo
      console.log('➕ Criando tipo "Carregador Elétrico Genérico"...');
      const tipo = await prisma.tipos_equipamentos.create({
        data: {
          id: createId(),
          codigo: 'CARREGADOR_ELETRICO',
          nome: 'Carregador Elétrico Genérico',
          categoria_id: categoria.id,
          fabricante: 'Genérico',
          largura_padrao: 80,  // 2x2
          altura_padrao: 80    // 2x2
        }
      });
      console.log('✅ Tipo criado:', tipo.nome, '(Código:', tipo.codigo + ')');
    }

    console.log('\n🎉 Script executado com sucesso!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📦 Categoria: Carregador Elétrico');
    console.log('🔧 Tipo: Carregador Elétrico Genérico (CARREGADOR_ELETRICO)');
    console.log('📐 Tamanho padrão: 2x2 (80x80px)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch (error) {
    console.error('\n❌ Erro ao executar script:');
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
