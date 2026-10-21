import { BadRequestException } from '@nestjs/common';
import type { Prisma, tarefas_programacao_os } from '@prisma/client';
import { origemDaProgramacao, type OrigemDaOS } from '@/common/helpers/status-da-origem';
import { variantesDeIds } from '../tarefas/ids';

/**
 * As instruções da programação que não vêm por tarefa (SN-86): as da anomalia,
 * as da solicitação e as que o planejador acrescenta. Cada uma é uma linha de
 * `tarefas_programacao_os` com `origem_item = 'INSTRUCAO'` e sem tarefa,
 * congelada como a da tarefa: a execução trata as duas igual (checklist
 * agrupado, "feita", motivo de não feita, PDF, conteúdo selado).
 */

type Cliente = Pick<
  Prisma.TransactionClient,
  | 'anomalias_instrucoes'
  | 'solicitacoes_instrucoes'
  | 'instrucoes'
  | 'tarefas_programacao_os'
  | 'tarefas'
  | 'anomalias'
  | 'solicitacoes_servico'
>;

export const ITEM_DA_TAREFA = 'TAREFA';
export const ITEM_DA_INSTRUCAO = 'INSTRUCAO';

/** O máximo de instruções avulsas numa programação: a lista é trocada inteira a cada edição */
export const MAXIMO_DE_INSTRUCOES = 50;

/**
 * As instruções vinculadas à origem, na ordem do vínculo: as da anomalia ou as
 * da solicitação. A excluída fica de fora (como no backfill do SQL); a
 * inativada depois do vínculo fica — a origem a pediu quando valia.
 */
export async function instrucoesDaOrigem(cliente: Cliente, origem: OrigemDaOS): Promise<string[]> {
  if (origem.anomaliaId) {
    const vinculos = await cliente.anomalias_instrucoes.findMany({
      where: { anomalia_id: { in: variantesDeIds([origem.anomaliaId]) }, instrucao: { deleted_at: null } },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      select: { instrucao_id: true },
    });
    return vinculos.map((v) => v.instrucao_id.trim());
  }
  if (origem.solicitacaoId) {
    const vinculos = await cliente.solicitacoes_instrucoes.findMany({
      where: { solicitacao_id: { in: variantesDeIds([origem.solicitacaoId]) }, instrucao: { deleted_at: null } },
      orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
      select: { instrucao_id: true },
    });
    return vinculos.map((v) => v.instrucao_id.trim());
  }
  return [];
}

/**
 * O equipamento da instrução avulsa: o da programação e, sem ele, o da origem.
 * A programação de anomalia criada pela tela não tem equipamento (a OS só o
 * ganha ao executar); com a avulsa sem equipamento, a corretiva sumia do
 * histórico do equipamento — o caminho direto da OS pede que ela não tenha
 * vínculo, e o do vínculo pede o equipamento nele.
 */
export async function equipamentoDasAvulsas(
  cliente: Cliente,
  programacao: { equipamento_id?: string | null; anomalia_id?: string | null; solicitacao_servico_id?: string | null; dados_origem?: unknown },
): Promise<string | null> {
  const proprio = programacao.equipamento_id?.trim();
  if (proprio) return proprio;
  const origem = origemDaProgramacao(programacao);
  if (origem.anomaliaId) {
    const anomalia = await cliente.anomalias.findFirst({ where: { id: { in: variantesDeIds([origem.anomaliaId]) } }, select: { equipamento_id: true } });
    return anomalia?.equipamento_id?.trim() || null;
  }
  if (origem.solicitacaoId) {
    const solicitacao = await cliente.solicitacoes_servico.findFirst({
      where: { id: { in: variantesDeIds([origem.solicitacaoId]) } },
      select: { equipamento_id: true },
    });
    return solicitacao?.equipamento_id?.trim() || null;
  }
  return null;
}

