import { Prisma, PrismaService, PlantaScope, StatusOS } from '@/core';
import { ordemDasPlantas } from '../../common/helpers/filtros-da-os';
import { instalacoesDasOrdens } from '../../common/helpers/instalacao-da-os';
import { variantesDeIds } from '../tarefas/ids';
import type { PeriodoDoPainel, QueryDashboardManutencaoDto } from './dto/query-dashboard-manutencao.dto';

/**
 * O recorte do painel de manutenção (SN-79): o período, a planta, a
 * instalação, a criticidade e a equipe, pela MESMA regra das listas de OS. O
 * painel tinha a dele: a instalação só pela coluna do equipamento (a OS de
 * tarefa, de anomalia ou de componente sumia do filtro), a planta sem o UC
 * pai, e o período cortando tudo pela criação — inclusive o backlog.
 */

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Brasília em fuso fixo (-03:00), como a agenda e as reservas: o Brasil não tem horário de verão desde 2019 */
const DESLOCAMENTO_MS = 3 * 3_600_000;

/** Ordens que ainda consomem a equipe. */
export const STATUS_EM_ABERTO: StatusOS[] = [StatusOS.PENDENTE, StatusOS.EM_EXECUCAO, StatusOS.PAUSADA];
/** Ordens que já produziram resultado. */
export const STATUS_CONCLUIDO: StatusOS[] = [StatusOS.EXECUTADA, StatusOS.AUDITADA, StatusOS.FINALIZADA];

export interface MesDaJanela {
  rotulo: string;
  ano: number;
  mes: number;
}

/** Os meses do período, do mais antigo ao atual, e os limites dele: [desde, ate). */
export interface JanelaDoPainel {
  desde: Date;
  ate: Date;
  meses: MesDaJanela[];
}

/** O ano e o mês (0 a 11) de um instante em Brasília. O do servidor (UTC na produção) virava o mês às 21h. */
export function mesEmBrasilia(instante: Date): { ano: number; mes: number } {
  const local = new Date(instante.getTime() - DESLOCAMENTO_MS);
  return { ano: local.getUTCFullYear(), mes: local.getUTCMonth() };
}

/** A meia-noite de Brasília do dia 1º do mês (o mês pode passar de 11: o Date normaliza) */
const inicioDoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 1) + DESLOCAMENTO_MS);

/**
 * A janela do período escolhido. Os gráficos acompanham: eram sempre 12 meses,
 * qualquer que fosse o período do filtro. "ano" é o ano corrente até o mês atual.
 */
export function janelaDoPeriodo(periodo: PeriodoDoPainel | undefined, agora = new Date()): JanelaDoPainel {
  const { ano, mes } = mesEmBrasilia(agora);
  const quantos = periodo === 'mes' ? 1 : periodo === 'trimestre' ? 3 : periodo === 'ano' ? mes + 1 : 12;
  const meses = Array.from({ length: quantos }, (_, i) => {
    const d = new Date(Date.UTC(ano, mes - (quantos - 1 - i), 1));
    return { rotulo: MESES_CURTOS[d.getUTCMonth()], ano: d.getUTCFullYear(), mes: d.getUTCMonth() };
  });
  return { desde: inicioDoMes(meses[0].ano, meses[0].mes), ate: inicioDoMes(ano, mes + 1), meses };
}

/** A posição do mês do instante na janela, ou -1 fora dela. */
export function indiceDoMes(instante: Date | null | undefined, janela: JanelaDoPainel): number {
  if (!instante) return -1;
  const { ano, mes } = mesEmBrasilia(new Date(instante));
  return janela.meses.findIndex((m) => m.ano === ano && m.mes === mes);
}

/** O instante está no período? */
export function naJanela(instante: Date | null | undefined, janela: JanelaDoPainel): boolean {
  if (!instante) return false;
  const t = new Date(instante).getTime();
  return t >= janela.desde.getTime() && t < janela.ate.getTime();
}

/** O valor do filtro, ou null para "todas" (vazio ou "all"). */
export const filtroDe = (valor?: string | null): string | null => {
  const texto = valor?.trim();
  return texto && texto !== 'all' ? texto : null;
};

