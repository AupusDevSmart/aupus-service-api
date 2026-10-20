import { Prisma, PrismaService, PlantaScope } from '@/core';
import { variantesDeIds } from '../tarefas/ids';
import type { QueryDashboardManutencaoDto } from './dto/query-dashboard-manutencao.dto';
import { filtroDe, type JanelaDoPainel } from './recorte-do-painel';

/**
 * MTBF, MTTR e disponibilidade a partir dos dados de falha da OS (SN-60), com
 * a cobertura à vista (SN-80). Decisões do usuário (20/out/2026): a falha é a
 * corretiva com "o equipamento parou? Sim"; a disponibilidade é pelo
 * calendário, 24 h — não há regime de operação cadastrado.
 *
 * - A falha vale no período em que o equipamento PAROU (sem horário, quando a
 *   OS terminou): pela conclusão, a parada de um mês com a OS executada no
 *   seguinte sumia dos dois.
 * - As horas paradas são as de toda OS concluída com parada (a preventiva que
 *   parou o equipamento também o tirou de operação), só a parte dentro do
 *   período, sem contar duas vezes a mesma hora do mesmo equipamento.
 * - Número sem a base dele engana o gestor: cada um diz em quantas corretivas
 *   se baseia, quantas pararam sem horário e quantas não têm os dados de falha.
 */

/** O que a conta lê de cada OS concluída */
export interface OrdemDaConfiabilidade {
  tipo: string;
  equipamento_parou: boolean | null;
  parada_inicio: Date | null;
  parada_fim: Date | null;
  /** Quando a OS terminou (sem a data de fim, a de início) */
  fim: Date | null;
  /** Os equipamentos da OS: a mesma hora parada do mesmo equipamento conta uma vez */
  equipamentos: string[];
  id: string;
}

/** A frota: os UCs do recorte e as horas que cada um existiu no período */
export interface Frota {
  equipamentos: number;
  horas: number;
}

export interface Confiabilidade {
  /** Corretivas do período: a base de tudo */
  corretivas: number;
  /** Pararam o equipamento (as falhas do MTBF) */
  falhas: number;
  /** Pararam com início e fim da parada: as que têm duração */
  comHorario: number;
  /** Pararam sem horário: falha sem duração (não entram no MTTR nem descontam a disponibilidade) */
  semHorario: number;
  /** Sem a resposta "parou?" (anteriores ao SN-60): não se sabe se pararam */
  semDadosDeFalha: number;
  /** UCs do recorte */
  equipamentos: number;
  /** Horas da frota no período (até agora; cada UC desde que foi cadastrado) */
  horasDaFrota: number;
  /** Horas paradas dentro do período, de toda OS concluída com parada */
  horasParadas: number;
  /** Horas paradas só das corretivas (a parada não programada) */
  horasParadasNaoProgramadas: number;
  /** Média das paradas com horário das corretivas do período, em horas; null sem nenhuma */
  mttr: number | null;
  /** Horas em operação por falha; null sem falha ou sem frota */
  mtbf: number | null;
  /** Fração do tempo em operação (0 a 1); null sem frota */
  disponibilidade: number | null;
}

const horas = (ms: number) => ms / 3_600_000;
const tempo = (d: Date | null) => (d ? new Date(d).getTime() : null);

/** Soma a duração da união dos intervalos (sobrepostos contam uma vez). */
function duracaoDaUniao(intervalos: Array<[number, number]>): number {
  const ordenados = [...intervalos].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let atual: [number, number] | null = null;
  for (const [de, ate] of ordenados) {
    if (!atual || de > atual[1]) {
      if (atual) total += atual[1] - atual[0];
      atual = [de, ate];
    } else {
      atual[1] = Math.max(atual[1], ate);
    }
  }
  if (atual) total += atual[1] - atual[0];
  return total;
}

