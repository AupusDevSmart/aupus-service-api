import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function calcularPHFInicial() {
  const equipamentoId = 'cmllgigy800cujqctbxnx1iq5';

  // Período analisado: 06/03/2026 09:30 BRT até 10/03/2026 15:00 BRT
  const dataInicio = new Date('2026-03-06T09:30:00-03:00');
  const dataFim = new Date('2026-03-10T15:00:00-03:00');

  console.log('🔍 Cálculo do PHF Inicial (no momento do reset)');
  console.log('=====================================');
  console.log(`Equipamento ID: ${equipamentoId}`);
  console.log(`Período: ${dataInicio.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} até ${dataFim.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  console.log('');

  try {
    // 1. Buscar o primeiro registro do período (logo após o reset)
    const primeiroRegistro = await prisma.equipamentos_dados.findFirst({
      where: {
        equipamento_id: equipamentoId,
        timestamp_dados: {
          gte: dataInicio,
          lte: dataFim,
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

    // 2. Buscar o último registro do período
    const ultimoRegistro = await prisma.equipamentos_dados.findFirst({
      where: {
        equipamento_id: equipamentoId,
        timestamp_dados: {
          gte: dataInicio,
          lte: dataFim,
        },
      },
      orderBy: {
        timestamp_dados: 'desc',
      },
      select: {
        timestamp_dados: true,
        dados: true,
      },
    });

    // 3. Somar todos os consumo_phf do período
    const todosRegistros = await prisma.equipamentos_dados.findMany({
      where: {
        equipamento_id: equipamentoId,
        timestamp_dados: {
          gte: dataInicio,
          lte: dataFim,
        },
      },
      orderBy: {
        timestamp_dados: 'asc',
      },
      select: {
        dados: true,
      },
    });

    if (!primeiroRegistro || !ultimoRegistro || todosRegistros.length === 0) {
      console.log('❌ Nenhum registro encontrado no período!');
      return;
    }

    // Extrair PHF inicial e final
    const dadosPrimeiro: any = primeiroRegistro.dados;
    const dadosUltimo: any = ultimoRegistro.dados;

    const phfInicial = dadosPrimeiro?.phf || dadosPrimeiro?.Resumo?.phf ||
                       dadosPrimeiro?.somatorio_phf || dadosPrimeiro?.Resumo?.somatorio_phf || 0;

    const phfFinal = dadosUltimo?.phf || dadosUltimo?.Resumo?.phf ||
                     dadosUltimo?.somatorio_phf || dadosUltimo?.Resumo?.somatorio_phf || 0;

    // Somar todos os consumo_phf
    let somaConsumoPHF = 0;
    todosRegistros.forEach((registro) => {
      const dados: any = registro.dados;
      const consumo = dados?.consumo_phf || dados?.Resumo?.consumo_phf || 0;
      somaConsumoPHF += consumo;
    });

    console.log('📊 DADOS DO PERÍODO');
    console.log('=====================================');
    console.log(`Primeiro registro: ${primeiroRegistro.timestamp_dados.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
    console.log(`Último registro: ${ultimoRegistro.timestamp_dados.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
    console.log(`Total de registros: ${todosRegistros.length}`);
    console.log('');

    console.log('🎯 VALORES DE PHF');
    console.log('=====================================');
    console.log(`PHF no início do período: ${phfInicial.toFixed(6)} kWh`);
    console.log(`PHF no final do período: ${phfFinal.toFixed(6)} kWh`);
    console.log(`Diferença (PHF final - PHF inicial): ${(phfFinal - phfInicial).toFixed(6)} kWh`);
    console.log('');

    console.log('💡 COMPARAÇÃO COM SOMA DOS CONSUMOS');
    console.log('=====================================');
    console.log(`Soma de consumo_phf (período): ${somaConsumoPHF.toFixed(6)} kWh`);
    console.log(`Delta PHF (final - inicial): ${(phfFinal - phfInicial).toFixed(6)} kWh`);
    console.log('');

    const divergencia = Math.abs(somaConsumoPHF - (phfFinal - phfInicial));
    const percentual = (divergencia / (phfFinal - phfInicial)) * 100;

    console.log('🔍 ANÁLISE DE DIVERGÊNCIA');
    console.log('=====================================');
    console.log(`Divergência: ${divergencia.toFixed(6)} kWh (${percentual.toFixed(2)}%)`);
    console.log('');

    if (divergencia < 1) {
      console.log('✅ Dados consistentes!');
      console.log('   O somatório de consumo_phf está coerente com o delta do PHF.');
    } else {
      console.log('⚠️ Divergência detectada!');
      console.log('   Possíveis causas:');
      console.log('   1. Dados faltando no período (gaps na série temporal)');
      console.log('   2. Registros com consumo_phf = 0 quando deveria ter valor');
      console.log('   3. Arredondamentos acumulados');
    }

    // 4. Análise adicional: contar registros com e sem consumo
    let comConsumo = 0;
    let semConsumo = 0;
    todosRegistros.forEach((registro) => {
      const dados: any = registro.dados;
      const consumo = dados?.consumo_phf || dados?.Resumo?.consumo_phf || 0;
      if (consumo > 0) {
        comConsumo++;
      } else {
        semConsumo++;
      }
    });

    console.log('');
    console.log('📈 ESTATÍSTICAS DE CONSUMO');
    console.log('=====================================');
    console.log(`Registros com consumo > 0: ${comConsumo} (${((comConsumo / todosRegistros.length) * 100).toFixed(1)}%)`);
    console.log(`Registros com consumo = 0: ${semConsumo} (${((semConsumo / todosRegistros.length) * 100).toFixed(1)}%)`);
    console.log('');

    if (semConsumo > comConsumo) {
      console.log('💡 OBSERVAÇÃO:');
      console.log(`   ${((semConsumo / todosRegistros.length) * 100).toFixed(1)}% dos registros têm consumo = 0`);
      console.log('   Isso é normal para períodos sem carga (noite, madrugada, finais de semana).');
      console.log('   O medidor está funcionando corretamente (medindo tensão mas sem corrente).');
    }

    // 5. Calcular o PHF teórico esperado
    console.log('');
    console.log('🎯 VERIFICAÇÃO FINAL');
    console.log('=====================================');
    console.log(`PHF inicial (no reset): ${phfInicial.toFixed(6)} kWh`);
    console.log(`+ Soma consumo_phf: ${somaConsumoPHF.toFixed(6)} kWh`);
    console.log(`─────────────────────────────────────`);
    console.log(`= PHF esperado: ${(phfInicial + somaConsumoPHF).toFixed(6)} kWh`);
    console.log(`PHF real (final): ${phfFinal.toFixed(6)} kWh`);
    console.log(`Diferença: ${Math.abs((phfInicial + somaConsumoPHF) - phfFinal).toFixed(6)} kWh`);
    console.log('');

    const diferencaFinal = Math.abs((phfInicial + somaConsumoPHF) - phfFinal);
    if (diferencaFinal < 1) {
      console.log('✅ DADOS CORRETOS!');
      console.log('   PHF inicial + soma de consumo_phf = PHF final');
      console.log('   Os dados estão consistentes e corretos.');
    } else {
      console.log('⚠️ DIVERGÊNCIA DETECTADA!');
      console.log(`   Faltam ${diferencaFinal.toFixed(6)} kWh de energia registrada.`);
      console.log('   Provavelmente há dados perdidos (gaps na série temporal).');
    }

  } catch (error) {
    console.error('❌ Erro na análise:', error);
  } finally {
    await prisma.$disconnect();
  }
}

calcularPHFInicial()
  .then(() => {
    console.log('');
    console.log('✅ Análise concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
