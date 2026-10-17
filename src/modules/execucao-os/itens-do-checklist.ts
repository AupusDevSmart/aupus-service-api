import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { Prisma, PrismaClient, checklist_atividades_os } from '@prisma/client';
import { comVirgula, descreverFaixa, foraDaFaixa, numeroOuNulo } from '@/common/helpers/leitura';
import type { AtividadeChecklistDto } from './dto';
import { PREFIXO_DE_FOTO } from './anexos-os.service';

/**
 * O checklist da OS durante a execução (SPEC-EXECUCAO-DA-OS e SN-58).
 *
 * Item de VERIFICACAO é marcado ou não. Item de LEITURA conta como feito quando
 * tem valor: digitar marca, apagar desmarca. Leitura fora da faixa não trava o
 * item — a medida é a que é —, mas a tarefa só fecha com a observação dele,
 * porque o desvio precisa de explicação no relatório.
 */

// `exige_foto` obrigatório: quem esquecer de selecioná-lo não pula a regra da foto calado
type ItemGravado = Pick<checklist_atividades_os, 'id' | 'atividade' | 'tipo' | 'concluida' | 'valor_lido' | 'tarefa_os_id' | 'exige_foto'>;
type TarefaDoItem = { id: string; status: string; nome_snapshot: string | null };

type ItemDaTarefa = Pick<
  checklist_atividades_os,
  'atividade' | 'obrigatoria' | 'concluida' | 'tipo' | 'unidade' | 'valor_lido' | 'valor_minimo' | 'valor_maximo' | 'observacoes'
>;

const nomeDoItem = (item: Pick<checklist_atividades_os, 'atividade'>) => `"${item.atividade}"`;

/**
 * Concluída e valor de um item a partir do pedido; recusa o pedido incoerente.
 * Pedido só com a observação devolve null: não mexe no valor nem em quem fez —
 * explicar a leitura fora da faixa não é ler de novo, e regravar o valor lido
 * antes da transação podia apagar uma leitura gravada no meio tempo.
 */
function lerPedido(item: ItemGravado, pedido: AtividadeChecklistDto): { concluida: boolean; valor_lido?: number | null } | null {
  if (pedido.concluida === undefined && pedido.valor_lido === undefined) {
    if (pedido.observacoes === undefined) {
      throw new BadRequestException(`Nada para gravar no item ${nomeDoItem(item)}.`);
    }
    return null;
  }

  if (item.tipo !== 'LEITURA') {
    if (pedido.valor_lido !== undefined && pedido.valor_lido !== null) {
      throw new BadRequestException(`O item ${nomeDoItem(item)} não é leitura: não leva valor.`);
    }
    if (pedido.concluida === undefined) {
      throw new BadRequestException(`Diga se o item ${nomeDoItem(item)} foi feito (concluida).`);
    }
    return { concluida: pedido.concluida };
  }

  if (pedido.concluida === false) {
    if (typeof pedido.valor_lido === 'number') {
      throw new BadRequestException(`O item ${nomeDoItem(item)} veio desmarcado e com valor: mande um ou outro.`);
    }
    return { concluida: false, valor_lido: null };
  }

  const valor = pedido.valor_lido !== undefined ? pedido.valor_lido : numeroOuNulo(item.valor_lido);
  if (valor === null && pedido.concluida === true) {
    throw new BadRequestException(`Informe o valor lido de ${nomeDoItem(item)}.`);
  }
  return { concluida: valor !== null, valor_lido: valor };
}

const semIndefinidos = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

/** Pedidos do mesmo item no mesmo lote viram um só, o de depois por cima: senão o segundo regravava o item com o que se leu antes do lote. */
function juntarPedidos(pedidos: AtividadeChecklistDto[]): AtividadeChecklistDto[] {
  const porId = new Map<string, AtividadeChecklistDto>();
  for (const pedido of pedidos) {
    const id = pedido.id.trim();
    porId.set(id, { ...porId.get(id), ...semIndefinidos(pedido), id });
  }
  return [...porId.values()];
}

/**
 * O que gravar em cada item pedido. Recusa item de outra OS (antes o updateMany
 * pulava calado e a tela mostrava salvo) e item de tarefa já fechada: a tela
 * trava esses itens, e pela API dava para desmarcar o obrigatório de uma
 * tarefa concluída.
 *
 * Quem fez e quando (`concluida_*`) só muda quando o item muda de estado ou de
 * valor: remarcar o que já estava marcado não troca o autor da leitura.
 */
