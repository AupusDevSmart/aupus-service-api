import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analiseRefinadaGaps() {
  const equipamentoId = 'cmllgigy800cujqctbxnx1iq5';
  const dataInicio = new Date('2026-03-06T09:30:00-03:00');
  const dataFim = new Date('2026-03-10T15:00:00-03:00');

  console.log('🔍 Análise Refinada de Gaps (com correção de potência)');
  console.log('=====================================');
  console.log(`Equipamento ID: ${equipamentoId}`);
  console.log('');

  try {
    // Buscar todos os registros
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
      console.log('❌ Nenhum registro encontrado!');
      return;
    }

    // Calcular energia REAL consumida e potência média REAL
    let energiaRealTotal = 0;
    let tempoComConsumoSegundos = 0;

    dados.forEach((registro) => {
      const dadosJSON: any = registro.dados;
      const consumo = dadosJSON?.consumo_phf || dadosJSON?.Resumo?.consumo_phf || 0;

      if (consumo > 0) {
        energiaRealTotal += consumo;
        tempoComConsumoSegundos += 30; // cada registro representa 30 segundos
      }
    });

    const tempoComConsumoHoras = tempoComConsumoSegundos / 3600;
    const potenciaMediaRealKw = tempoComConsumoHoras > 0 ? energiaRealTotal / tempoComConsumoHoras : 0;

    console.log('📊 ESTATÍSTICAS DE CONSUMO REAL');
    console.log('=====================================');
    console.log(`Total de registros: ${dados.length}`);
    console.log(`Registros com consumo > 0: ${dados.filter(d => {
      const dadosJSON: any = d.dados;
      const consumo = dadosJSON?.consumo_phf || dadosJSON?.Resumo?.consumo_phf || 0;
      return consumo > 0;
    }).length}`);
    console.log(`Energia real consumida (soma consumo_phf): ${energiaRealTotal.toFixed(3)} kWh`);
    console.log(`Tempo com consumo ativo: ${tempoComConsumoHoras.toFixed(2)} horas`);
    console.log(`Potência média REAL (quando há consumo): ${potenciaMediaRealKw.toFixed(3)} kW`);
    console.log('');

    // Detectar gaps e estimar energia perdida de forma mais realista
    const THRESHOLD_GAP = 60; // segundos

    interface Gap {
      inicio: Date;
      fim: Date;
      duracaoMinutos: number;
      duracaoHoras: number;
      energiaEstimadaKwh: number;
      horaDoDia: number;
      diaSemana: number;
    }

    const gaps: Gap[] = [];

    for (let i = 1; i < dados.length; i++) {
      const anterior = new Date(dados[i - 1].timestamp_dados);
      const atual = new Date(dados[i].timestamp_dados);
      const diferencaSegundos = (atual.getTime() - anterior.getTime()) / 1000;

      if (diferencaSegundos > THRESHOLD_GAP) {
        const duracaoMinutos = diferencaSegundos / 60;
        const duracaoHoras = diferencaSegundos / 3600;

        // Verificar hora do dia e dia da semana para estimar consumo
        const horaDoDia = anterior.getHours();
        const diaSemana = anterior.getDay(); // 0 = domingo, 6 = sábado

        // Heurística: usar potência média apenas em horário comercial
        // Horário comercial: segunda a sexta, 8h às 18h
        let fatorConsumo = 0;

        if (diaSemana >= 1 && diaSemana <= 5) { // segunda a sexta
          if (horaDoDia >= 8 && horaDoDia < 18) {
            fatorConsumo = 1.0; // horário comercial - consumo pleno
          } else if (horaDoDia >= 6 && horaDoDia < 8) {
            fatorConsumo = 0.3; // início da manhã
          } else if (horaDoDia >= 18 && horaDoDia < 22) {
            fatorConsumo = 0.2; // final do dia
          } else {
            fatorConsumo = 0.05; // madrugada/noite
          }
        } else { // fim de semana
          fatorConsumo = 0.05; // consumo mínimo
        }

        const energiaEstimadaKwh = potenciaMediaRealKw * duracaoHoras * fatorConsumo;

        gaps.push({
          inicio: anterior,
          fim: atual,
          duracaoMinutos,
          duracaoHoras,
          energiaEstimadaKwh,
          horaDoDia,
          diaSemana,
        });
      }
    }

    // Ordenar por duração
    gaps.sort((a, b) => b.duracaoHoras - a.duracaoHoras);

    // Agrupar
    const gapsGrandes = gaps.filter(g => g.duracaoHoras >= 1);
    const gapsMedios = gaps.filter(g => g.duracaoMinutos >= 10 && g.duracaoHoras < 1);
    const gapsPequenos = gaps.filter(g => g.duracaoMinutos < 10);

    console.log('🔴 GAPS DETECTADOS');
    console.log('=====================================');
    console.log(`Total: ${gaps.length}`);
    console.log(`  - Gaps grandes (≥ 1h): ${gapsGrandes.length}`);
    console.log(`  - Gaps médios (10min-1h): ${gapsMedios.length}`);
    console.log(`  - Gaps pequenos (<10min): ${gapsPequenos.length}`);
    console.log('');

    // Mostrar gaps grandes
    if (gapsGrandes.length > 0) {
      console.log('🔴 GAPS GRANDES (≥ 1 HORA):');
      console.log('=====================================');
      gapsGrandes.forEach((gap, index) => {
        const diaSemanaStr = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][gap.diaSemana];
        console.log(`${index + 1}. ${gap.inicio.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (${diaSemanaStr})`);
        console.log(`   até ${gap.fim.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
        console.log(`   Duração: ${gap.duracaoHoras.toFixed(2)}h`);
        console.log(`   Energia estimada: ${gap.energiaEstimadaKwh.toFixed(3)} kWh`);
        console.log('');
      });
    } else {
      console.log('✅ Nenhum gap grande (≥ 1 hora) detectado.');
      console.log('');
    }

    // Mostrar gaps médios (top 10)
    if (gapsMedios.length > 0) {
      console.log('🟡 GAPS MÉDIOS (10min - 1h) - Top 10:');
      console.log('=====================================');
      gapsMedios.slice(0, 10).forEach((gap, index) => {
        const diaSemanaStr = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][gap.diaSemana];
        console.log(`${index + 1}. ${gap.inicio.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (${diaSemanaStr})`);
        console.log(`   Duração: ${gap.duracaoMinutos.toFixed(1)} min`);
        console.log(`   Energia estimada: ${gap.energiaEstimadaKwh.toFixed(3)} kWh`);
        console.log('');
      });
      if (gapsMedios.length > 10) {
        console.log(`   ... e mais ${gapsMedios.length - 10} gaps médios`);
        console.log('');
      }
    }

    // Estatísticas de gaps pequenos
    if (gapsPequenos.length > 0) {
      const energiaTotalPequenos = gapsPequenos.reduce((sum, g) => sum + g.energiaEstimadaKwh, 0);
      const duracaoTotalMin = gapsPequenos.reduce((sum, g) => sum + g.duracaoMinutos, 0);

      console.log('🟢 GAPS PEQUENOS (< 10min):');
      console.log('=====================================');
      console.log(`Total: ${gapsPequenos.length} gaps`);
      console.log(`Duração acumulada: ${(duracaoTotalMin / 60).toFixed(2)} horas`);
      console.log(`Energia estimada acumulada: ${energiaTotalPequenos.toFixed(3)} kWh`);
      console.log('');
    }

    // Resumo final
    const energiaTotalEstimada = gaps.reduce((sum, g) => sum + g.energiaEstimadaKwh, 0);
    const duracaoTotalGaps = gaps.reduce((sum, g) => sum + g.duracaoHoras, 0);

    console.log('🎯 RESUMO FINAL');
    console.log('=====================================');
    console.log(`Energia real registrada: ${energiaRealTotal.toFixed(3)} kWh`);
    console.log(`Energia perdida (estimada): ${energiaTotalEstimada.toFixed(3)} kWh`);
    console.log(`Energia total estimada: ${(energiaRealTotal + energiaTotalEstimada).toFixed(3)} kWh`);
    console.log('');

    // Comparar com PHF
    const primeiroRegistro: any = dados[0].dados;
    const ultimoRegistro: any = dados[dados.length - 1].dados;

    const phfInicial = primeiroRegistro?.phf || primeiroRegistro?.Resumo?.phf || 0;
    const phfFinal = ultimoRegistro?.phf || ultimoRegistro?.Resumo?.phf || 0;
    const deltaPhf = phfFinal - phfInicial;

    console.log('📊 COMPARAÇÃO COM PHF DO MEDIDOR');
    console.log('=====================================');
    console.log(`PHF inicial: ${phfInicial.toFixed(3)} kWh`);
    console.log(`PHF final: ${phfFinal.toFixed(3)} kWh`);
    console.log(`Delta PHF (medidor): ${deltaPhf.toFixed(3)} kWh`);
    console.log('');
    console.log(`Energia registrada (soma consumo_phf): ${energiaRealTotal.toFixed(3)} kWh`);
    console.log(`Energia perdida (estimada gaps): ${energiaTotalEstimada.toFixed(3)} kWh`);
    console.log(`Total estimado: ${(energiaRealTotal + energiaTotalEstimada).toFixed(3)} kWh`);
    console.log('');

    const divergencia = Math.abs(deltaPhf - (energiaRealTotal + energiaTotalEstimada));
    const percentual = (divergencia / deltaPhf) * 100;

    console.log(`Diferença (PHF vs estimativa): ${divergencia.toFixed(3)} kWh (${percentual.toFixed(1)}%)`);
    console.log('');

    if (divergencia < 5) {
      console.log('✅ EXCELENTE! A estimativa está muito próxima do PHF do medidor.');
      console.log('   A metodologia de estimativa está correta.');
    } else if (divergencia < 20) {
      console.log('✅ BOA aproximação! A diferença é aceitável considerando as estimativas.');
    } else {
      console.log('⚠️ Diferença significativa. Possíveis causas:');
      console.log('   - Padrão de consumo diferente do estimado nos gaps');
      console.log('   - Carga variável não capturada pela média');
    }

    // Tempo de cobertura
    const duracaoTotal = (dataFim.getTime() - dataInicio.getTime()) / 3600000; // horas
    const porcentagemCobertura = ((duracaoTotal - duracaoTotalGaps) / duracaoTotal) * 100;

    console.log('');
    console.log('⏱️ COBERTURA TEMPORAL');
    console.log('=====================================');
    console.log(`Duração total do período: ${duracaoTotal.toFixed(2)} horas`);
    console.log(`Tempo com dados: ${(duracaoTotal - duracaoTotalGaps).toFixed(2)} horas`);
    console.log(`Tempo sem dados (gaps): ${duracaoTotalGaps.toFixed(2)} horas`);
    console.log(`Cobertura: ${porcentagemCobertura.toFixed(1)}%`);

  } catch (error) {
    console.error('❌ Erro na análise:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analiseRefinadaGaps()
  .then(() => {
    console.log('');
    console.log('✅ Análise concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
