import { BadRequestException } from '@nestjs/common';
import { Prisma, type tarefas_programacao_os } from '@prisma/client';
import { origemDaProgramacao, type OrigemDaOS } from '@/common/helpers/status-da-origem';
import { reais } from '../execucao-os/custo-da-os';
import { instrucoesDasLinhas, valoresParaCongelar } from '../execucao-os/tarefas-das-linhas';
import { valoresDasInstrucoes } from '../instrucoes/valor-da-instrucao';
import { variantesDeIds } from '../tarefas/ids';
import { congelamentoDasLinhas, nomesDosEquipamentos } from './congelamento-da-linha';

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
  // SN-93: o valor da instrução e o nome do equipamento, congelados na linha
  | 'instrucao_recursos'
  | 'instrucao_maquinarios'
  | 'equipamentos'
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
    select: { id: true, origem_item: true, instrucao_id: true, tarefa_id: true, ordem: true, equipamento_id: true, valor: true, valor_original: true },
  });
  const avulsasAtuais = new Map(
    atuais
      .filter((a) => a.origem_item === ITEM_DA_INSTRUCAO && a.instrucao_id)
      .map((a) => [a.instrucao_id!.trim(), a] as const),
  );

  // As instruções que já entram pelas tarefas da programação
  const idsDasTarefas = atuais.filter((a) => a.origem_item === ITEM_DA_TAREFA && a.tarefa_id).map((a) => a.tarefa_id!.trim());
  const dasTarefas = idsDasTarefas.length
    ? await cliente.tarefas.findMany({ where: { id: { in: variantesDeIds(idsDasTarefas) } }, select: { id: true, instrucao_id: true } })
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
  // SN-93: a avulsa ajustada que passa a vir por tarefa leva o valor para a linha da tarefa (ainda no do
  // cadastro): sem isso o ajuste do planejador sumia junto com a avulsa, calado
  for (const [instrucaoId, avulsa] of avulsasAtuais) {
    const ajustada = avulsa.valor !== null && (avulsa.valor_original === null || !avulsa.valor.equals(avulsa.valor_original));
    if (!pelasTarefas.has(instrucaoId) || !ajustada) continue;
    const tarefasDela = new Set(dasTarefas.filter((t) => t.instrucao_id?.trim() === instrucaoId).map((t) => t.id.trim()));
    const linhas = atuais.filter(
      (a) => a.origem_item === ITEM_DA_TAREFA && tarefasDela.has(a.tarefa_id?.trim() ?? '') && (a.valor === null || a.valor_original === null || a.valor.equals(a.valor_original)),
    );
    for (const linha of linhas) await cliente.tarefas_programacao_os.update({ where: { id: linha.id }, data: { valor: avulsa.valor } });
  }
  if (saiu.length) await cliente.tarefas_programacao_os.deleteMany({ where: { id: { in: saiu } } });

  const depoisDasTarefas = Math.max(0, ...atuais.filter((a) => a.origem_item === ITEM_DA_TAREFA).map((a) => a.ordem));
  // A instrução avulsa é do equipamento da programação (o da anomalia): é ele que o histórico mostra
  const equipamento = equipamentoId?.trim() || null;
  // SN-93: o valor de cada nova (o do cadastro agora) e o nome do equipamento
  const congeladas = await congelamentoDasLinhas(cliente, novas.map((id) => ({ instrucao_id: id, equipamento_id: equipamento })));
  const congelamento = new Map(novas.map((id, i) => [id, congeladas[i]]));
  const nomeDoEquipamento = equipamento ? ((await nomesDosEquipamentos(cliente, [equipamento])).get(equipamento) ?? null) : null;
  const dados: Prisma.tarefas_programacao_osCreateManyInput[] = [];
  for (const [indice, id] of avulsas.entries()) {
    const ordem = depoisDasTarefas + indice + 1;
    const ficou = avulsasAtuais.get(id);
    if (ficou) {
      if (ficou.ordem !== ordem || (ficou.equipamento_id?.trim() || null) !== equipamento) {
        await cliente.tarefas_programacao_os.update({
          where: { id: ficou.id },
          data: { ordem, equipamento_id: equipamento, equipamento_nome: nomeDoEquipamento },
        });
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
      ...congelamento.get(id),
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
    // SN-93: o valor da instrução da programação (o ajustado, se foi) e o equipamento congelado
    valor: tp.valor ?? null,
    valor_original: tp.valor_original ?? null,
    equipamento_nome: tp.equipamento_nome ?? null,
  };
}

const numeroOuNulo = (v: Prisma.Decimal | null | undefined) => (v === null || v === undefined ? null : Number(v));

/** O valor da linha na resposta (SN-93): o da programação e o do cadastro no vínculo */
export const valorDaLinha = (tp: Pick<tarefas_programacao_os, 'valor' | 'valor_original' | 'equipamento_nome'>) => ({
  valor: numeroOuNulo(tp.valor),
  valor_original: numeroOuNulo(tp.valor_original),
  equipamento_nome: tp.equipamento_nome?.trim() || null,
});

/** A instrução avulsa na resposta da programação (a das tarefas continua em `tarefas_programacao`) */
export function instrucaoDaResposta(tp: tarefas_programacao_os) {
  return {
    id: tp.id,
    instrucao_id: tp.instrucao_id?.trim() ?? null,
    codigo: tp.instrucao_tag,
    nome: tp.instrucao_nome ?? tp.nome_snapshot,
    descricao: tp.instrucao_descricao,
    ordem: tp.ordem,
    ...valorDaLinha(tp),
  };
}

/**
 * Na aprovação: a linha de antes do SN-93, sem valor, recebe o do cadastro de
 * agora, e a OS nasce com ele (o vínculo copia o valor da linha)
 */
export async function congelarValoresDaProgramacao(
  cliente: Pick<Prisma.TransactionClient, 'tarefas_programacao_os' | 'tarefas' | 'instrucao_recursos' | 'instrucao_maquinarios'>,
  programacaoId: string,
): Promise<void> {
  const linhas = await cliente.tarefas_programacao_os.findMany({
    where: { programacao_id: programacaoId, valor: null },
    select: { id: true, instrucao_id: true, tarefa_id: true },
  });
  for (const { id, valor } of await valoresParaCongelar(cliente, linhas)) {
    await cliente.tarefas_programacao_os.update({ where: { id }, data: { valor, valor_original: valor } });
  }
}

/** O valor ajustado de uma linha: a da tarefa ou a da instrução avulsa (`ValorDaInstrucaoDto`) */
export interface AjusteDeValor {
  tarefa_id?: string;
  instrucao_id?: string;
  /** null volta ao do cadastro (o `valor_original`) */
  valor: number | null;
}

const emReais = (v: number | null) => (v === null ? 'o do cadastro' : `R$ ${reais(new Prisma.Decimal(v))}`);

/**
 * O valor das instruções ajustado só nesta programação (SN-93, D1). Grava só o
 * que mudou e devolve o que mudou, para a trilha: o ajuste é decisão de custo, e
 * quem audita quer saber quem mexeu e de quanto para quanto.
 */
export async function ajustarValoresDasInstrucoes(
  cliente: Pick<Prisma.TransactionClient, 'tarefas_programacao_os' | 'tarefas' | 'instrucao_recursos' | 'instrucao_maquinarios'>,
  programacaoId: string,
  ajustes: AjusteDeValor[],
): Promise<string[]> {
  if (ajustes.length === 0) return [];
  const linhas = await cliente.tarefas_programacao_os.findMany({
    where: { programacao_id: programacaoId },
    select: {
      id: true,
      origem_item: true,
      tarefa_id: true,
      instrucao_id: true,
      valor: true,
      valor_original: true,
      nome_snapshot: true,
      instrucao_tag: true,
      equipamento_nome: true,
    },
  });
  const pelaTarefa = new Map(linhas.filter((l) => l.origem_item === ITEM_DA_TAREFA && l.tarefa_id).map((l) => [l.tarefa_id!.trim(), l]));
  const pelaInstrucao = new Map(linhas.filter((l) => l.origem_item === ITEM_DA_INSTRUCAO && l.instrucao_id).map((l) => [l.instrucao_id!.trim(), l]));

  const pedidos = ajustes.map((ajuste, indice) => {
    const tarefa = ajuste.tarefa_id?.trim();
    const instrucao = ajuste.instrucao_id?.trim();
    if (!!tarefa === !!instrucao) {
      throw new BadRequestException(`O valor ${indice + 1} da lista precisa da tarefa ou da instrução da linha (uma das duas).`);
    }
    const linha = tarefa ? pelaTarefa.get(tarefa) : pelaInstrucao.get(instrucao!);
    if (!linha) throw new BadRequestException(`O valor ${indice + 1} da lista é de uma instrução que não está nesta programação.`);
    return { linha, valor: ajuste.valor };
  });

  // A linha de antes do SN-93 não tem o valor do cadastro: entra o de agora, para o ajuste aparecer
  // como ajuste e o "voltar ao cadastro" ter para onde voltar (sem ele, o finalizar pulava a linha,
  // que já tinha valor, e o do cadastro se perdia)
  const semOriginal = [...new Set(pedidos.map((p) => p.linha).filter((l) => l.valor_original === null))];
  const instrucoesSemOriginal = await instrucoesDasLinhas(cliente, semOriginal);
  const doCadastro = instrucoesSemOriginal.some(Boolean) ? await valoresDasInstrucoes(cliente, instrucoesSemOriginal) : new Map<string, { valor: number }>();
  const originalDe = new Map(semOriginal.map((l, i) => [l, instrucoesSemOriginal[i] ? (doCadastro.get(instrucoesSemOriginal[i]!)?.valor ?? null) : null]));

  const mudancas: string[] = [];
  for (const { linha, valor } of pedidos) {
    const original = numeroOuNulo(linha.valor_original) ?? originalDe.get(linha) ?? null;
    const novo = valor ?? original;
    const antes = numeroOuNulo(linha.valor);
    const gravarOriginal = linha.valor_original === null && original !== null;
    if (novo === antes && !gravarOriginal) continue;
    await cliente.tarefas_programacao_os.update({
      where: { id: linha.id },
      data: { valor: novo, ...(gravarOriginal ? { valor_original: original } : {}) },
    });
    if (gravarOriginal) linha.valor_original = new Prisma.Decimal(original);
    linha.valor = novo === null ? null : new Prisma.Decimal(novo);
    if (novo === antes) continue;
    const nome = [linha.instrucao_tag?.trim(), linha.nome_snapshot?.trim(), linha.equipamento_nome?.trim()].filter(Boolean).join(' · ');
    mudancas.push(`${nome || 'instrução'}: de ${emReais(antes)} para ${emReais(novo)}`);
  }
  return mudancas;
}
