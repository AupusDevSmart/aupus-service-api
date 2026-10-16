import type { PrismaService } from '@/core';
import { variantesDeIds } from '../tarefas/ids';

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
  return (await regrasDeDiasUteis(prisma, planta ? [planta] : []))(planta);
}

/**
 * As regras de várias plantas em quatro consultas, quantas forem as plantas:
 * a previsão e o calendário pedem a de todas as plantas com tarefa, e uma
 * leva de consultas por planta, todas ao mesmo tempo, disputava o pool.
 * Devolve a regra de cada planta pedida; outra planta (ou nenhuma) fica com a geral.
 */
export async function regrasDeDiasUteis(
  prisma: PrismaService,
  plantaIds: string[],
): Promise<(plantaId?: string | null) => RegraDeDiasUteis> {
  const plantas = [...new Set(plantaIds.map((id) => id.trim()).filter(Boolean))];
  // Os vínculos por relação no where (SQL); um include compararia Char(26) em JS
  const [vinculosDaConfiguracao, vinculosDoFeriado] = await Promise.all([
    plantas.length
      ? prisma.configuracao_plantas.findMany({
          where: { planta_id: { in: variantesDeIds(plantas) }, configuracoes: { ativo: true, geral: false } },
          select: { configuracao_id: true, planta_id: true },
        })
      : Promise.resolve([]),
    plantas.length
      ? prisma.feriado_plantas.findMany({ where: { planta_id: { in: variantesDeIds(plantas) }, feriados: { ativo: true } }, select: { feriado_id: true, planta_id: true } })
      : Promise.resolve([]),
  ]);
  const [configuracoes, feriados] = await Promise.all([
    prisma.configuracoes_dias_uteis.findMany({
      where: { ativo: true, OR: [{ geral: true }, { id: { in: [...new Set(vinculosDaConfiguracao.map((v) => v.configuracao_id))] } }] },
      orderBy: { created_at: 'desc' },
    }),
    prisma.feriados.findMany({
      where: { ativo: true, OR: [{ geral: true }, { id: { in: [...new Set(vinculosDoFeriado.map((v) => v.feriado_id))] } }] },
      select: { id: true, geral: true, data: true, recorrente: true, nome: true },
    }),
  ]);

  const configuracoesDa = agrupar(vinculosDaConfiguracao, (v) => v.planta_id, (v) => v.configuracao_id);
  const feriadosDa = agrupar(vinculosDoFeriado, (v) => v.planta_id, (v) => v.feriado_id);
  // Mais recente primeiro, como o findFirst de antes
  const geral = configuracoes.find((c) => c.geral);
  const feriadosGerais = feriados.filter((f) => f.geral);

  const regras = new Map<string, RegraDeDiasUteis>();
  const regraDa = (planta: string | null): RegraDeDiasUteis => {
    const daPlanta = planta ? configuracoesDa.get(planta) : undefined;
    const configuracao = (daPlanta && configuracoes.find((c) => !c.geral && daPlanta.has(c.id.trim()))) || geral;
    const proprios = planta ? feriadosDa.get(planta) : undefined;
    const valem = proprios ? feriados.filter((f) => f.geral || proprios.has(f.id.trim())) : feriadosGerais;
    return {
      diasDaSemana: configuracao
        ? [configuracao.domingo, configuracao.segunda, configuracao.terca, configuracao.quarta, configuracao.quinta, configuracao.sexta, configuracao.sabado]
        : SEMANA_PADRAO,
      feriados: valem.map(({ data, recorrente, nome }) => ({ data, recorrente, nome })),
      configuracao: configuracao ? { id: configuracao.id.trim(), nome: configuracao.nome } : undefined,
    };
  };
  for (const planta of plantas) regras.set(planta, regraDa(planta));
  const daGeral = regraDa(null);

  return (plantaId) => regras.get(plantaId?.trim() ?? '') ?? daGeral;
}

function agrupar<T>(lista: T[], chave: (item: T) => string, valor: (item: T) => string): Map<string, Set<string>> {
  const grupos = new Map<string, Set<string>>();
  for (const item of lista) {
    const k = chave(item).trim();
    grupos.set(k, (grupos.get(k) ?? new Set()).add(valor(item).trim()));
  }
  return grupos;
}
