const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function reverter() {
  try {
    console.log('🔙 REVERTENDO alterações nos inversores...\n');

    // Mapeamento dos valores originais
    const reversoes = [
      { nome: 'Inversor Central 1 - UFV Solar Power Norte', tipo_original: null },
      { nome: 'Inversor Central 2 - UFV Solar Power Norte', tipo_original: null },
      { nome: 'Inversor 1 - Teste', tipo_original: 'cltest001' },
      { nome: 'Inversor Central - Inversor Central Solar', tipo_original: null },
      { nome: 'Inversor 2 - Teste', tipo_original: 'cltest001' },
      { nome: 'Medidor DC - Inversor Central Solar', tipo_original: null },
      { nome: 'Medidor AC - Inversor Central Solar', tipo_original: null },
      { nome: 'Inversor Central 1 - UFV Solar Power Sul', tipo_original: null },
      { nome: 'Inversor 3 - Teste', tipo_original: 'cltest001' },
      { nome: 'Inversor 2', tipo_original: 'INVERSOR' },
      { nome: 'Inversor 3', tipo_original: 'INVERSOR' },
      { nome: 'Inversor Central 1 - UFV Principal SP', tipo_original: null },
      { nome: 'INVERSOR 1', tipo_original: 'INVERSOR' },
      { nome: 'inversor 1', tipo_original: 'INVERSOR' },
      { nome: 'Inversor Central 2 - UFV Principal SP', tipo_original: null },
      { nome: 'INVERSOR 2', tipo_original: 'INVERSOR' },
      { nome: 'Inversor 1', tipo_original: 'INVERSOR' },
      { nome: 'Inversor Central - Inversor Central SP', tipo_original: null },
      { nome: 'Medidor DC - Inversor Central SP', tipo_original: null },
      { nome: 'Medidor AC - Inversor Central SP', tipo_original: null },
      { nome: 'Inversor Central 1 - UFV Porto Rio', tipo_original: null },
      { nome: 'Inversor Central 2 - UFV Porto Rio', tipo_original: null },
      { nome: 'Inversor Central 2 - UFV Solar Power Sul', tipo_original: null },
    ];

    let revertidos = 0;

    for (const rev of reversoes) {
      const equipamento = await prisma.equipamentos.findFirst({
        where: { nome: rev.nome }
      });

      if (equipamento) {
        await prisma.equipamentos.update({
          where: { id: equipamento.id },
          data: { tipo_equipamento: rev.tipo_original }
        });
        revertidos++;
        console.log(`✅ ${rev.nome} → "${rev.tipo_original}"`);
      }
    }

    // Para os que tinham nome duplicado (inversor 1 aparece 2x), reverter todos com tipo INVERSOR_SOLAR
    await prisma.equipamentos.updateMany({
      where: {
        tipo_equipamento: 'INVERSOR_SOLAR',
        nome: 'inversor 1'
      },
      data: {
        tipo_equipamento: 'INVERSOR'
      }
    });

    await prisma.equipamentos.updateMany({
      where: {
        tipo_equipamento: 'INVERSOR_SOLAR',
        nome: 'Inversor 3'
      },
      data: {
        tipo_equipamento: null
      }
    });

    console.log(`\n🎉 ${revertidos} inversores revertidos!`);

  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

reverter();