/**
 * Troca as instruções avulsas da programação pela lista dada, gravando só a
 * diferença: a que fica não é regravada (mantém a linha, o id e o congelamento
 * da época — regravar refazia o snapshot pela instrução viva a cada edição), a
 * que saiu é apagada e a nova entra. Todas ficam depois das tarefas, na ordem
 * da lista.
 *
 * A instrução que já vem por uma tarefa da programação não se repete (o
 * checklist sairia duas vezes); a repetida na lista entra uma vez. A nova tem
 * de existir, não estar excluída e estar ativa — salvo a da origem
 * (`daOrigem`), que vale inativada: sem isso, o catálogo inativar uma
 * instrução travava a programação de toda anomalia que a pedia. A que a
 * programação já tinha continua valendo mesmo inativada ou excluída depois (a
 * tela reenvia a lista a cada edição, e cada uma daria 400). A linha cuja
 * instrução foi apagada de verdade (`instrucao_id` nulo pela FK) não tem como
 * ser nomeada na lista e fica como está.
 */
export async function gravarInstrucoesDaProgramacao(
  cliente: Cliente,
  programacaoId: string,
  ids: string[],
  equipamentoId: string | null,
  daOrigem: string[] = [],
): Promise<void> {
  const pedidas = [...new Set(ids.map((id) => id?.trim()).filter((id): id is string => !!id))];
  if (pedidas.length > MAXIMO_DE_INSTRUCOES) {
    throw new BadRequestException(`No máximo ${MAXIMO_DE_INSTRUCOES} instruções avulsas por programação.`);
  }

  const atuais = await cliente.tarefas_programacao_os.findMany({
    where: { programacao_id: programacaoId },
    select: { id: true, origem_item: true, instrucao_id: true, tarefa_id: true, ordem: true, equipamento_id: true },
  });
  const avulsasAtuais = new Map(
    atuais
      .filter((a) => a.origem_item === ITEM_DA_INSTRUCAO && a.instrucao_id)
      .map((a) => [a.instrucao_id!.trim(), a] as const),
  );

  // As instruções que já entram pelas tarefas da programação
  const idsDasTarefas = atuais.filter((a) => a.origem_item === ITEM_DA_TAREFA && a.tarefa_id).map((a) => a.tarefa_id!.trim());
  const dasTarefas = idsDasTarefas.length
    ? await cliente.tarefas.findMany({ where: { id: { in: variantesDeIds(idsDasTarefas) } }, select: { instrucao_id: true } })
    : [];
  const pelasTarefas = new Set(dasTarefas.map((t) => t.instrucao_id?.trim()).filter(Boolean));

  const avulsas = pedidas.filter((id) => !pelasTarefas.has(id));
  const novas = avulsas.filter((id) => !avulsasAtuais.has(id));
  const encontradas = novas.length
    ? await cliente.instrucoes.findMany({
        where: { id: { in: variantesDeIds(novas) } },
        select: { id: true, codigo: true, nome: true, descricao: true, ativo: true, deleted_at: true },
      })
    : [];
  const porId = new Map(encontradas.map((i) => [i.id.trim(), i]));
  const daOrigemAparadas = new Set(daOrigem.map((id) => id.trim()));
  for (const id of novas) {
    const instrucao = porId.get(id);
    if (!instrucao || instrucao.deleted_at || (!instrucao.ativo && !daOrigemAparadas.has(id))) {
      throw new BadRequestException(`A instrução ${pedidas.indexOf(id) + 1} da lista não existe ou não está ativa.`);
    }
  }

  const saiu = [...avulsasAtuais.entries()].filter(([id]) => !avulsas.includes(id)).map(([, linha]) => linha.id);
  if (saiu.length) await cliente.tarefas_programacao_os.deleteMany({ where: { id: { in: saiu } } });

  const depoisDasTarefas = Math.max(0, ...atuais.filter((a) => a.origem_item === ITEM_DA_TAREFA).map((a) => a.ordem));
  // A instrução avulsa é do equipamento da programação (o da anomalia): é ele que o histórico mostra
  const equipamento = equipamentoId?.trim() || null;
  const dados: Prisma.tarefas_programacao_osCreateManyInput[] = [];
  for (const [indice, id] of avulsas.entries()) {
    const ordem = depoisDasTarefas + indice + 1;
    const ficou = avulsasAtuais.get(id);
    if (ficou) {
      if (ficou.ordem !== ordem || (ficou.equipamento_id?.trim() || null) !== equipamento) {
        await cliente.tarefas_programacao_os.update({ where: { id: ficou.id }, data: { ordem, equipamento_id: equipamento } });
      }
      continue;
    }
    const instrucao = porId.get(id)!;
    dados.push({
      programacao_id: programacaoId,
      origem_item: ITEM_DA_INSTRUCAO,
      // O id como está no banco: a FK é exata
      instrucao_id: instrucao.id,
      tarefa_id: null,
      ordem,
      equipamento_id: equipamento,
      nome_snapshot: instrucao.nome.slice(0, 200),
      instrucao_tag: instrucao.codigo,
      instrucao_nome: instrucao.nome.slice(0, 200),
      instrucao_descricao: instrucao.descricao,
    });
  }
  if (dados.length) await cliente.tarefas_programacao_os.createMany({ data: dados });
}

