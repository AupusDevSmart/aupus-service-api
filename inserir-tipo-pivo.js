const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inserirTipoPivo() {
  try {
    console.log('🚀 Inserindo tipo PIVO no banco de dados...\n');

    // Verificar se já existe
    const tipoExistente = await prisma.tipos_equipamentos.findFirst({
      where: {
        codigo: 'PIVO'
      }
    });

    if (tipoExistente) {
      console.log('⚠️ Tipo PIVO já existe no banco!');
      console.log('   ID:', tipoExistente.id);
      console.log('   Nome:', tipoExistente.nome);
      return;
    }

    // Criar o tipo PIVO
    const novoPivo = await prisma.tipos_equipamentos.create({
      data: {
        id: '01JAQTE1PIVO0000000000033',
        codigo: 'PIVO',
        nome: 'Pivô Central de Irrigação',
        categoria: 'IRRIGACAO',
        largura_padrao: 48,
        altura_padrao: 48,
        icone_svg: null,
        propriedades_schema: {
          campos: [
            {
              nome: 'estado',
              tipo: 'select',
              label: 'Estado',
              opcoes: ['ABERTO', 'FECHADO'],
              padrao: 'ABERTO'
            },
            {
              nome: 'velocidadeRotacao',
              tipo: 'number',
              label: 'Velocidade de Rotação (RPM)',
              min: 0,
              max: 10,
              padrao: 2
            },
            {
              nome: 'pressaoAgua',
              tipo: 'number',
              label: 'Pressão da Água (bar)',
              min: 0,
              max: 10,
              padrao: 3.5
            },
            {
              nome: 'vazaoAgua',
              tipo: 'number',
              label: 'Vazão de Água (m³/h)',
              min: 0,
              max: 500,
              padrao: 120
            },
            {
              nome: 'areaIrrigada',
              tipo: 'number',
              label: 'Área Irrigada (hectares)',
              min: 0,
              max: 200,
              padrao: 50
            },
            {
              nome: 'modoOperacao',
              tipo: 'select',
              label: 'Modo de Operação',
              opcoes: ['AUTOMATICO', 'MANUAL'],
              padrao: 'AUTOMATICO'
            }
          ]
        }
      }
    });

    console.log('✅ Tipo PIVO inserido com sucesso!');
    console.log('   ID:', novoPivo.id);
    console.log('   Código:', novoPivo.codigo);
    console.log('   Nome:', novoPivo.nome);
    console.log('   Categoria:', novoPivo.categoria);
    console.log('   Tamanho:', `${novoPivo.largura_padrao}x${novoPivo.altura_padrao}`);
    console.log('\n📝 Agora você pode cadastrar equipamentos do tipo PIVO na interface!');

  } catch (error) {
    console.error('❌ Erro ao inserir tipo PIVO:', error);
  } finally {
    await prisma.$disconnect();
  }
}

inserirTipoPivo()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Erro fatal:', error);
    process.exit(1);
  });