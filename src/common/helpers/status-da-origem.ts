import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, type StatusSolicitacaoServico } from '@prisma/client';
import { registrarNotificacao } from '../../modules/notificacoes/registrar-notificacao';

/**
 * O status da ORIGEM da OS (anomalia ou solicitacao de servico) acompanha a
 * programacao e a OS. Um lugar so decide essa regra, e sempre dentro da
 * transacao de quem mudou a programacao ou a OS.
 *
 *   programacao criada (ou origem trocada na edicao) -> PROGRAMADA
 *   programacao cancelada/excluida, OS cancelada     -> REGISTRADA (anomalia)
 *                                                       PROPOSTA_REVISADA (solicitacao)
 *   OS finalizada                                     -> FINALIZADA
 *
 * A solicitacao so se programa com a proposta revisada (29/out/2026): a
 * programacao herda dela as instrucoes, os valores e a logistica. Desprogramada,
 * volta para la, com a proposta que ja tinha sido revisada.
 *
 * Por que isso importa: a lista de origem da tela so oferece o que esta
 * pronto para programar. Caminho que encerra a programacao sem devolver a origem a tira da
 * lista para sempre — nunca mais da para programa-la. Caminho que abre a
 * programacao sem tira-la de la deixa a mesma anomalia ganhar duas OS.
 *
 * Antes cada caminho fazia a sua parte, com `try/catch` que so logava, fora da
 * transacao, e varios nao faziam nada: excluir, trocar a anomalia na edicao e
 * cancelar a OS deixavam a origem presa. A solicitacao criada pelo formulario
 * nem chegava a PROGRAMADA.
 *
 * Os ids vao sempre com `trim()`: as colunas sao `Char(26)` e os ids antigos
 * tem 25 caracteres, entao voltam do banco com um espaco no fim.
 */

type Tx = Prisma.TransactionClient;

export interface OrigemDaOS {
  anomaliaId: string | null;
  solicitacaoId: string | null;
}

interface Autor {
  usuarioId?: string | null;
}

/**
 * Le a origem de uma programacao. A solicitacao pode estar na coluna ou so no
 * `dados_origem` (o formulario manda por la) — os dois valem.
 */
export function origemDaProgramacao(programacao: {
  anomalia_id?: string | null;
  solicitacao_servico_id?: string | null;
  dados_origem?: unknown;
}): OrigemDaOS {
  const dados = (programacao.dados_origem ?? {}) as { solicitacaoServicoId?: unknown };
  const solicitacaoDoJson =
    typeof dados.solicitacaoServicoId === 'string' ? dados.solicitacaoServicoId : null;

  return {
    anomaliaId: programacao.anomalia_id?.trim() || null,
    solicitacaoId: programacao.solicitacao_servico_id?.trim() || solicitacaoDoJson?.trim() || null,
  };
}

export async function nomeDoAutor(tx: Tx, usuarioId?: string | null): Promise<string> {
  if (!usuarioId) return 'Sistema';
  const usuario = await tx.usuarios.findUnique({
    where: { id: usuarioId.trim() },
    select: { nome: true },
  });
  return usuario?.nome ?? 'Sistema';
}

/**
 * REGISTRADA (anomalia) ou PROPOSTA_REVISADA (solicitacao) -> PROGRAMADA.
 *
 * `exigirRegistrada` recusa a origem que ja esta programada ou finalizada —
 * e o que impede duas programacoes em aberto para a mesma anomalia — e a
 * solicitacao com a proposta por revisar. A aprovacao passa `false`: ali a
 * origem ja deveria estar PROGRAMADA desde a criacao, e so programacoes
 * anteriores a esta regra chegam sem ela (a solicitacao, ainda REGISTRADA).
 */