/**
 * Depois de acrescentar tarefas: a avulsa cuja instrução passou a vir por uma
 * tarefa sai (o checklist teria os passos dela duas vezes), e as que ficam
 * voltam para depois das tarefas.
 */
export async function acertarAvulsasDepoisDasTarefas(cliente: Cliente, programacaoId: string, equipamentoId: string | null): Promise<void> {
  // equipamentoId: o de `equipamentoDasAvulsas`
  const avulsas = await cliente.tarefas_programacao_os.findMany({
    where: { programacao_id: programacaoId, origem_item: ITEM_DA_INSTRUCAO, instrucao_id: { not: null } },
    orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
    select: { instrucao_id: true },
  });
  if (avulsas.length) {
    await gravarInstrucoesDaProgramacao(cliente, programacaoId, avulsas.map((a) => a.instrucao_id!), equipamentoId);
  }
}

/** As linhas da programação como a resposta as lê (as de tarefa e as avulsas), relidas depois de gravar */
export function linhasDaProgramacao(cliente: Cliente, programacaoId: string) {
  return cliente.tarefas_programacao_os.findMany({
    where: { programacao_id: programacaoId },
    include: { tarefa: { select: { id: true, nome: true } } },
    orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
  });
}

/** A linha da programação levada à OS, com o congelamento dela (as duas portas que criam a OS usam esta) */
export function vinculoDaOS(tp: tarefas_programacao_os, osId: string) {
  return {
    os_id: osId,
    tarefa_id: tp.tarefa_id,
    origem_item: tp.origem_item,
    instrucao_id: tp.instrucao_id,
    ordem: tp.ordem,
    equipamento_id: tp.equipamento_id ?? null,
    status: 'PENDENTE',
    observacoes: tp.observacoes,
    nome_snapshot: tp.nome_snapshot ?? null,
    criticidade_snapshot: tp.criticidade_snapshot ?? null,
    frequencia_snapshot: tp.frequencia_snapshot ?? null,
    instrucao_tag: tp.instrucao_tag ?? null,
    instrucao_nome: tp.instrucao_nome ?? null,
    instrucao_descricao: tp.instrucao_descricao ?? null,
    ciclo_referencia: tp.ciclo_referencia ?? null,
  };
}

/** A instrução avulsa na resposta da programação (a das tarefas continua em `tarefas_programacao`) */
export function instrucaoDaResposta(tp: tarefas_programacao_os) {
  return {
    id: tp.id,
    instrucao_id: tp.instrucao_id?.trim() ?? null,
    codigo: tp.instrucao_tag,
    nome: tp.instrucao_nome ?? tp.nome_snapshot,
    descricao: tp.instrucao_descricao,
    ordem: tp.ordem,
  };
}