/** O SELECT das OS do painel */
export const SELECT_DA_ORDEM = {
  id: true,
  criado_em: true,
  status: true,
  tipo: true,
  origem: true,
  tempo_estimado: true,
  custo_real: true,
  orcamento_previsto: true,
  custos_adicionais: true,
  data_hora_programada: true,
  data_hora_inicio_real: true,
  data_hora_fim_real: true,
  time_equipe: true,
  equipamento_id: true,
  equipamento: { select: { nome: true } },
} satisfies Prisma.ordens_servicoSelect;

export type OrdemDoPainel = Prisma.ordens_servicoGetPayload<{ select: typeof SELECT_DA_ORDEM }> & {
  /** O equipamento DA OS: coluna, tarefa congelada, anomalia ou solicitação (pode ser mais de um, ou nenhum) */
  equipamentos: EquipamentoDaOrdem[];
};

export interface EquipamentoDaOrdem {
  id: string;
  nome: string;
  criticidade: string | null;
}

/**
 * Quando a OS terminou. Sem a data de fim (legado, fluxo antigo), vale a de
 * início: sem nada, a concluída sumiria calada do custo, do MTTR e do HH.
 */
export const fimDaOrdem = (o: Pick<OrdemDoPainel, 'data_hora_fim_real' | 'data_hora_inicio_real'>) =>
  o.data_hora_fim_real ?? o.data_hora_inicio_real;

/**
 * As OS do painel: a planta e o escopo pela coluna da OS ou pelo equipamento
 * (o componente pelo UC pai), como a lista de Execução (`ordemDasPlantas`); a
 * instalação e a criticidade pelo equipamento DA OS, que mora na tarefa, na
 * anomalia ou na solicitação (a coluna quase nunca vem preenchida).
 *
 * Vêm as que importam para algum número do período: as abertas (o backlog é de
 * agora, não do período — a OS antiga ainda aberta sumia), as criadas, as
 * programadas e as concluídas nele. Cada bloco filtra pela data que mede.
 */
export async function ordensDoPainel(
  prisma: PrismaService,
  scope: PlantaScope,
  filtros: QueryDashboardManutencaoDto,
  janela: JanelaDoPainel,
): Promise<OrdemDoPainel[]> {
  if (Array.isArray(scope) && scope.length === 0) return [];

  const noPeriodo = { gte: janela.desde, lt: janela.ate };
  const condicoes: Prisma.ordens_servicoWhereInput[] = [
    {
      OR: [
        { status: { in: STATUS_EM_ABERTO } },
        { criado_em: noPeriodo },
        { data_hora_programada: noPeriodo },
        { data_hora_fim_real: noPeriodo },
        { data_hora_fim_real: null, data_hora_inicio_real: noPeriodo },
      ],
    },
  ];
  if (Array.isArray(scope)) condicoes.push(ordemDasPlantas(scope));
  const planta = filtroDe(filtros.plantaId);
  if (planta) condicoes.push(ordemDasPlantas([planta]));

  const linhas = await prisma.ordens_servico.findMany({
    where: { deletado_em: null, AND: condicoes },
    select: SELECT_DA_ORDEM,
  });

  // A equipe é texto livre: o combo mostra aparado, e "Equipe X " gravado com espaço nunca casava
  const equipe = filtroDe(filtros.equipe);
  const daEquipe = equipe ? linhas.filter((o) => o.time_equipe?.trim() === equipe) : linhas;

  const equipamentos = await equipamentosDasOrdens(prisma, daEquipe.map((o) => o.id));
  let ordens: OrdemDoPainel[] = daEquipe.map((o) => ({ ...o, equipamentos: equipamentos.get(o.id.trim()) ?? [] }));

  const unidade = filtroDe(filtros.unidadeId);
  if (unidade && ordens.length) {
    const instalacoes = await instalacoesDasOrdens(prisma, ordens.map((o) => o.id));
    const daUnidade = new Set(
      [...instalacoes.entries()].filter(([, lista]) => lista.some((i) => i.id.trim() === unidade)).map(([id]) => id.trim()),
    );
    ordens = ordens.filter((o) => daUnidade.has(o.id.trim()));
  }

  // A OS com equipamentos de criticidades diferentes entra em cada uma delas
  const criticidade = filtroDe(filtros.criticidade);
  if (criticidade) ordens = ordens.filter((o) => o.equipamentos.some((e) => e.criticidade === criticidade));

  return ordens;
}

