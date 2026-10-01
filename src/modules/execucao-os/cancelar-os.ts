import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { liberarOrigem, nomeDoAutor, origemDaProgramacao } from '../../common/helpers/status-da-origem';
import { devolverViatura } from '../reservas/ocupacao-da-viatura';
import { variantesDeIds } from '../tarefas/ids';

type Tx = Prisma.TransactionClient;

/**
 * Cancelar a OS inteira, com tudo o que depende dela, numa transacao so.
 *
 * Mora fora do `ExecucaoOSService` porque ha duas portas para o mesmo ato: o
 * botao Cancelar da OS e o Cancelar da programacao ja aprovada (que gerou a
 * OS). Antes cada porta fazia metade: cancelar a OS deixava a programacao
 * APROVADA para sempre, e cancelar a programacao deixava a OS PENDENTE viva —
 * e quando ela era executada, finalizava uma anomalia que ja tinha voltado
 * para a fila.
 *
 *   OS           -> CANCELADA (terminal)
 *   reserva      -> cancelada
 *   tarefas      -> ancora avanca para o ciclo cancelado
 *   programacao  -> CANCELADA
 *   origem       -> REGISTRADA (pode ser programada de novo)
 */
export async function cancelarOS(
  tx: Tx,
  osId: string,
  dados: { motivo: string; observacoes?: string | null; usuarioId?: string | null },
): Promise<void> {
  const os = await tx.ordens_servico.findUnique({
    where: { id: osId },
    select: {
      id: true,
      status: true,
      numero_os: true,
      reserva_id: true,
      anomalia_id: true,
      programacao_id: true,
    },
  });

  if (!os) throw new NotFoundException('Ordem de serviço não encontrada');
  if (os.status === 'FINALIZADA' || os.status === 'CANCELADA') {
    throw new ConflictException('OS finalizada ou cancelada não pode ser cancelada');
  }

  const autor = await nomeDoAutor(tx, dados.usuarioId);

  await tx.ordens_servico.update({
    where: { id: os.id },
    data: { status: 'CANCELADA', motivo_cancelamento: dados.motivo },
  });

  // A reserva pode estar só na programação (aprovação antiga que não a
  // vinculou à OS): as duas são lidas, senão a viatura ficava presa.
  const daProgramacao = await tx.programacoes_os.findUnique({
    where: { id: os.programacao_id },
    select: { reserva_id: true },
  });
  const idsDaReserva = [os.reserva_id, daProgramacao?.reserva_id].filter(Boolean).map((r) => r!.trim());
  if (idsDaReserva.length) {
    const ativas = await tx.reserva_veiculo.findMany({
      where: { id: { in: variantesDeIds(idsDaReserva) }, status: 'ativa' },
      select: { id: true, veiculo_id: true },
    });
    for (const reserva of ativas) {
      await tx.reserva_veiculo.update({
        where: { id: reserva.id },
        data: {
          status: 'cancelada',
          motivo_cancelamento: dados.motivo,
          data_cancelamento: new Date(),
          cancelado_por: autor,
          cancelado_por_id: dados.usuarioId ?? null,
        },
      });
      // OS cancelada em campo: a viatura "em uso" volta para disponível
      await devolverViatura(tx, reserva.veiculo_id);
    }
  }

  await tx.historico_os.create({
    data: {
      os_id: os.id,
      acao: 'CANCELAMENTO',
      usuario: autor,
      usuario_id: dados.usuarioId ?? null,
      observacoes: [dados.motivo, dados.observacoes].filter(Boolean).join('. '),
      status_anterior: os.status,
      status_novo: 'CANCELADA',
    },
  });

  const vinculos = await tx.tarefas_os.findMany({
    where: { os_id: os.id, tarefa_id: { not: null }, ciclo_referencia: { not: null } },
    select: { tarefa_id: true, ciclo_referencia: true },
  });
  await avancarAncoraDosCiclos(tx, vinculos);

  const programacao = await tx.programacoes_os.findUnique({
    where: { id: os.programacao_id },
    select: {
      id: true,
      status: true,
      anomalia_id: true,
      solicitacao_servico_id: true,
      dados_origem: true,
    },
  });

  if (programacao && (programacao.status === 'PENDENTE' || programacao.status === 'APROVADA')) {
    await tx.programacoes_os.update({
      where: { id: programacao.id },
      data: { status: 'CANCELADA', motivo_cancelamento: dados.motivo },
    });
    await tx.historico_programacao_os.create({
      data: {
        programacao_id: programacao.id,
        acao: 'CANCELAMENTO',
        usuario: autor,
        usuario_id: dados.usuarioId ?? null,
        observacoes: `OS ${os.numero_os} cancelada: ${dados.motivo}`,
        status_anterior: programacao.status,
        status_novo: 'CANCELADA',
      },
    });
  }

  const origem = programacao
    ? origemDaProgramacao(programacao)
    : { anomaliaId: null, solicitacaoId: null };
  origem.anomaliaId = origem.anomaliaId ?? (os.anomalia_id?.trim() || null);

  await liberarOrigem(tx, origem, {
    usuarioId: dados.usuarioId,
    motivo: `OS ${os.numero_os} cancelada: ${dados.motivo}`,
  });
}

/**
 * Cancelar e decisao de planejamento: aquele ciclo nao vai acontecer. A ancora
 * da tarefa avanca para o ciclo cancelado, entao a proxima geracao do cron cai
 * no ciclo seguinte em vez de recriar a mesma programacao na madrugada
 * seguinte. So os vinculos que o cron gerou tem `ciclo_referencia`.
 */
export async function avancarAncoraDosCiclos(
  tx: Tx,
  vinculos: { tarefa_id: string | null; ciclo_referencia: Date | null }[],
): Promise<void> {
  for (const vinculo of vinculos) {
    const tarefaId = vinculo.tarefa_id?.trim();
    if (!tarefaId || !vinculo.ciclo_referencia) continue;

    await tx.tarefas.update({
      where: { id: tarefaId },
      data: { data_ancora: vinculo.ciclo_referencia },
    });
  }
}
