import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analisarResetsPHF() {
  const equipamentoId = 'cmllgigy800cujqctbxnx1iq5';

  // ✅ CORRIGIDO: Data em fuso horário do Brasil (BRT = UTC-3)
  const dataInicio = new Date('2026-03-06T09:30:00-03:00');

  console.log('🔍 Análise de Resets de PHF');
  console.log('=====================================');
  console.log(`Equipamento ID: ${equipamentoId}`);
  console.log(`Data Início (BRT): ${dataInicio.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  console.log('');

  try {
    // Buscar dados com PHF acumulado
    const dados = await prisma.equipamentos_dados.findMany({
      where: {
        equipamento_id: equipamentoId,
        timestamp_dados: {
          gte: dataInicio,
        },
      },
      orderBy: {
        timestamp_dados: 'asc',
      },
      select: {
        timestamp_dados: true,
        dados: true,
      },
    });

    console.log(`Total de registros: ${dados.length}`);
    console.log('');

    // Detectar resets (quando PHF atual < PHF anterior)
    let phfAnterior: number | null = null;
    let resetCount = 0;
    const resets: Array<{
      timestamp: Date;
      phfAnterior: number;
      phfAtual: number;
      diferenca: number;
    }> = [];

    let registrosComPHF = 0;
    let registrosSemPHF = 0;

    dados.forEach((registro) => {
      const dadosJSON: any = registro.dados;
      const phfAtual = dadosJSON?.phf || dadosJSON?.Resumo?.phf ||
                       dadosJSON?.somatorio_phf || dadosJSON?.Resumo?.somatorio_phf || null;

      if (phfAtual !== null) {
        registrosComPHF++;

        if (phfAnterior !== null && phfAtual < phfAnterior) {
          resetCount++;
          resets.push({
            timestamp: registro.timestamp_dados,
            phfAnterior,
            phfAtual,
            diferenca: phfAnterior - phfAtual,
          });
        }

        phfAnterior = phfAtual;
      } else {
        registrosSemPHF++;
      }
    });

    console.log('📊 ESTATÍSTICAS');
    console.log('=====================================');
    console.log(`Registros com PHF: ${registrosComPHF}`);
    console.log(`Registros sem PHF: ${registrosSemPHF}`);
    console.log(`Resets detectados: ${resetCount}`);
    console.log('');

    if (resets.length > 0) {
      console.log('⚠️ RESETS DE PHF DETECTADOS:');
      console.log('=====================================');

      resets.forEach((reset, index) => {
        const timestamp = new Date(reset.timestamp).toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo'
        });

        console.log(`${index + 1}. ${timestamp}`);
        console.log(`   PHF anterior: ${reset.phfAnterior.toFixed(6)} kWh`);
        console.log(`   PHF atual: ${reset.phfAtual.toFixed(6)} kWh`);
        console.log(`   Diferença (perdida): ${reset.diferenca.toFixed(6)} kWh`);
        console.log('');
      });

      // Calcular total perdido nos resets
      const totalPerdidoResets = resets.reduce((sum, reset) => sum + reset.diferenca, 0);

      console.log('💡 EXPLICAÇÃO DA DIVERGÊNCIA');
      console.log('=====================================');
      console.log(`Total "perdido" em resets: ${totalPerdidoResets.toFixed(6)} kWh`);
      console.log(`Último PHF: ${phfAnterior?.toFixed(6)} kWh`);
      console.log(`Esperado (último PHF + resets): ${(phfAnterior! + totalPerdidoResets).toFixed(6)} kWh`);
      console.log('');
      console.log('✅ Isso explica a divergência!');
      console.log('   O medidor resetou o PHF várias vezes, mas a soma dos');
      console.log('   consumo_phf continua somando corretamente todo o período.');
    } else {
      console.log('✅ Nenhum reset de PHF detectado no período.');
      console.log('');
      console.log('⚠️ Possíveis causas da divergência:');
      console.log('1. Dados estão sendo salvos sem o campo phf/somatorio_phf');
      console.log('2. Gaps muito grandes na série temporal (dados perdidos)');
      console.log('3. Campo consumo_phf está sendo calculado incorretamente');
    }

    // Análise adicional: verificar evolução do PHF
    console.log('');
    console.log('📈 EVOLUÇÃO DO PHF (primeiros e últimos registros)');
    console.log('=====================================');

    const registrosComPHFArray = dados.filter((d: any) => {
      const dadosJSON: any = d.dados;
      const phf = dadosJSON?.phf || dadosJSON?.Resumo?.phf ||
                  dadosJSON?.somatorio_phf || dadosJSON?.Resumo?.somatorio_phf || null;
      return phf !== null;
    });

    if (registrosComPHFArray.length > 0) {
      // Mostrar primeiros 5
      console.log('Primeiros registros com PHF:');
      registrosComPHFArray.slice(0, 5).forEach((registro: any, index: number) => {
        const dadosJSON: any = registro.dados;
        const phf = dadosJSON?.phf || dadosJSON?.Resumo?.phf ||
                    dadosJSON?.somatorio_phf || dadosJSON?.Resumo?.somatorio_phf;
        const consumo = dadosJSON?.consumo_phf || dadosJSON?.Resumo?.consumo_phf || 0;
        const timestamp = new Date(registro.timestamp_dados).toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo'
        });

        console.log(`${index + 1}. ${timestamp}`);
        console.log(`   PHF: ${phf.toFixed(6)} kWh | consumo_phf: ${consumo.toFixed(6)} kWh`);
      });

      console.log('');
      console.log('Últimos registros com PHF:');
      registrosComPHFArray.slice(-5).forEach((registro: any, index: number) => {
        const dadosJSON: any = registro.dados;
        const phf = dadosJSON?.phf || dadosJSON?.Resumo?.phf ||
                    dadosJSON?.somatorio_phf || dadosJSON?.Resumo?.somatorio_phf;
        const consumo = dadosJSON?.consumo_phf || dadosJSON?.Resumo?.consumo_phf || 0;
        const timestamp = new Date(registro.timestamp_dados).toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo'
        });

        console.log(`${registrosComPHFArray.length - 4 + index}. ${timestamp}`);
        console.log(`   PHF: ${phf.toFixed(6)} kWh | consumo_phf: ${consumo.toFixed(6)} kWh`);
      });
    }

  } catch (error) {
    console.error('❌ Erro na análise:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analisarResetsPHF()
  .then(() => {
    console.log('');
    console.log('✅ Análise concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
