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

/**
 * As frequências que seguem o calendário quando a periodicidade por calendário
 * está ligada (SN-54): o mesmo dia do mês, ou o último quando o mês é mais
 * curto. Em dias fixos, o vencimento escorregava pelo mês ao longo do ano
 * (mensal = 30 dias: de 10/01 a 07/07 em seis ciclos).
 */
export const FREQUENCIA_MESES: Record<string, number> = {
  MENSAL: 1,
  BIMESTRAL: 2,
  TRIMESTRAL: 3,
  SEMESTRAL: 6,
  ANUAL: 12,
};

/**
 * A periodicidade por calendário (SN-54). Desligada, conta dias fixos como
 * sempre. Liga-se no deploy depois de ver a comparação das tarefas reais
 * (`scripts/db/comparar-periodicidade.ts`): muda o vencimento de toda tarefa
 * mensal ou mais longa.
 */
export const periodicidadePorCalendario = (): boolean => valorDaVariavel() === 'on';

const valorDaVariavel = () => (process.env.PERIODICIDADE_POR_CALENDARIO ?? '').trim().toLowerCase();

/** O modo que está valendo, para o log do gerador dizer qual conta usou. */
export const modoDaPeriodicidade = () => (periodicidadePorCalendario() ? 'por calendário' : 'em dias fixos');

/** A variável com valor que não liga nem desliga ("true", "1"...): seguiria em dias calada. */
export function avisoDaPeriodicidade(): string | null {
  const valor = valorDaVariavel();
  return valor && valor !== 'on' && valor !== 'off'
    ? `PERIODICIDADE_POR_CALENDARIO="${process.env.PERIODICIDADE_POR_CALENDARIO}" não é "on" nem vazio: seguindo em dias fixos`
    : null;
}

/** A frequência anda por meses de calendário (e não por dias) com a troca ligada. */
export const andaPorMeses = (tarefa: TarefaPeriodica, porCalendario: boolean = periodicidadePorCalendario()): boolean =>
  porCalendario && !!FREQUENCIA_MESES[tarefa.frequencia ?? ''];

const DIA_MS = 24 * 60 * 60 * 1000;
/** Brasília, -03:00 fixo: o dia do mês é o de quem usa, não o do UTC. */
const BRASILIA_MS = -3 * 60 * 60 * 1000;

/**
 * `meses` meses depois, no relógio de Brasília: o mesmo dia do mês e a mesma
 * hora, ou o último dia quando o mês é mais curto (31/01 + 1 = 28/02; 29/02 +
 * 12 = 28/02). Contar pelo UTC levaria a execução das 23h de Brasília ao dia
 * seguinte.
 */
export function somarMeses(instante: Date, meses: number): Date {
  const local = new Date(instante.getTime() + BRASILIA_MS);
  const ano = local.getUTCFullYear();
  const mes = local.getUTCMonth() + meses;
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const alvo = Date.UTC(
    ano,
    mes,
    Math.min(local.getUTCDate(), ultimoDia),
    local.getUTCHours(),
    local.getUTCMinutes(),
    local.getUTCSeconds(),
    local.getUTCMilliseconds(),
  );
  return new Date(alvo - BRASILIA_MS);
}

/**
 * `passos` ciclos depois de `base` (negativo volta): por meses de calendário
 * ou por dias fixos. null = sem periodicidade.
 */
export function somarCiclos(
  tarefa: TarefaPeriodica,
  base: Date,
  passos = 1,
  porCalendario: boolean = periodicidadePorCalendario(),
): Date | null {
  const meses = porCalendario ? FREQUENCIA_MESES[tarefa.frequencia ?? ''] : undefined;
  if (meses) return somarMeses(base, meses * passos);
  const dias = intervaloEmDias(tarefa);
  if (!dias) return null;
  return new Date(base.getTime() + dias * passos * DIA_MS);
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
  porCalendario: boolean = periodicidadePorCalendario(),
): Date | null => {
  if (!intervaloEmDias(tarefa)) return null;
  const base = baseDoCiclo(tarefa, ultimaExecucao);
  return base ? somarCiclos(tarefa, base, 1, porCalendario) : null;
};

/**
 * A próxima pela conta de dias fixos, a de antes do SN-54. Na troca, as
 * programações abertas têm o ciclo gravado por ela: o gerador e a previsão
 * casam o ciclo aberto pelas duas contas, senão a troca criaria o mesmo ciclo
 * de novo (com a data nova) por cima do que já está programado.
 */
export const calcularProximaExecucaoPorDias = (tarefa: TarefaPeriodica, ultimaExecucao?: Date | string | null): Date | null =>
  calcularProximaExecucao(tarefa, ultimaExecucao, false);

/**
 * O mesmo ciclo pelas DUAS contas (dias fixos e calendário), qualquer que seja
 * a ligada: a programação aberta pode ter sido gravada pela outra. Ligar casa
 * as abertas por dias; desligar depois de ligar casa as abertas por calendário
 * — só pela conta da vez, o gerador duplicaria o vencimento nas duas direções.
 */
export const ciclosEquivalentes = (tarefa: TarefaPeriodica, ultimaExecucao?: Date | string | null): Date[] =>
  [calcularProximaExecucao(tarefa, ultimaExecucao, false), calcularProximaExecucao(tarefa, ultimaExecucao, true)].filter(
    (d): d is Date => !!d,
  );

/** A base do ciclo: a mais recente entre a execução efetiva e a âncora; sem nenhuma, a criação. */
function baseDoCiclo(tarefa: TarefaPeriodica, ultimaExecucao?: Date | string | null): Date | null {
  const candidatas = [paraData(ultimaExecucao), paraData(tarefa.data_ancora)]
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime());
  return candidatas[0] ?? paraData(tarefa.created_at);
}

/** Dias até a próxima; negativo quer dizer atrasada. Null quando não há periodicidade. */
export const diasAteProxima = (proxima: Date | null, agora = new Date()): number | null => {
  if (!proxima) return null;

  const hoje = new Date(agora);
  hoje.setHours(0, 0, 0, 0);

  const alvo = new Date(proxima);
  alvo.setHours(0, 0, 0, 0);

  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
};