export async function programarOrigem(
  tx: Tx,
  origem: OrigemDaOS,
  contexto: Autor & { programacaoId: string; codigo: string; exigirRegistrada?: boolean },
): Promise<void> {
  const exigir = contexto.exigirRegistrada ?? true;
  const autor = await nomeDoAutor(tx, contexto.usuarioId);

  if (origem.anomaliaId) {
    const { count } = await tx.anomalias.updateMany({
      where: { id: origem.anomaliaId, status: 'REGISTRADA', deleted_at: null },
      data: { status: 'PROGRAMADA' },
    });

    if (count > 0) {
      await tx.historico_anomalias.create({
        data: {
          anomalia_id: origem.anomaliaId,
          acao: 'Anomalia programada',
          usuario: autor,
          observacoes: `Programação ${contexto.codigo} criada`,
          status_anterior: 'REGISTRADA',
          status_novo: 'PROGRAMADA',
        },
      });
      await registrarNotificacao(tx, { evento: 'anomalia.programada', entidade: 'anomalia', entidadeId: origem.anomaliaId, atorId: contexto.usuarioId });
    } else if (exigir) {
      const atual = await tx.anomalias.findFirst({
        where: { id: origem.anomaliaId, deleted_at: null },
        select: { status: true },
      });
      if (!atual) throw new NotFoundException('Anomalia não encontrada');
      throw new ConflictException(
        `A anomalia já está ${atual.status.toLowerCase()}: cancele a programação existente antes de criar outra`,
      );
    }
  }

  if (origem.solicitacaoId) {
    const prontas: StatusSolicitacaoServico[] = exigir ? ['PROPOSTA_REVISADA'] : ['PROPOSTA_REVISADA', 'REGISTRADA'];
    // Travada (como as escritas da proposta): revisar, reabrir ou recusar no meio esperam esta transação
    const [travada] = await tx.$queryRaw<{ status: StatusSolicitacaoServico }[]>`
      SELECT status::text AS status FROM solicitacoes_servico
       WHERE id = ${origem.solicitacaoId} AND deleted_at IS NULL
       FOR UPDATE`;
    const antes = travada && prontas.includes(travada.status) ? travada : null;
    const { count } = antes
      ? await tx.solicitacoes_servico.updateMany({
          where: { id: origem.solicitacaoId, status: antes.status, deleted_at: null },
          data: { status: 'PROGRAMADA', programacao_os_id: contexto.programacaoId },
        })
      : { count: 0 };

    if (antes && count > 0) {
      await tx.historico_solicitacao_servico.create({
        data: {
          solicitacao_id: origem.solicitacaoId,
          acao: 'PROGRAMACAO',
          usuario_nome: autor,
          usuario_id: contexto.usuarioId ?? null,
          observacoes: `Programação ${contexto.codigo} criada`,
          status_anterior: antes.status,
          status_novo: 'PROGRAMADA',
        },
      });
      await registrarNotificacao(tx, { evento: 'solicitacao.programada', entidade: 'solicitacao_servico', entidadeId: origem.solicitacaoId, atorId: contexto.usuarioId });
    } else if (exigir) {
      const atual = await tx.solicitacoes_servico.findFirst({
        where: { id: origem.solicitacaoId, deleted_at: null },
        select: { status: true },
      });
      if (!atual) throw new NotFoundException('Solicitação de serviço não encontrada');
      throw new ConflictException(conflitoDaSolicitacao(atual.status));
    }
  }
}

/** Por que a solicitacao nao se programa: a proposta por revisar ou a programacao que ja existe */
function conflitoDaSolicitacao(status: StatusSolicitacaoServico): string {
  if (status === 'REGISTRADA') return 'A proposta da solicitação ainda não foi revisada: revise-a antes de programar.';
  if (status === 'NAO_APROVADA') return 'A proposta da solicitação não foi aprovada: reabra-a e revise-a antes de programar.';
  return `A solicitação já está ${status.toLowerCase()}: cancele a programação existente antes de criar outra`;
}

/**
 * PROGRAMADA -> REGISTRADA (anomalia) ou PROPOSTA_REVISADA (solicitacao).
 * Idempotente: origem que ja voltou, ou que foi finalizada, fica como esta.
 */
