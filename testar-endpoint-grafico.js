const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testarGraficoEndpoint() {
  try {
    const equipamentoId = 'cmlkysvol000c2foo2eknj8zu'; // P666

    const dataFim = new Date();
    const dataConsulta = new Date(dataFim);
    dataConsulta.setHours(dataConsulta.getHours() - 2); // Últimas 2 horas apenas

    const dados = await prisma.equipamentos_dados.findMany({
      where: {
        equipamento_id: equipamentoId,
        timestamp_dados: {
          gte: dataConsulta,
          lt: dataFim,
        },
      },
      orderBy: { timestamp_dados: 'asc' },
      select: {
        timestamp_dados: true,
        dados: true,
      },
    });

    console.log(`\n📊 TESTE ENDPOINT GRÁFICO (últimas 2h): ${dados.length} registros\n`);

    // Agrupar em intervalos de 5 minutos
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
          dados: [],
          potencias: [],
          dadosM160: [],
        });
      }

      const grupo = dadosAgrupados.get(minutoKey);
      grupo.dados.push(d);

      // Extrair potência
      let potenciaKw = 0;
      if (d.dados.Pt !== undefined) {
        potenciaKw = d.dados.Pt / 1000;
      } else if (d.dados.Dados) {
        const Pa = d.dados.Dados.Pa || 0;
        const Pb = d.dados.Dados.Pb || 0;
        const Pc = d.dados.Dados.Pc || 0;
        potenciaKw = (Pa + Pb + Pc) / 1000;
      }

      grupo.potencias.push(potenciaKw);

      // Armazenar M160 para agregação
      if (d.dados.Dados) {
        grupo.dadosM160.push(d.dados.Dados);
      } else if (d.dados.Va !== undefined || d.dados.Ia !== undefined) {
        grupo.dadosM160.push(d.dados);
      }
    });

    // Processar grupos
    const pontosAgrupados = Array.from(dadosAgrupados.values()).map((grupo) => {
      const potenciaMedia = grupo.potencias.length > 0
        ? grupo.potencias.reduce((sum, p) => sum + p, 0) / grupo.potencias.length
        : 0;

      const ponto = {
        timestamp: grupo.timestamp,
        hora: grupo.timestamp.toISOString(),
        potencia_kw: potenciaMedia,
        num_leituras: grupo.dados.length,
      };

      // Se houver dados M160, calcular média dos campos
      if (grupo.dadosM160.length > 0) {
        const avgM160 = {
          Va: grupo.dadosM160.reduce((sum, d) => sum + (d.Va || 0), 0) / grupo.dadosM160.length,
          Pt: grupo.dadosM160.reduce((sum, d) => sum + (d.Pt || 0), 0) / grupo.dadosM160.length,
          Qt: grupo.dadosM160.reduce((sum, d) => sum + (d.Qt || 0), 0) / grupo.dadosM160.length,
          // ✅ Suportar MAIÚSCULAS (formato legado) e minúsculas (formato novo)
          FPa: grupo.dadosM160.reduce((sum, d) => sum + (d.FPa || d.FPA || 0), 0) / grupo.dadosM160.length,
          FPb: grupo.dadosM160.reduce((sum, d) => sum + (d.FPb || d.FPB || 0), 0) / grupo.dadosM160.length,
          FPc: grupo.dadosM160.reduce((sum, d) => sum + (d.FPc || d.FPC || 0), 0) / grupo.dadosM160.length,
          phf: grupo.dadosM160.reduce((sum, d) => sum + (d.phf || 0), 0) / grupo.dadosM160.length,
        };
        ponto.Dados = avgM160;
      }

      return ponto;
    }).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    console.log(`📊 TOTAL DE PONTOS AGREGADOS: ${pontosAgrupados.length}\n`);

    // Mostrar primeiros 3 pontos
    pontosAgrupados.slice(0, 3).forEach((ponto, i) => {
      console.log(`--- Ponto ${i+1} ---`);
      console.log(`  Hora: ${ponto.timestamp.toLocaleString('pt-BR')}`);
      console.log(`  Potência: ${ponto.potencia_kw.toFixed(3)} kW`);
      console.log(`  Leituras: ${ponto.num_leituras}`);

      if (ponto.Dados) {
        console.log(`  ✅ TEM DADOS M-160 AGREGADOS:`);
        console.log(`     - Va: ${ponto.Dados.Va.toFixed(2)} V`);
        console.log(`     - Pt: ${ponto.Dados.Pt.toFixed(2)} W`);
        console.log(`     - FPa: ${ponto.Dados.FPa.toFixed(6)}`);
        console.log(`     - FPb: ${ponto.Dados.FPb.toFixed(6)}`);
        console.log(`     - FPc: ${ponto.Dados.FPc.toFixed(6)}`);
        console.log(`     - phf: ${ponto.Dados.phf.toFixed(2)}`);
      } else {
        console.log(`  ❌ SEM DADOS M-160!`);
      }
      console.log('');
    });

  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

testarGraficoEndpoint();
