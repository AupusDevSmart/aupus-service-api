const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testarGrafico() {
  try {
    const equipamentoId = 'cmlkysvol000c2foo2eknj8zu '; // P666

    // Simular lógica do getGraficoDia
    const dataFim = new Date();
    const dataConsulta = new Date(dataFim);
    dataConsulta.setHours(dataConsulta.getHours() - 24);

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

    console.log(`\n📊 TOTAL DE REGISTROS: ${dados.length}\n`);

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

    console.log(`📊 GRUPOS DE 5 MINUTOS: ${dadosAgrupados.size}\n`);

    // Processar primeiro grupo
    const primeiroGrupo = Array.from(dadosAgrupados.values())[0];

    if (primeiroGrupo) {
      console.log(`📦 PRIMEIRO GRUPO (${primeiroGrupo.timestamp.toLocaleString('pt-BR')}):`);
      console.log(`   - Leituras: ${primeiroGrupo.dados.length}`);
      console.log(`   - dadosM160 coletados: ${primeiroGrupo.dadosM160.length}`);

      if (primeiroGrupo.dadosM160.length > 0) {
        console.log(`\n   📊 CALCULANDO MÉDIAS M-160:`);

        const avgM160 = {
          FPa: primeiroGrupo.dadosM160.reduce((sum, d) => sum + (d.FPa || d.FPA || 0), 0) / primeiroGrupo.dadosM160.length,
          FPb: primeiroGrupo.dadosM160.reduce((sum, d) => sum + (d.FPb || d.FPB || 0), 0) / primeiroGrupo.dadosM160.length,
          FPc: primeiroGrupo.dadosM160.reduce((sum, d) => sum + (d.FPc || d.FPC || 0), 0) / primeiroGrupo.dadosM160.length,
          phf: primeiroGrupo.dadosM160.reduce((sum, d) => sum + (d.phf || 0), 0) / primeiroGrupo.dadosM160.length,
        };

        console.log(`   - FPa médio: ${avgM160.FPa}`);
        console.log(`   - FPb médio: ${avgM160.FPb}`);
        console.log(`   - FPc médio: ${avgM160.FPc}`);
        console.log(`   - phf médio: ${avgM160.phf}`);

        console.log(`\n   📋 VALORES INDIVIDUAIS:`);
        primeiroGrupo.dadosM160.forEach((d, i) => {
          console.log(`      Leitura ${i+1}: FPa=${d.FPa || d.FPA}, FPB=${d.FPb || d.FPB}, FPC=${d.FPc || d.FPC}, phf=${d.phf}`);
        });
      } else {
        console.log(`   ⚠️ NENHUM DADO M160 AGREGADO!`);
      }
    }

  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

testarGrafico();