export async function liberarOrigem(
  tx: Tx,
  origem: OrigemDaOS,
  contexto: Autor & { motivo: string },
): Promise<void> {
  const autor = await nomeDoAutor(tx, contexto.usuarioId);

  if (origem.anomaliaId) {
    const { count } = await tx.anomalias.updateMany({
      where: { id: origem.anomaliaId, status: 'PROGRAMADA' },
      data: { status: 'REGISTRADA' },
    });
    if (count > 0) {
      await tx.historico_anomalias.create({
        data: {
          anomalia_id: origem.anomaliaId,
          acao: 'Anomalia voltou para registrada',
          usuario: autor,
          observacoes: contexto.motivo,
          status_anterior: 'PROGRAMADA',
          status_novo: 'REGISTRADA',
        },
      });
      await registrarNotificacao(tx, { evento: 'anomalia.reaberta', entidade: 'anomalia', entidadeId: origem.anomaliaId, atorId: contexto.usuarioId });
    }
  }

  if (origem.solicitacaoId) {
    const { count } = await tx.solicitacoes_servico.updateMany({
      where: { id: origem.solicitacaoId, status: 'PROGRAMADA' },
      data: { status: 'PROPOSTA_REVISADA', programacao_os_id: null },
    });
    if (count > 0) {
      await tx.historico_solicitacao_servico.create({
        data: {
          solicitacao_id: origem.solicitacaoId,
          acao: 'RETORNO_PROPOSTA_REVISADA',
          usuario_nome: autor,
          usuario_id: contexto.usuarioId ?? null,
          observacoes: contexto.motivo,
          status_anterior: 'PROGRAMADA',
          status_novo: 'PROPOSTA_REVISADA',
        },
      });
      await registrarNotificacao(tx, { evento: 'solicitacao.reaberta', entidade: 'solicitacao_servico', entidadeId: origem.solicitacaoId, atorId: contexto.usuarioId });
    }
  }
}

/** -> FINALIZADA, quando a OS que resolve a origem e finalizada. */
export async function finalizarOrigem(
  tx: Tx,
  origem: OrigemDaOS,
  contexto: Autor & { numeroOS: string },
): Promise<void> {
  const autor = await nomeDoAutor(tx, contexto.usuarioId);

  if (origem.anomaliaId) {
    const atual = await tx.anomalias.findFirst({
      where: { id: origem.anomaliaId, status: { not: 'FINALIZADA' } },
      select: { status: true },
    });
    if (atual) {
      await tx.anomalias.updateMany({
        where: { id: origem.anomaliaId },
        data: { status: 'FINALIZADA' },
      });
      await tx.historico_anomalias.create({
        data: {
          anomalia_id: origem.anomaliaId,
          acao: 'Anomalia finalizada',
          usuario: autor,
          observacoes: `OS ${contexto.numeroOS} finalizada`,
          status_anterior: atual.status,
          status_novo: 'FINALIZADA',
        },
      });
      await registrarNotificacao(tx, { evento: 'anomalia.finalizada', entidade: 'anomalia', entidadeId: origem.anomaliaId, atorId: contexto.usuarioId });
    }
  }

  if (origem.solicitacaoId) {
    const atual = await tx.solicitacoes_servico.findFirst({
      where: { id: origem.solicitacaoId, status: { not: 'FINALIZADA' } },
      select: { status: true },
    });
    if (atual) {
      await tx.solicitacoes_servico.updateMany({
        where: { id: origem.solicitacaoId },
        data: { status: 'FINALIZADA' },
      });
      await tx.historico_solicitacao_servico.create({
        data: {
          solicitacao_id: origem.solicitacaoId,
          acao: 'FINALIZACAO',
          usuario_nome: autor,
          usuario_id: contexto.usuarioId ?? null,
          observacoes: `OS ${contexto.numeroOS} finalizada`,
          status_anterior: atual.status,
          status_novo: 'FINALIZADA',
        },
      });
      await registrarNotificacao(tx, { evento: 'solicitacao.finalizada', entidade: 'solicitacao_servico', entidadeId: origem.solicitacaoId, atorId: contexto.usuarioId });
    }
  }
}
