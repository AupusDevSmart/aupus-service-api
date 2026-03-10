import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analisarDivergenciaPHF() {
  const equipamentoId = 'cmllgigy800cujqctbxnx1iq5';

  // ✅ CORRIGIDO: Data em fuso horário do Brasil (BRT = UTC-3)
  // 06/03/2026 09:30 BRT = 06/03/2026 12:30 UTC
  const dataInicio = new Date('2026-03-06T09:30:00-03:00');

  console.log('🔍 Análise de Divergência de PHF');
  console.log('=====================================');
  console.log(`Equipamento ID: ${equipamentoId}`);
  console.log(`Data Início (BRT): ${dataInicio.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  console.log(`Data Início (UTC): ${dataInicio.toISOString()}`);
  console.log('');

  try {
    // 1. Buscar informações do equipamento
    const equipamento = await prisma.equipamentos.findUnique({
      where: { id: equipamentoId },
      include: {
        tipo_equipamento_rel: true,
        unidade: true,
      },
    });

    if (!equipamento) {
      console.error('❌ Equipamento não encontrado!');
      return;
    }

    console.log('📊 Informações do Equipamento:');
    console.log(`   Nome: ${equipamento.nome}`);
    console.log(`   Tipo: ${equipamento.tipo_equipamento_rel?.nome || 'N/A'}`);
    console.log(`   Código: ${equipamento.tipo_equipamento_rel?.codigo || 'N/A'}`);
    console.log(`   Unidade: ${equipamento.unidade?.nome || 'N/A'}`);
    console.log('');

    // 2. Buscar todos os dados desde o reset até agora
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
        id: true,
        timestamp_dados: true,
        dados: true,
        energia_kwh: true,
        potencia_ativa_kw: true,
        qualidade: true,
        fonte: true,
      },
    });

    console.log(`📈 Total de registros encontrados: ${dados.length}`);
    console.log('');

    if (dados.length === 0) {
      console.log('⚠️ Nenhum dado encontrado no período especificado!');
      return;
    }

    // 3. Analisar os dados e calcular somas
    let somaConsumoPHF = 0;
    let somaEnergiaKwh = 0;
    let ultimoPHF: number | null = null;
    let primeiroRegistro = true;
    let registrosComConsumo = 0;
    let registrosSemConsumo = 0;

    console.log('📋 Análise detalhada dos registros:');
    console.log('=====================================');
    console.log('');

    dados.forEach((registro, index) => {
      const dadosJSON: any = registro.dados;
      const consumoPHF = dadosJSON?.consumo_phf || dadosJSON?.Resumo?.consumo_phf || 0;
      const phfAtual = dadosJSON?.phf || dadosJSON?.Resumo?.phf ||
                       dadosJSON?.somatorio_phf || dadosJSON?.Resumo?.somatorio_phf || null;
      const energiaKwh = registro.energia_kwh ? parseFloat(registro.energia_kwh.toString()) : 0;
      const potenciaKw = registro.potencia_ativa_kw ? parseFloat(registro.potencia_ativa_kw.toString()) : 0;

      somaConsumoPHF += consumoPHF;
      somaEnergiaKwh += energiaKwh;

      if (consumoPHF > 0) {
        registrosComConsumo++;
      } else {
        registrosSemConsumo++;
      }

      if (phfAtual !== null) {
        ultimoPHF = phfAtual;
      }

      // Mostrar primeiros 10 e últimos 10 registros
      if (index < 10 || index >= dados.length - 10) {
        const timestamp = new Date(registro.timestamp_dados).toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo'
        });

        console.log(`${index + 1}. ${timestamp}`);
        console.log(`   consumo_phf: ${consumoPHF.toFixed(6)} kWh`);
        console.log(`   phf_acumulado: ${phfAtual !== null ? phfAtual.toFixed(6) : 'N/A'} kWh`);
        console.log(`   energia_kwh (coluna): ${energiaKwh.toFixed(6)} kWh`);
        console.log(`   potencia_kw: ${potenciaKw.toFixed(3)} kW`);
        console.log(`   qualidade: ${registro.qualidade || 'N/A'}`);
        console.log(`   fonte: ${registro.fonte}`);
        console.log('');
      } else if (index === 10) {
        console.log('   ... (registros intermediários omitidos) ...');
        console.log('');
      }
    });

    // 4. Mostrar resumo e análise
    console.log('');
    console.log('📊 RESUMO DA ANÁLISE');
    console.log('=====================================');
    console.log(`Total de registros: ${dados.length}`);
    console.log(`Registros com consumo > 0: ${registrosComConsumo}`);
    console.log(`Registros com consumo = 0: ${registrosSemConsumo}`);
    console.log('');
    console.log(`Soma de consumo_phf: ${somaConsumoPHF.toFixed(6)} kWh`);
    console.log(`Soma de energia_kwh (coluna): ${somaEnergiaKwh.toFixed(6)} kWh`);
    console.log(`Último PHF acumulado: ${ultimoPHF !== null ? ultimoPHF.toFixed(6) : 'N/A'} kWh`);
    console.log('');

    // 5. Calcular divergência
    if (ultimoPHF !== null) {
      const divergencia = Math.abs(somaConsumoPHF - ultimoPHF);
      const percentualDivergencia = (divergencia / ultimoPHF) * 100;

      console.log('🎯 VERIFICAÇÃO DE CONSISTÊNCIA');
      console.log('=====================================');
      console.log(`Esperado (último PHF): ${ultimoPHF.toFixed(6)} kWh`);
      console.log(`Calculado (soma consumo_phf): ${somaConsumoPHF.toFixed(6)} kWh`);
      console.log(`Divergência: ${divergencia.toFixed(6)} kWh (${percentualDivergencia.toFixed(2)}%)`);
      console.log('');

      if (divergencia < 0.001) {
        console.log('✅ Dados consistentes! Divergência desprezível.');
      } else if (divergencia < 0.1) {
        console.log('⚠️ Pequena divergência detectada (pode ser arredondamento).');
      } else {
        console.log('❌ DIVERGÊNCIA SIGNIFICATIVA DETECTADA!');
        console.log('');
        console.log('Possíveis causas:');
        console.log('1. Registros faltando no período (dados não salvos)');
        console.log('2. PHF resetou mais de uma vez no período');
        console.log('3. Dados corrompidos ou inconsistentes');
        console.log('4. Campo consumo_phf não calculado corretamente');
      }
    } else {
      console.log('⚠️ Não foi possível encontrar o PHF acumulado nos dados!');
    }

    console.log('');
    console.log('🔍 ANÁLISE ADICIONAL');
    console.log('=====================================');

    // 6. Verificar se há gaps de tempo
    const primeiroTimestamp = new Date(dados[0].timestamp_dados);
    const ultimoTimestamp = new Date(dados[dados.length - 1].timestamp_dados);
    const duracaoTotal = (ultimoTimestamp.getTime() - primeiroTimestamp.getTime()) / 1000; // segundos
    const duracaoEsperada = dados.length * 30; // 30 segundos por registro

    console.log(`Primeiro registro: ${primeiroTimestamp.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
    console.log(`Último registro: ${ultimoTimestamp.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
    console.log(`Duração total: ${(duracaoTotal / 3600).toFixed(2)} horas`);
    console.log(`Duração esperada (${dados.length} × 30s): ${(duracaoEsperada / 3600).toFixed(2)} horas`);
    console.log(`Diferença: ${((duracaoTotal - duracaoEsperada) / 60).toFixed(2)} minutos`);
    console.log('');

    // 7. Detectar gaps maiores que 1 minuto
    let gapsDetectados = 0;
    for (let i = 1; i < dados.length; i++) {
      const anterior = new Date(dados[i - 1].timestamp_dados).getTime();
      const atual = new Date(dados[i].timestamp_dados).getTime();
      const diferenca = (atual - anterior) / 1000; // segundos

      if (diferenca > 60) {
        gapsDetectados++;
        if (gapsDetectados <= 5) { // Mostrar apenas os primeiros 5
          console.log(`⚠️ Gap detectado: ${(diferenca / 60).toFixed(2)} minutos entre:`);
          console.log(`   ${new Date(dados[i - 1].timestamp_dados).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
          console.log(`   ${new Date(dados[i].timestamp_dados).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
          console.log('');
        }
      }
    }

    if (gapsDetectados > 5) {
      console.log(`... e mais ${gapsDetectados - 5} gaps detectados`);
      console.log('');
    }

    if (gapsDetectados === 0) {
      console.log('✅ Nenhum gap significativo detectado na série temporal.');
    } else {
      console.log(`⚠️ Total de gaps detectados: ${gapsDetectados}`);
      console.log('   Isso pode explicar a divergência se dados foram perdidos.');
    }

  } catch (error) {
    console.error('❌ Erro na análise:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar análise
analisarDivergenciaPHF()
  .then(() => {
    console.log('');
    console.log('✅ Análise concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
