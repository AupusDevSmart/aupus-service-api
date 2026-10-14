import type { PrismaService } from '@/core';

/**
 * Dia útil de uma planta: a semana configurada (a da planta, senão a geral,
 * senão segunda a sexta) menos os feriados (gerais e os da planta; o
 * recorrente vale todo ano no mesmo dia e mês).
 *
 * O dia é o de Brasília (-03:00 fixo, sem horário de verão desde 2019 — a
 * mesma convenção da reserva de viatura). Contar pelo fuso do servidor fazia
 * a noite de sábado virar domingo.
 *
 * Uma regra só para a agenda (verificar dia útil, calendário) e para o
 * gerador automático de programações.
 */

const BRASILIA_MS = -3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Domingo..sábado, como `Date.getDay()`. */
export const SEMANA_PADRAO: boolean[] = [false, true, true, true, true, true, false];

export interface FeriadoDaRegra {
  /** Como o banco guarda (@db.Date): meia-noite UTC do dia. */
  data: Date;
  recorrente: boolean;
  nome?: string;
}

export interface RegraDeDiasUteis {
  /** Índice 0 = domingo. */
  diasDaSemana: boolean[];
  feriados: FeriadoDaRegra[];
  configuracao?: { id: string; nome: string };
}

export interface DiaCivil {
  ano: number;
  mes: number;
  dia: number;
  diaDaSemana: number;
}

export function diaEmBrasilia(instante: Date): DiaCivil {
  const local = new Date(instante.getTime() + BRASILIA_MS);
  return {
    ano: local.getUTCFullYear(),
    mes: local.getUTCMonth() + 1,
    dia: local.getUTCDate(),
    diaDaSemana: local.getUTCDay(),
  };
}

export function feriadoDoDia(dia: DiaCivil, feriados: FeriadoDaRegra[]): FeriadoDaRegra | undefined {
  return feriados.find((f) => {
    const mesmoDia = f.data.getUTCMonth() + 1 === dia.mes && f.data.getUTCDate() === dia.dia;
    return mesmoDia && (f.recorrente || f.data.getUTCFullYear() === dia.ano);
  });
}

export function ehDiaUtil(instante: Date, regra: RegraDeDiasUteis): boolean {
  const dia = diaEmBrasilia(instante);
  return !!regra.diasDaSemana[dia.diaDaSemana] && !feriadoDoDia(dia, regra.feriados);
}

/**
 * O próprio instante, se cair em dia útil; senão o mesmo horário no próximo
 * dia útil. Sem dia útil em `limiteDias`, devolve o instante pedido (uma
 * configuração vazia não pode travar o gerador).
 */
export function proximoDiaUtil(instante: Date, regra: RegraDeDiasUteis, limiteDias = 60): Date {
  for (let i = 0; i <= limiteDias; i++) {
    const candidato = new Date(instante.getTime() + i * DIA_MS);
    if (ehDiaUtil(candidato, regra)) return candidato;
  }
  return instante;
}

/** Carrega a regra de uma planta: a configuração dela (ou a geral) e os feriados que valem para ela. */
export async function regraDeDiasUteis(prisma: PrismaService, plantaId?: string | null): Promise<RegraDeDiasUteis> {
  const planta = plantaId?.trim() || null;

  const daPlanta = planta
    ? await prisma.configuracoes_dias_uteis.findFirst({
        where: { ativo: true, geral: false, configuracao_plantas: { some: { planta_id: planta } } },
        orderBy: { created_at: 'desc' },
      })
    : null;
  const configuracao =
    daPlanta ??
    (await prisma.configuracoes_dias_uteis.findFirst({ where: { ativo: true, geral: true }, orderBy: { created_at: 'desc' } }));

  const feriados = await prisma.feriados.findMany({
    where: {
      ativo: true,
      OR: [{ geral: true }, ...(planta ? [{ feriado_plantas: { some: { planta_id: planta } } }] : [])],
    },
    select: { data: true, recorrente: true, nome: true },
  });

  return {
    diasDaSemana: configuracao
      ? [
          configuracao.domingo,
          configuracao.segunda,
          configuracao.terca,
          configuracao.quarta,
          configuracao.quinta,
          configuracao.sexta,
          configuracao.sabado,
        ]
      : SEMANA_PADRAO,
    feriados,
    configuracao: configuracao ? { id: configuracao.id.trim(), nome: configuracao.nome } : undefined,
  };
}