/**
 * O equipamento de cada OS pela regra da instalação (`instalacao-da-os.ts`):
 * a coluna, a tarefa congelada, a anomalia e a solicitação da programação.
 * SQL cru com trim (as FKs misturam Char(26) e texto, e o include do Prisma
 * compara em JS) e os ids num array só: com `IN (...)` repetido quatro vezes,
 * 8 mil OS estouravam o limite de parâmetros do Prisma.
 */
export async function equipamentosDasOrdens(prisma: PrismaService, ordemIds: string[]): Promise<Map<string, EquipamentoDaOrdem[]>> {
  const mapa = new Map<string, EquipamentoDaOrdem[]>();
  if (ordemIds.length === 0) return mapa;
  const ids = ordemIds.map((id) => id.trim());

  const linhas = await prisma.$queryRaw<Array<{ ref: string; id: string; nome: string; criticidade: string | null }>>(Prisma.sql`
    WITH origens AS (
      SELECT trim(t.os_id) AS ref, trim(t.equipamento_id) AS eq FROM tarefas_os t WHERE t.os_id = ANY(${ids}::text[])
      UNION
      SELECT trim(os.id), trim(os.equipamento_id) FROM ordens_servico os WHERE os.id = ANY(${ids}::text[])
      UNION
      SELECT trim(os.id), trim(a.equipamento_id)
        FROM ordens_servico os JOIN anomalias a ON trim(a.id) = trim(os.anomalia_id)
       WHERE os.id = ANY(${ids}::text[])
      UNION
      SELECT trim(os.id), trim(s.equipamento_id)
        FROM ordens_servico os
        JOIN programacoes_os po ON po.id = os.programacao_id
        JOIN solicitacoes_servico s ON trim(s.id) = trim(po.solicitacao_servico_id)
       WHERE os.id = ANY(${ids}::text[])
    )
    SELECT DISTINCT o.ref, trim(e.id) AS id, e.nome, trim(e.criticidade) AS criticidade
      FROM origens o JOIN equipamentos e ON trim(e.id) = o.eq
     WHERE o.eq IS NOT NULL
  `);

  for (const linha of linhas) {
    const lista = mapa.get(linha.ref) ?? [];
    lista.push({ id: linha.id, nome: linha.nome, criticidade: linha.criticidade });
    mapa.set(linha.ref, lista);
  }
  return mapa;
}

/**
 * A anomalia de uma planta: a gravada nela e, na antiga sem planta, a do
 * equipamento ou a do UC pai (a mesma forma do `ordemDasPlantas`).
 */
function anomaliaDasPlantas(plantas: string[]): Prisma.anomaliasWhereInput {
  const em = { in: variantesDeIds(plantas) };
  return {
    OR: [
      { planta_id: em },
      { planta_id: null, equipamento: { unidade: { planta_id: em } } },
      { planta_id: null, equipamento: { equipamento_pai: { unidade: { planta_id: em } } } },
    ],
  };
}

/**
 * As anomalias do painel: a planta como acima; a instalação e a criticidade
 * pelo equipamento — o componente pela unidade do UC pai, como a lista de
 * anomalias.
 */
export function filtroDasAnomalias(scope: PlantaScope, filtros: QueryDashboardManutencaoDto): Prisma.anomaliasWhereInput {
  if (Array.isArray(scope) && scope.length === 0) return { id: '__NEVER__' };
  const condicoes: Prisma.anomaliasWhereInput[] = [];
  if (Array.isArray(scope)) condicoes.push(anomaliaDasPlantas(scope));

  const planta = filtroDe(filtros.plantaId);
  if (planta) condicoes.push(anomaliaDasPlantas([planta]));

  const unidade = filtroDe(filtros.unidadeId);
  if (unidade) {
    const em = { in: variantesDeIds([unidade]) };
    condicoes.push({ equipamento: { OR: [{ unidade_id: em }, { equipamento_pai: { unidade_id: em } }] } });
  }

  const criticidade = filtroDe(filtros.criticidade);
  if (criticidade) condicoes.push({ equipamento: { criticidade } });

  return { deleted_at: null, ...(condicoes.length && { AND: condicoes }) };
}
