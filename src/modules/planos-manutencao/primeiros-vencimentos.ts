import { BadRequestException } from '@nestjs/common';
import { diaDoCalendario } from '../agenda/dia-do-calendario';
import { proximoDiaUtil, type RegraDeDiasUteis } from '../agenda/dias-uteis';
import { HORIZONTE_DIAS, cicloNoSegundo, proximaRodadaDoGerador } from '../tarefas/ciclos-das-tarefas';
import { calcularProximaExecucao } from '../tarefas/periodicidade';

const DIA_MS = 86_400_000;
/** Até onde a data de início vai: o plano de quem já fazia a manutenção há anos, ou o de quem ainda vai começar. */
const DIAS_PARA_TRAS = 5 * 366;
const DIAS_PARA_FRENTE = 366;

/**
 * A âncora das tarefas da cópia a partir da data de início que a pessoa diz
 * (SN-53): 00:00 de Brasília do dia. Antes a âncora era o instante do vínculo,
 * e a semestral feita há cinco meses voltava a vencer só daqui a seis.
 */
export function ancoraDoInicio(dia: string, agora: Date = new Date()): Date {
  const ancora = diaDoCalendario(dia);
  const antes = agora.getTime() - DIAS_PARA_TRAS * DIA_MS;
  const depois = agora.getTime() + DIAS_PARA_FRENTE * DIA_MS;
  if (ancora.getTime() < antes || ancora.getTime() > depois) {
    throw new BadRequestException('A data de início vai de até 5 anos atrás a até 1 ano à frente');
  }
  return ancora;
}

export interface TarefaDoTemplate {
  id: string;
  tag: string;
  nome: string;
  ordem: number;
  frequencia: string | null;
  frequencia_personalizada: number | null;
}

export interface PrimeiroVencimento {
  /** A tarefa do TEMPLATE: a cópia ainda não existe. */
  tarefa_id: string;
  tag: string;
  nome: string;
  frequencia: string | null;
  frequencia_personalizada: number | null;
  /** O primeiro vencimento: a data de início mais o intervalo. null = sem periodicidade (o gerador não a programa). */
  vence_em: Date | null;
  /** Já vence vencida: o gerador a programa na primeira rodada. */
  atrasada: boolean;
  /** O próximo dia útil da planta (null sem equipamento ou sem planta). */
  data_programada: Date | null;
  /** A rodada do gerador (3h de Brasília) que cria a programação; null se não sai. */
  programacao_a_partir_de: Date | null;
}

/**
 * O primeiro vencimento de cada tarefa do template se o vínculo começar na
 * âncora dada, pela MESMA conta do gerador e da previsão da agenda: a cópia
 * nasce sem execução, então a base é a âncora (`calcularProximaExecucao`), no
 * segundo como o gerador grava. A tela mostra isto antes de confirmar.
 */
export function primeirosVencimentos(
  tarefas: TarefaDoTemplate[],
  ancora: Date,
  regra: RegraDeDiasUteis | undefined,
  agora: Date = new Date(),
): PrimeiroVencimento[] {
  return [...tarefas]
    .sort((a, b) => a.ordem - b.ordem)
    .map((t) => {
      const proxima = calcularProximaExecucao({ frequencia: t.frequencia, frequencia_personalizada: t.frequencia_personalizada, data_ancora: ancora });
      const vence = proxima ? cicloNoSegundo(proxima) : null;
      return {
        tarefa_id: t.id.trim(),
        tag: t.tag,
        nome: t.nome,
        frequencia: t.frequencia,
        frequencia_personalizada: t.frequencia_personalizada,
        vence_em: vence,
        atrasada: !!vence && vence.getTime() < agora.getTime(),
        data_programada: vence && regra ? proximoDiaUtil(vence, regra) : null,
        programacao_a_partir_de:
          vence && regra ? proximaRodadaDoGerador(new Date(Math.max(vence.getTime() - HORIZONTE_DIAS * DIA_MS, agora.getTime()))) : null,
      };
    });
}
