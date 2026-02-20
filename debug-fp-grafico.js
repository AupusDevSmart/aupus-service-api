const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugFP() {
  try {
    const eq = await prisma.equipamentos.findFirst({ where: { nome: 'P666' } });

    const agora = new Date();
    const horaAtras = new Date(agora);
    horaAtras.setHours(horaAtras.getHours() - 1);

    const dados = await prisma.equipamentos_dados.findMany({
      where: {
        equipamento_id: eq.id,
        timestamp_dados: {
          gte: horaAtras,
          lt: agora,
        },
      },
      orderBy: { timestamp_dados: 'asc' },
      select: { timestamp_dados: true, dados: true }
    });

    console.log(`\n📊 DEBUG FATOR DE POTÊNCIA - ÚLTIMA HORA: ${dados.length} registros\n`);

    // Agrupar em intervalos de 5 minutos (como o backend faz)
    const INTERVALO_MINUTOS = 5;
    const dadosAgrupados = new Map();

    dados.forEach((d) => {
      const minuto = new Date(d.timestamp_dados);
      const minutosArredondados = Math.floor(minuto.getMinutes() / INTERVALO_MINUTOS) * INTERVALO_MINUTOS;
      minuto.setMinutes(minutosArredondados, 0, 0);
      const minutoKey = minuto.toISOString();

      if (!dadosAgrupados.has(minutoKey)) {
        dadosAgrupados.set(minutoKey, {
          timestamp: minuto,
          dadosM160: [],
        });
      }

      const grupo = dadosAgrupados.get(minutoKey);

      // Armazenar M160 para agregação (MESMA LÓGICA DO BACKEND)
      if (d.dados.Dados) {
        grupo.dadosM160.push(d.dados.Dados);
      } else if (d.dados.Va !== undefined || d.dados.Ia !== undefined) {
        grupo.dadosM160.push(d.dados);
      }
    });

    console.log(`📊 GRUPOS DE 5 MINUTOS: ${dadosAgrupados.size}\n`);

    // Processar primeiros 3 grupos
    const grupos = Array.from(dadosAgrupados.values()).slice(0, 3);

    grupos.forEach((grupo, i) => {
      console.log(`--- GRUPO ${i+1}: ${grupo.timestamp.toLocaleString('pt-BR')} ---`);
      console.log(`  Dados M160 agregados: ${grupo.dadosM160.length}`);

      if (grupo.dadosM160.length > 0) {
        // Calcular média (MESMA LÓGICA DO BACKEND)
        const avgM160 = {
          FPa: grupo.dadosM160.reduce((sum, d) => sum + (d.FPa || d.FPA || 0), 0) / grupo.dadosM160.length,
          FPb: grupo.dadosM160.reduce((sum, d) => sum + (d.FPb || d.FPB || 0), 0) / grupo.dadosM160.length,
          FPc: grupo.dadosM160.reduce((sum, d) => sum + (d.FPc || d.FPC || 0), 0) / grupo.dadosM160.length,
        };

        console.log(`  ✅ DADOS AGREGADOS (ponto.Dados):`);
        console.log(`     FPa: ${avgM160.FPa}`);
        console.log(`     FPb: ${avgM160.FPb}`);
        console.log(`     FPc: ${avgM160.FPc}`);

        console.log(`\n  📋 DADOS INDIVIDUAIS:`);
        grupo.dadosM160.forEach((d, idx) => {
          console.log(`     [${idx+1}] FPa=${d.FPa || d.FPA || 'undefined'}, FPb=${d.FPb || d.FPB || 'undefined'}, FPc=${d.FPc || d.FPC || 'undefined'}`);
        });
      } else {
        console.log(`  ❌ NENHUM DADO M160 AGREGADO!`);
      }
      console.log('');
    });

    console.log('\n📊 SIMULANDO RESPOSTA DO ENDPOINT:\n');
    console.log('O backend retorna: { dados: [ ... pontos ... ] }');
    console.log('Cada ponto tem: { timestamp, hora, potencia_kw, Dados: { FPa, FPb, FPc, ... } }');
    console.log('\n✅ O FRONTEND deve ler: ponto.Dados.FPa (ou ponto.Dados.FPA para legado)');

  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

debugFP();
