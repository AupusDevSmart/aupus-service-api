import { Recurso } from './recursos';

type Tx = any;

/**
 * O que este backend faz com um registro que acabou de chegar do outro produto.
 *
 * Existe nos dois backends com conteudo DIFERENTE, e e o unico arquivo assim no
 * modulo. E de proposito: cada lado conhece so a propria forma. Um tradutor
 * unico que soubesse dos dois schemas voltaria a acoplar os dois produtos, que
 * e exatamente o que a separacao desfez.
 *
 * Aqui, no Service, o unico caso e o equipamento: ele chega do NexOn sem
 * posicao, porque la posicao nao existe.
 */
export async function aoReceber(
  tx: Tx,
  recurso: Recurso,
  registroId: string,
  dados: Record<string, any>,
): Promise<void> {
  if (recurso !== 'equipamentos') return;
  await garantirPosicao(tx, registroId, dados);
}

/**
 * Da uma posicao ao equipamento que chegou de fora.
 *
 * No Service o equipamento e o ativo FISICO e vive dentro de uma posicao, que e
 * dona da categoria e da localizacao. O NexOn nao tem essa separacao, entao o
 * que chega de la e um equipamento solto. Deixa-lo sem posicao o faria sumir de
 * toda tela que parte da instalacao, e o "conserto" seria manual, um a um.
 *
 * A posicao e criada a partir do que o proprio equipamento carrega —
 * exatamente o criterio de `migrar-equipamentos.ts`, que fez isso com os 203
 * equipamentos que ja estavam no banco.
 *
 * Nao mexe em equipamento que ja tem posicao: sincronizacao de cadastro nao
 * pode remanejar equipamento de lugar. Se alguem editou o nome no NexOn, isso
 * nao e uma ordem de mudanca de posicao.
 */
async function garantirPosicao(tx: Tx, equipamentoId: string, dados: Record<string, any>): Promise<void> {
  const id = equipamentoId.trim();

  const atual = await tx.equipamentos.findUnique({
    where: { id },
    select: { ativo_funcional_id: true, nome: true, unidade_id: true, tipo_equipamento_id: true, classificacao: true },
  });
  if (!atual || atual.ativo_funcional_id) return;

  // Componente UAR pertence ao equipamento pai, nao a uma posicao propria.
  if (atual.classificacao !== 'UC') return;

  const unidadeId = (dados.unidade_id ?? atual.unidade_id)?.trim();
  const tipoId = (dados.tipo_equipamento_id ?? atual.tipo_equipamento_id)?.trim();
  // Sem instalacao nao ha onde pendurar a posicao, e sem tipo nao ha categoria.
  // Os dois casos existem no banco de hoje; o equipamento entra sem posicao e a
  // tela mostra isso, que e melhor do que inventar uma categoria.
  if (!unidadeId || !tipoId) return;

  const tipo = await tx.tipos_equipamentos.findUnique({
    where: { id: tipoId },
    select: { categoria_id: true },
  });
  if (!tipo?.categoria_id) return;

  const nome = dados.nome ?? atual.nome;

  // O nome da posicao e unico por instalacao (indice parcial no banco). Reusar a
  // posicao existente de mesmo nome e o certo: e a MESMA posicao, e criar uma
  // segunda so mudaria o erro de lugar.
  const existente = await tx.ativos_funcionais.findFirst({
    where: { unidade_id: unidadeId, nome, deleted_at: null },
    select: { id: true },
  });

  const posicaoId = existente?.id ?? (await tx.ativos_funcionais.create({
    data: {
      nome,
      categoria_id: tipo.categoria_id.trim(),
      unidade_id: unidadeId,
      localizacao: dados.localizacao ?? null,
      localizacao_especifica: dados.localizacao_especifica ?? null,
    },
    select: { id: true },
  })).id;

  // Posicao ocupada por outro equipamento nao recebe este: o indice parcial do
  // banco recusaria, e a excecao subiria como falha de sincronizacao sem dizer
  // o motivo real.
  const ocupada = await tx.ativos_funcionais_equipamentos.findFirst({
    where: { ativo_funcional_id: posicaoId, removido_em: null },
    select: { equipamento_id: true },
  });
  if (ocupada && ocupada.equipamento_id.trim() !== id) return;

  if (!ocupada) {
    await tx.ativos_funcionais_equipamentos.create({
      data: { ativo_funcional_id: posicaoId, equipamento_id: id },
    });
  }

  await tx.equipamentos.update({
    where: { id },
    data: { ativo_funcional_id: posicaoId, ativo_na_posicao: true },
  });
}
