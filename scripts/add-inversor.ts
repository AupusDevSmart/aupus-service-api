import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const unidadeId = 'cmgphtxx2000n2fz44wj4e6ax';

  console.log('🔍 Consultando equipamentos da unidade:', unidadeId);

  // Buscar todos os equipamentos da unidade
  const equipamentos = await prisma.equipamentos.findMany({
    where: {
      unidade_id: unidadeId,
      deleted_at: null,
    },
    orderBy: {
      created_at: 'asc',
    },
  });

  console.log('\n📋 Equipamentos encontrados:');
  console.log('=====================================');
  equipamentos.forEach((eq, index) => {
    console.log(`${index + 1}. ${eq.nome}`);
    console.log(`   ID: ${eq.id}`);
    console.log(`   Classificação: ${eq.classificacao}`);
    console.log(`   Tipo: ${eq.tipo_equipamento || 'N/A'}`);
    console.log(`   Criado em: ${eq.created_at}`);
    console.log('---');
  });

  console.log(`\n📊 Total: ${equipamentos.length} equipamentos`);

  // Buscar tipos de equipamento disponíveis (inversores)
  console.log('\n🔍 Buscando tipos de equipamento (inversores)...');
  const tiposInversor = await prisma.tipos_equipamentos.findMany({
    where: {
      OR: [
        { nome: { contains: 'inversor', mode: 'insensitive' } },
        { codigo: { contains: 'inv', mode: 'insensitive' } },
      ],
    },
  });

  console.log('\n📋 Tipos de inversor disponíveis:');
  tiposInversor.forEach((tipo) => {
    console.log(`- ${tipo.nome} (ID: ${tipo.id}, Código: ${tipo.codigo})`);
  });

  if (tiposInversor.length === 0) {
    console.log('\n⚠️  Nenhum tipo de inversor encontrado no banco.');
    console.log('Listando todos os tipos de equipamento disponíveis:');

    const todosTipos = await prisma.tipos_equipamentos.findMany({
      orderBy: { nome: 'asc' },
    });

    todosTipos.forEach((tipo) => {
      console.log(`- ${tipo.nome} (ID: ${tipo.id}, Código: ${tipo.codigo})`);
    });
  }

  // Buscar informações da unidade
  const unidade = await prisma.unidades.findUnique({
    where: { id: unidadeId },
  });

  if (unidade) {
    console.log('\n📍 Informações da unidade:');
    console.log(`Nome: ${unidade.nome}`);
    console.log(`Planta ID: ${unidade.planta_id || 'N/A'}`);
  }

  // Se houver inversores disponíveis, criar um novo
  if (tiposInversor.length > 0) {
    const tipoInversor = tiposInversor[0];
    const numeroInversor = equipamentos.filter(
      (eq) => eq.nome.toLowerCase().includes('inversor')
    ).length + 1;

    console.log('\n➕ Criando novo inversor...');

    const novoInversor = await prisma.equipamentos.create({
      data: {
        nome: `Inversor ${numeroInversor}`,
        classificacao: 'UAR',
        unidade_id: unidadeId,
        planta_id: unidade?.planta_id || null,
        tipo_equipamento_id: tipoInversor.id,
        criticidade: 'A',
        status: 'NORMAL',
        mqtt_habilitado: false,
        localizacao: unidade?.nome || 'Unidade',
      },
    });

    console.log('✅ Inversor criado com sucesso!');
    console.log(`   ID: ${novoInversor.id}`);
    console.log(`   Nome: ${novoInversor.nome}`);
    console.log(`   Tipo: ${tipoInversor.nome}`);
  }
}

main()
  .catch((e) => {
    console.error('❌ Erro:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