/** A conta, sem banco: o spec testa com números conhecidos. */
export function calcularConfiabilidade(
  ordens: OrdemDaConfiabilidade[],
  frota: Frota,
  janela: Pick<JanelaDoPainel, 'desde' | 'ate'>,
  agora = new Date(),
): Confiabilidade {
  const inicio = janela.desde.getTime();
  const fim = Math.min(janela.ate.getTime(), agora.getTime());
  const noPeriodo = (t: number | null) => t !== null && t >= inicio && t < fim;

  // A corretiva é do período em que parou; sem a parada, de quando terminou
  const corretivas = ordens.filter((o) => o.tipo === 'CORRETIVA' && noPeriodo(tempo(o.parada_inicio) ?? tempo(o.fim)));
  const falhas = corretivas.filter((o) => o.equipamento_parou === true);
  const comHorario = falhas.filter((o) => o.parada_inicio && o.parada_fim);
  const duracoes = comHorario.map((o) => horas(tempo(o.parada_fim)! - tempo(o.parada_inicio)!));

  // A parte de cada parada dentro do período, unida por equipamento
  const horasParadasDe = (lista: OrdemDaConfiabilidade[]) => {
    const porEquipamento = new Map<string, Array<[number, number]>>();
    for (const o of lista) {
      if (!o.parada_inicio || !o.parada_fim) continue;
      const de = Math.max(tempo(o.parada_inicio)!, inicio);
      const ate = Math.min(tempo(o.parada_fim)!, fim);
      if (ate <= de) continue;
      const chave = o.equipamentos.length ? [...o.equipamentos].sort().join('|') : `os:${o.id}`;
      porEquipamento.set(chave, [...(porEquipamento.get(chave) ?? []), [de, ate]]);
    }
    return [...porEquipamento.values()].reduce((soma, intervalos) => soma + horas(duracaoDaUniao(intervalos)), 0);
  };
  const horasParadas = horasParadasDe(ordens);
  const horasParadasNaoProgramadas = horasParadasDe(ordens.filter((o) => o.tipo === 'CORRETIVA'));

  const emOperacao = Math.max(0, frota.horas - horasParadas);

  return {
    corretivas: corretivas.length,
    falhas: falhas.length,
    comHorario: comHorario.length,
    semHorario: falhas.length - comHorario.length,
    semDadosDeFalha: corretivas.filter((o) => o.equipamento_parou === null).length,
    equipamentos: frota.equipamentos,
    horasDaFrota: frota.horas,
    horasParadas,
    horasParadasNaoProgramadas,
    mttr: duracoes.length ? duracoes.reduce((s, d) => s + d, 0) / duracoes.length : null,
    mtbf: falhas.length && frota.horas > 0 ? emOperacao / falhas.length : null,
    disponibilidade: frota.horas > 0 ? emOperacao / frota.horas : null,
  };
}

/**
 * A frota do recorte: os UCs (o componente que para, para o UC), sem os
 * virtuais do diagrama (barramento, ponto) e sem os inativos. A planta pela
 * instalação ou, no equipamento antigo sem instalação, pela coluna. Cada UC
 * conta as horas desde que foi cadastrado: a frota de hoje vezes o período
 * inteiro contava horas de equipamento que ainda não existia.
 */
export async function frotaDoRecorte(
  prisma: PrismaService,
  scope: PlantaScope,
  filtros: QueryDashboardManutencaoDto,
  janela: Pick<JanelaDoPainel, 'desde' | 'ate'>,
  agora = new Date(),
): Promise<Frota> {
  if (Array.isArray(scope) && scope.length === 0) return { equipamentos: 0, horas: 0 };
  const naPlanta = (plantas: string[]): Prisma.equipamentosWhereInput => {
    const em = { in: variantesDeIds(plantas) };
    return { OR: [{ unidade: { planta_id: em } }, { unidade_id: null, planta_id: em }] };
  };

  const condicoes: Prisma.equipamentosWhereInput[] = [
    { OR: [{ tipo_equipamento_id: null }, { tipo_equipamento_rel: { codigo: { notIn: ['PONTO', 'BARRAMENTO'] } } }] },
    // O status é texto livre e anulável ("Inativo", "inativo", "Inativo " vindo do
    // NexOn): sem caixa e por trecho, e o nulo é ativo (o "<>" do SQL o deixaria de fora)
    { OR: [{ status: null }, { NOT: { status: { contains: 'inativ', mode: 'insensitive' } } }] },
    { created_at: { lt: janela.ate } },
  ];
  if (Array.isArray(scope)) condicoes.push(naPlanta(scope));
  const planta = filtroDe(filtros.plantaId);
  if (planta) condicoes.push(naPlanta([planta]));
  const unidade = filtroDe(filtros.unidadeId);
  if (unidade) condicoes.push({ unidade_id: { in: variantesDeIds([unidade]) } });
  const criticidade = filtroDe(filtros.criticidade);
  if (criticidade) condicoes.push({ criticidade });

  const ucs = await prisma.equipamentos.findMany({
    where: { deleted_at: null, classificacao: 'UC', AND: condicoes },
    select: { created_at: true },
  });

  const inicio = janela.desde.getTime();
  const fim = Math.min(janela.ate.getTime(), agora.getTime());
  const horasDaFrota = ucs.reduce((soma, uc) => soma + Math.max(0, horas(fim - Math.max(inicio, new Date(uc.created_at).getTime()))), 0);
  return { equipamentos: ucs.length, horas: horasDaFrota };
}
