// src/modules/tarefas/periodicidade.ts

/**
 * A conta da periodicidade, num lugar só.
 *
 * O agendador (cron) e a aba de histórico do equipamento precisam responder a
 * mesma pergunta — "quando é a próxima?" — e antes respondiam diferente: a tela
 * usava `data_ultima_execucao ?? data_ancora`, o cron usava a MAIS RECENTE
 * entre as duas. A diferença aparece depois de uma OS cancelada, que avança a
 * âncora sem registrar execução: a tela dizia "atrasada" enquanto o cron
 * considerava a tarefa em dia.
 */

export const FREQUENCIA_DIAS: Record<string, number> = {
  DIARIA: 1,
  SEMANAL: 7,
  QUINZENAL: 15,
  MENSAL: 30,
  BIMESTRAL: 60,
  TRIMESTRAL: 90,
  SEMESTRAL: 180,
  ANUAL: 365,
};

export interface TarefaPeriodica {
  frequencia?: string | null;
  frequencia_personalizada?: number | null;
  data_ancora?: Date | string | null;
  created_at?: Date | string | null;
}

export const intervaloEmDias = (tarefa: TarefaPeriodica): number | null => {
  const freq = tarefa.frequencia;
  if (!freq) return null;
  if (freq === 'PERSONALIZADA') return tarefa.frequencia_personalizada || null;
  return FREQUENCIA_DIAS[freq] || null;
};

const paraData = (valor?: Date | string | null): Date | null => {
  if (!valor) return null;
  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
};

/**
 * Próxima execução = base + intervalo.
 *
 * A base é a mais recente entre a execução efetiva e a âncora. Cancelar uma OS
 * é decisão de planejamento — aquele ciclo não vai acontecer —, e é por isso
 * que a âncora pode estar à frente da última execução.
 *
 * Sem nenhuma das duas, cai em `created_at`. É um fallback ruim de propósito
 * visível: tarefa anual criada hoje só apareceria daqui a um ano.
 */
export const calcularProximaExecucao = (
  tarefa: TarefaPeriodica,
  ultimaExecucao?: Date | string | null,
): Date | null => {
  const dias = intervaloEmDias(tarefa);
  if (!dias) return null;

  const candidatas = [paraData(ultimaExecucao), paraData(tarefa.data_ancora)]
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime());

  const base = candidatas[0] ?? paraData(tarefa.created_at);
  if (!base) return null;

  return new Date(base.getTime() + dias * 24 * 60 * 60 * 1000);
};

/** Dias até a próxima; negativo quer dizer atrasada. Null quando não há periodicidade. */
export const diasAteProxima = (proxima: Date | null, agora = new Date()): number | null => {
  if (!proxima) return null;

  const hoje = new Date(agora);
  hoje.setHours(0, 0, 0, 0);

  const alvo = new Date(proxima);
  alvo.setHours(0, 0, 0, 0);

  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
};
