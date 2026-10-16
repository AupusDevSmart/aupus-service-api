import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '@/core';
import { FORMATO_DO_DIA, diaDoCalendario } from '../../modules/agenda/dia-do-calendario';
import { variantesDeIds } from '../../modules/tarefas/ids';

/**
 * Os filtros de período, planta e equipamento das listas de Programação e
 * Execução e do calendário (SN-55), num lugar só: as três telas têm de achar a
 * mesma OS pelo mesmo equipamento.
 */

/** O equipamento e os componentes dele (as OS das UARs também são dele). null = sem filtro; [] = não existe. */
export async function equipamentoEComponentes(prisma: PrismaService, equipamentoId?: string | null): Promise<string[] | null> {
  const id = equipamentoId?.trim();
  if (!id) return null;
  const variantes = variantesDeIds([id]);
  const lista = await prisma.equipamentos.findMany({
    where: { OR: [{ id: { in: variantes } }, { equipamento_pai_id: { in: variantes } }] },
    select: { id: true },
  });
  return lista.map((e) => e.id.trim());
}

/**
 * O período pedido. AAAA-MM-DD é dia de calendário em Brasília, do começo ao
 * fim do dia (o fim antes era meia-noite UTC: a OS do último dia ficava de
 * fora); outro formato (ISO completo) vale como veio.
 */
export function periodoDoFiltro(inicio?: string, fim?: string): Prisma.DateTimeFilter | null {
  if (!inicio && !fim) return null;
  const de = inicio ? (FORMATO_DO_DIA.test(inicio) ? diaDoCalendario(inicio) : new Date(inicio)) : undefined;
  const ate = fim ? (FORMATO_DO_DIA.test(fim) ? diaDoCalendario(fim, true) : new Date(fim)) : undefined;
  // Invertido devolvia lista vazia calada: "não existe nada no período" (o calendário já recusava)
  if (de && ate && ate.getTime() < de.getTime()) throw new BadRequestException('O fim vem antes do início');
  return { ...(de && { gte: de }), ...(ate && { lte: ate }) };
}

/**
 * A programação de uma planta: a dela ou a do equipamento. É a regra do
 * escopo, e o filtro de planta usa a mesma: só pela coluna, a que não tinha
 * planta aparecia em "todas" e sumia ao escolher a planta dela.
 */
export function programacaoDasPlantas(plantas: string[]): Prisma.programacoes_osWhereInput {
  const em = { in: variantesDeIds(plantas) };
  return { OR: [{ planta_id: em }, { equipamento: { unidade: { planta_id: em } } }] };
}

/** A OS de uma planta: a dela ou, na OS antiga sem planta (SN-33), a do equipamento ou a do UC pai. */
export function ordemDasPlantas(plantas: string[]): Prisma.ordens_servicoWhereInput {
  const em = { in: variantesDeIds(plantas) };
  return {
    OR: [
      { planta_id: em },
      { planta_id: null, equipamento: { unidade: { planta_id: em } } },
      { planta_id: null, equipamento: { equipamento_pai: { unidade: { planta_id: em } } } },
    ],
  };
}

/** Os equipamentos de uma instalação: os UCs dela e os componentes deles. */
async function equipamentosDaUnidade(prisma: PrismaService, unidadeId: string): Promise<string[]> {
  const ucs = await prisma.equipamentos.findMany({ where: { unidade_id: { in: variantesDeIds([unidadeId]) } }, select: { id: true } });
  if (ucs.length === 0) return [];
  const componentes = await prisma.equipamentos.findMany({
    where: { equipamento_pai_id: { in: variantesDeIds(ucs.map((u) => u.id)) } },
    select: { id: true },
  });
  return [...ucs, ...componentes].map((e) => e.id.trim());
}

/**
 * A programação de uma instalação, pela regra da instalação da OS: o
 * equipamento (coluna, tarefa, anomalia, solicitação) ou a unidade da
 * solicitação. Só pela coluna, a lista por unidade perdia quase todas.
 */
export async function programacaoDaUnidade(prisma: PrismaService, unidadeId: string): Promise<Prisma.programacoes_osWhereInput> {
  const id = unidadeId.trim();
  const daSolicitacao: Prisma.programacoes_osWhereInput = { solicitacao_servico: { unidade_id: { in: variantesDeIds([id]) } } };
  const equipamentos = await equipamentosDaUnidade(prisma, id);
  return equipamentos.length ? { OR: [...condicoesDaProgramacaoDoEquipamento(equipamentos), daSolicitacao] } : daSolicitacao;
}

/**
 * A programação pela data dela: a do gerador (`data_hora_programada`) ou, sem
 * ela, a que o formulário grava (`data_previsao_inicio`) — a mesma escolha da
 * aprovação ao criar a OS e do calendário. `null` = sem data nenhuma.
 */
export function programacaoNaData(quando: Prisma.DateTimeFilter | null): Prisma.programacoes_osWhereInput {
  return quando
    ? { OR: [{ data_hora_programada: quando }, { data_hora_programada: null, data_previsao_inicio: quando }] }
    : { data_hora_programada: null, data_previsao_inicio: null };
}

/**
 * A programação de um equipamento pela regra da instalação da OS
 * (`instalacao-da-os.ts`): a coluna quase nunca vem; o equipamento está na
 * tarefa congelada, na anomalia ou na solicitação de origem.
 */
export function programacaoDoEquipamento(equipamentos: string[]): Prisma.programacoes_osWhereInput {
  return { OR: condicoesDaProgramacaoDoEquipamento(equipamentos) };
}

function condicoesDaProgramacaoDoEquipamento(equipamentos: string[]): Prisma.programacoes_osWhereInput[] {
  const em = { in: variantesDeIds(equipamentos) };
  return [
    { equipamento_id: em },
    { tarefas_programacao: { some: { equipamento_id: em } } },
    { anomalia: { equipamento_id: em } },
    { solicitacao_servico: { equipamento_id: em } },
  ];
}

/** A OS de um equipamento, pela mesma regra; a solicitação vem pela programação (a OS não a guarda). */
export function ordemDoEquipamento(equipamentos: string[]): Prisma.ordens_servicoWhereInput {
  const em = { in: variantesDeIds(equipamentos) };
  return {
    OR: [
      { equipamento_id: em },
      { tarefas_os: { some: { equipamento_id: em } } },
      { anomalia: { equipamento_id: em } },
      { programacao: { solicitacao_servico: { equipamento_id: em } } },
    ],
  };
}