export function gravacoesDoChecklist(
  pedidos: AtividadeChecklistDto[],
  itens: ItemGravado[],
  tarefas: TarefaDoItem[],
  quem: { autor: string; usuarioId?: string | null },
  /** Quantas fotos tem cada item que exige foto (SN-59) */
  fotos: Map<string, number> = new Map(),
  agora = new Date(),
): Array<{ id: string; data: Prisma.checklist_atividades_osUpdateManyMutationInput }> {
  const itemPorId = new Map(itens.map((i) => [i.id.trim(), i]));
  const tarefaPorId = new Map(tarefas.map((t) => [t.id.trim(), t]));

  return juntarPedidos(pedidos).map((pedido) => {
    const item = itemPorId.get(pedido.id.trim());
    if (!item) throw new NotFoundException(`Item do checklist ${pedido.id.trim()} não é desta OS.`);

    const tarefa = item.tarefa_os_id ? tarefaPorId.get(item.tarefa_os_id.trim()) : undefined;
    if (tarefa && tarefa.status !== 'PENDENTE') {
      const situacao = tarefa.status === 'CONCLUIDA' ? 'marcada como feita' : 'registrada como não feita';
      throw new ConflictException(
        `A tarefa "${tarefa.nome_snapshot ?? 'da OS'}" já foi ${situacao}: desfaça para mexer nos itens dela.`,
      );
    }

    // `@updatedAt` não dispara no updateMany: vai à mão
    const mudanca = lerPedido(item, pedido);
    if (!mudanca) return { id: item.id, data: { observacoes: pedido.observacoes, updated_at: agora } };

    const { concluida, valor_lido } = mudanca;
    if (concluida && item.exige_foto && !fotos.get(item.id.trim())) {
      throw new ConflictException(`Fotografe o item ${nomeDoItem(item)} antes de marcá-lo.`);
    }
    const mudou =
      concluida !== item.concluida || (valor_lido !== undefined && valor_lido !== numeroOuNulo(item.valor_lido));
    const carimbo = !mudou
      ? {}
      : concluida
        ? { concluida_em: agora, concluida_por: quem.autor, concluida_por_id: quem.usuarioId ?? null }
        : { concluida_em: null, concluida_por: null, concluida_por_id: null };

    return {
      id: item.id,
      data: {
        concluida,
        observacoes: pedido.observacoes,
        ...(valor_lido !== undefined && { valor_lido }),
        ...carimbo,
        updated_at: agora,
      },
    };
  });
}

type Transacao = Pick<PrismaClient, '$queryRaw'>;

/**
 * Trava (FOR UPDATE), nesta ordem, as tarefas dos itens e os itens pedidos, e
 * devolve os ids sem repetição. A mesma ordem do concluir a tarefa (que trava a
 * tarefa e só lê os itens): duas gravações juntas esperam uma pela outra em vez
 * de uma ler o que a outra está mudando, e não há laço de espera.
 */
export async function travarItensDoChecklist(tx: Transacao, osId: string, pedidos: string[]): Promise<string[]> {
  const ids = [...new Set(pedidos.map((p) => p.trim()))];
  await tx.$queryRaw`
    SELECT t.id FROM tarefas_os t
     WHERE t.os_id = ${osId}
       AND t.id IN (SELECT c.tarefa_os_id FROM checklist_atividades_os c WHERE c.os_id = ${osId} AND c.id = ANY(${ids}::text[]))
     ORDER BY t.id
       FOR NO KEY UPDATE`;
  await tx.$queryRaw`
    SELECT id FROM checklist_atividades_os WHERE os_id = ${osId} AND id = ANY(${ids}::text[]) ORDER BY id FOR NO KEY UPDATE`;
  return ids;
}

/**
 * Fotos (imagem, não documento) de cada item, sem as excluídas. Lida depois de
 * travar os itens: a exclusão da foto trava o item antes de contar (anexos-os).
 */
export async function fotosDosItens(
  tx: Pick<PrismaClient, 'anexos_os'>,
  osId: string,
  itemIds: string[],
): Promise<Map<string, number>> {
  if (itemIds.length === 0) return new Map();
  const grupos = await tx.anexos_os.groupBy({
    by: ['checklist_item_id'],
    where: { os_id: osId, checklist_item_id: { in: itemIds }, deletado_em: null, mime_type: { startsWith: PREFIXO_DE_FOTO } },
    _count: { _all: true },
  });
  return new Map(grupos.map((g) => [g.checklist_item_id!.trim(), g._count._all]));
}

/** Trava a tarefa da OS e devolve o status dela no momento (ou null, se não é desta OS). */
export async function travarTarefa(tx: Transacao, osId: string, tarefaOsId: string): Promise<string | null> {
  const [linha] = await tx.$queryRaw<Array<{ status: string }>>`
    SELECT status FROM tarefas_os WHERE id = ${tarefaOsId} AND os_id = ${osId} FOR NO KEY UPDATE`;
  return linha?.status ?? null;
}

/** Por que a tarefa ainda não pode ser marcada como feita, ou null. */
export function pendenciaDaTarefa(itens: ItemDaTarefa[]): string | null {
  const obrigatorios = itens.filter((i) => i.obrigatoria && !i.concluida).length;
  if (obrigatorios > 0) {
    return `Marque os ${obrigatorios} item(ns) obrigatório(s) do checklist desta tarefa antes de concluí-la`;
  }

  const semExplicacao = itens.find(
    (i) => i.tipo === 'LEITURA' && i.concluida && foraDaFaixa(i.valor_lido, i) && !i.observacoes?.trim(),
  );
  if (semExplicacao) {
    const lido = `${comVirgula(numeroOuNulo(semExplicacao.valor_lido) ?? 0)}${semExplicacao.unidade ? ` ${semExplicacao.unidade}` : ''}`;
    return (
      `A leitura ${nomeDoItem(semExplicacao)} ficou fora da faixa (${lido}; faixa: ${descreverFaixa(semExplicacao)}). ` +
      'Explique na observação do item antes de concluir a tarefa'
    );
  }
  return null;
}

/** Os campos da leitura na resposta: número no lugar do Decimal e o fora da faixa já contado. */
export function leituraDoItem(item: Pick<checklist_atividades_os, 'tipo' | 'unidade' | 'valor_lido' | 'valor_minimo' | 'valor_maximo'>) {
  return {
    tipo: item.tipo,
    unidade: item.unidade,
    valor_minimo: numeroOuNulo(item.valor_minimo),
    valor_maximo: numeroOuNulo(item.valor_maximo),
    valor_lido: numeroOuNulo(item.valor_lido),
    fora_da_faixa: item.tipo === 'LEITURA' && foraDaFaixa(item.valor_lido, item),
  };
}
