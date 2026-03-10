import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function identificarIntervalosSemDados() {
  const equipamentoId = 'cmllgigy800cujqctbxnx1iq5';
  const dataInicio = new Date('2026-03-06T09:30:00-03:00');
  const dataFim = new Date('2026-03-10T15:00:00-03:00');

  console.log('🔍 Identificação de Intervalos Sem Dados');
  console.log('=====================================');
  console.log(`Equipamento ID: ${equipamentoId}`);
  console.log(`Período: ${dataInicio.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} até ${dataFim.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
  console.log('');

  try {
    // Buscar todos os registros do período
    const dados = await prisma.equipamentos_dados.findMany({
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

    if (dados.length === 0) {
      console.log('❌ Nenhum registro encontrado no período!');
      return;
    }

    console.log(`Total de registros encontrados: ${dados.length}`);
    console.log('');

    // Detectar gaps (intervalos maiores que 1 minuto = 60 segundos)
    const INTERVALO_ESPERADO = 30; // segundos
    const THRESHOLD_GAP = 60; // segundos (considerar gap se > 1 minuto)

    interface Gap {
      inicio: Date;
      fim: Date;
      duracaoSegundos: number;
      duracaoMinutos: number;
      duracaoHoras: number;
      registrosEsperados: number;
      consumoEstimadoKwh: number;
    }

    const gaps: Gap[] = [];
    let totalSegundosPerdidos = 0;
    let totalRegistrosEsperados = 0;

    // Calcular potência média dos registros com consumo > 0 para estimar energia perdida
    let somaPotencia = 0;
    let countPotencia = 0;

    dados.forEach((registro) => {
      const dadosJSON: any = registro.dados;
      const consumo = dadosJSON?.consumo_phf || dadosJSON?.Resumo?.consumo_phf || 0;
      const pt = dadosJSON?.Pt || dadosJSON?.Resumo?.Pt || 0;

      if (consumo > 0 && pt > 0) {
        somaPotencia += pt;
        countPotencia++;
      }
    });

    const potenciaMediaW = countPotencia > 0 ? somaPotencia / countPotencia : 0;
    const potenciaMediaKw = potenciaMediaW / 1000;

    console.log(`📊 Potência média (quando há consumo): ${potenciaMediaW.toFixed(2)} W (${potenciaMediaKw.toFixed(3)} kW)`);
    console.log('');

    // Detectar gaps
    for (let i = 1; i < dados.length; i++) {
      const anterior = new Date(dados[i - 1].timestamp_dados).getTime();
      const atual = new Date(dados[i].timestamp_dados).getTime();
      const diferencaSegundos = (atual - anterior) / 1000;

      if (diferencaSegundos > THRESHOLD_GAP) {
        const duracaoMinutos = diferencaSegundos / 60;
        const duracaoHoras = diferencaSegundos / 3600;
        const registrosEsperados = Math.floor(diferencaSegundos / INTERVALO_ESPERADO);

        // Estimar energia perdida (assumindo potência média)
        const horasPerdidas = diferencaSegundos / 3600;
        const consumoEstimadoKwh = potenciaMediaKw * horasPerdidas;

        gaps.push({
          inicio: new Date(dados[i - 1].timestamp_dados),
          fim: new Date(dados[i].timestamp_dados),
          duracaoSegundos: diferencaSegundos,
          duracaoMinutos,
          duracaoHoras,
          registrosEsperados,
          consumoEstimadoKwh,
        });

        totalSegundosPerdidos += diferencaSegundos;
        totalRegistrosEsperados += registrosEsperados;
      }
    }

    // Ordenar gaps por duração (maiores primeiro)
    gaps.sort((a, b) => b.duracaoSegundos - a.duracaoSegundos);

    console.log('🔴 GAPS DETECTADOS (ordenados por duração)');
    console.log('=====================================');
    console.log('');

    if (gaps.length === 0) {
      console.log('✅ Nenhum gap significativo detectado!');
      console.log('   Todos os intervalos estão dentro do esperado (≤ 60 segundos)');
      return;
    }

    // Agrupar gaps por tamanho
    const gapsGrandes = gaps.filter(g => g.duracaoHoras >= 1); // >= 1 hora
    const gapsMedios = gaps.filter(g => g.duracaoMinutos >= 10 && g.duracaoHoras < 1); // 10min a 1h
    const gapsPequenos = gaps.filter(g => g.duracaoMinutos < 10); // < 10min

    console.log(`Total de gaps: ${gaps.length}`);
    console.log(`  - Gaps grandes (≥ 1 hora): ${gapsGrandes.length}`);
    console.log(`  - Gaps médios (10min - 1h): ${gapsMedios.length}`);
    console.log(`  - Gaps pequenos (< 10min): ${gapsPequenos.length}`);
    console.log('');

    // Mostrar gaps grandes (≥ 1 hora) - TODOS
    if (gapsGrandes.length > 0) {
      console.log('🔴 GAPS GRANDES (≥ 1 HORA):');
      console.log('=====================================');
      gapsGrandes.forEach((gap, index) => {
        console.log(`${index + 1}. INÍCIO: ${gap.inicio.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
        console.log(`   FIM:    ${gap.fim.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
        console.log(`   Duração: ${gap.duracaoHoras.toFixed(2)} horas (${gap.duracaoMinutos.toFixed(0)} minutos)`);
        console.log(`   Registros esperados: ${gap.registrosEsperados}`);
        console.log(`   Energia estimada perdida: ${gap.consumoEstimadoKwh.toFixed(3)} kWh`);
        console.log('');
      });
    }

    // Mostrar gaps médios - primeiros 10
    if (gapsMedios.length > 0) {
      console.log('🟡 GAPS MÉDIOS (10min - 1h):');
      console.log('=====================================');
      const mostrarAte = Math.min(10, gapsMedios.length);
      gapsMedios.slice(0, mostrarAte).forEach((gap, index) => {
        console.log(`${index + 1}. INÍCIO: ${gap.inicio.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
        console.log(`   FIM:    ${gap.fim.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
        console.log(`   Duração: ${gap.duracaoMinutos.toFixed(1)} minutos`);
        console.log(`   Registros esperados: ${gap.registrosEsperados}`);
        console.log(`   Energia estimada perdida: ${gap.consumoEstimadoKwh.toFixed(3)} kWh`);
        console.log('');
      });
      if (gapsMedios.length > mostrarAte) {
        console.log(`   ... e mais ${gapsMedios.length - mostrarAte} gaps médios`);
        console.log('');
      }
    }

    // Estatísticas de gaps pequenos (não mostrar todos)
    if (gapsPequenos.length > 0) {
      console.log('🟢 GAPS PEQUENOS (< 10min):');
      console.log('=====================================');
      console.log(`Total: ${gapsPequenos.length} gaps`);
      const duracaoTotalPequenosMin = gapsPequenos.reduce((sum, g) => sum + g.duracaoMinutos, 0);
      console.log(`Duração total: ${duracaoTotalPequenosMin.toFixed(1)} minutos (${(duracaoTotalPequenosMin / 60).toFixed(2)} horas)`);
      console.log('(Não exibidos individualmente por serem muitos)');
      console.log('');
    }

    // Resumo geral
    const totalHorasPerdidas = totalSegundosPerdidos / 3600;
    const totalDiasPerdidos = totalHorasPerdidas / 24;
    const consumoTotalEstimadoKwh = gaps.reduce((sum, g) => sum + g.consumoEstimadoKwh, 0);

    console.log('📊 RESUMO GERAL');
    console.log('=====================================');
    console.log(`Período total analisado: ${dataInicio.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} até ${dataFim.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);

    const duracaoTotalPeriodo = (dataFim.getTime() - dataInicio.getTime()) / 1000; // segundos
    const horasTotais = duracaoTotalPeriodo / 3600;

    console.log(`Duração total do período: ${horasTotais.toFixed(2)} horas (${(horasTotais / 24).toFixed(2)} dias)`);
    console.log('');
    console.log(`Total de gaps detectados: ${gaps.length}`);
    console.log(`Tempo total perdido: ${totalHorasPerdidas.toFixed(2)} horas (${totalDiasPerdidos.toFixed(2)} dias)`);
    console.log(`Registros esperados perdidos: ${totalRegistrosEsperados}`);
    console.log(`Energia total estimada perdida: ${consumoTotalEstimadoKwh.toFixed(3)} kWh`);
    console.log('');

    const porcentagemPerdida = (totalSegundosPerdidos / duracaoTotalPeriodo) * 100;
    console.log(`Porcentagem de tempo sem dados: ${porcentagemPerdida.toFixed(1)}%`);
    console.log(`Porcentagem de cobertura: ${(100 - porcentagemPerdida).toFixed(1)}%`);
    console.log('');

    // Análise da divergência
    console.log('🎯 ANÁLISE DA DIVERGÊNCIA');
    console.log('=====================================');
    console.log(`Divergência detectada anteriormente: 31,80 kWh`);
    console.log(`Energia estimada perdida (gaps): ${consumoTotalEstimadoKwh.toFixed(3)} kWh`);
    console.log('');

    if (Math.abs(consumoTotalEstimadoKwh - 31.8) < 5) {
      console.log('✅ A energia perdida nos gaps explica a divergência!');
      console.log('   Os dados que existem estão corretos.');
      console.log('   A divergência é causada exclusivamente pelos períodos sem conexão.');
    } else if (consumoTotalEstimadoKwh < 31.8) {
      console.log('⚠️ A energia perdida nos gaps não explica totalmente a divergência.');
      console.log(`   Diferença: ${(31.8 - consumoTotalEstimadoKwh).toFixed(3)} kWh ainda sem explicação.`);
      console.log('   Possíveis causas adicionais:');
      console.log('   - Potência real foi maior que a média estimada');
      console.log('   - Registros com consumo_phf = 0 quando deveria ter valor');
    } else {
      console.log('⚠️ A energia estimada perdida é maior que a divergência.');
      console.log('   A potência média usada pode estar superestimada.');
      console.log('   É possível que durante os gaps a carga era menor.');
    }

    // Sugestão de períodos críticos para investigação
    if (gapsGrandes.length > 0) {
      console.log('');
      console.log('🔧 PERÍODOS CRÍTICOS PARA INVESTIGAÇÃO');
      console.log('=====================================');
      console.log('Os seguintes períodos tiveram perda significativa de dados:');
      console.log('');

      gapsGrandes.slice(0, 5).forEach((gap, index) => {
        console.log(`${index + 1}. ${gap.inicio.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })} até ${gap.fim.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}`);
        console.log(`   (${gap.duracaoHoras.toFixed(1)}h, ~${gap.consumoEstimadoKwh.toFixed(1)} kWh perdidos)`);
      });
      console.log('');
      console.log('Verifique nos logs do backend/MQTT o que aconteceu nesses períodos.');
    }

  } catch (error) {
    console.error('❌ Erro na análise:', error);
  } finally {
    await prisma.$disconnect();
  }
}

identificarIntervalosSemDados()
  .then(() => {
    console.log('');
    console.log('✅ Análise concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
