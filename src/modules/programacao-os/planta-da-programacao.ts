import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '@/core/prisma/prisma.service';
import { plantasDosEquipamentos } from '@/core/modules/auth/planta-dos-equipamentos';
import { origemDaProgramacao } from '@/common/helpers/status-da-origem';

/** O que a programação diz de onde ela é. */
export interface OndeEstaAProgramacao {
  planta_id?: string | null;
  anomalia_id?: string | null;
  solicitacao_servico_id?: string | null;
  dados_origem?: unknown;
  equipamento_id?: string | null;
  /** Equipamentos das tarefas (os da tarefa viva no criar; os congelados no vínculo ao editar). */
  equipamentos_das_tarefas?: (string | null | undefined)[];
  /** Na edição, a planta já gravada: vale só se nada acima tiver planta (não compete com a origem nova). */
  planta_gravada?: string | null;
}

/**
 * A planta de toda programação (e da OS que ela vira). É por ela que o técnico
 * de campo e o cliente enxergam a OS: programação sem planta ficava invisível
 * para quem ia executá-la.
 *
 * A planta vem da origem quando a origem tem uma — anomalia, solicitação,
 * tarefas, equipamento — e a informada só vale se for a mesma. Sem origem com
 * planta (a manual antiga), a informada é obrigatória. Sem planta nenhuma,
 * recusa: não há mais programação sem planta.
 */
export async function plantaDaProgramacao(prisma: PrismaService, onde: OndeEstaAProgramacao): Promise<string> {
  const { anomaliaId, solicitacaoId } = origemDaProgramacao(onde);
  const fontes: { de: string; planta: string }[] = [];

  if (anomaliaId) {
    const planta = await plantaDaAnomalia(prisma, anomaliaId);
    if (planta) fontes.push({ de: 'da anomalia', planta });
  }

  if (solicitacaoId) {
    const [solicitacao] = await prisma.$queryRaw<{ planta_id: string | null }[]>`
      SELECT trim(planta_id) AS planta_id FROM solicitacoes_servico WHERE trim(id) = ${solicitacaoId}`;
    if (solicitacao?.planta_id) fontes.push({ de: 'da solicitação', planta: solicitacao.planta_id });
  }

  const dasTarefas = await plantasDosEquipamentos(prisma, onde.equipamentos_das_tarefas ?? []);
  if (dasTarefas.length > 1) {
    throw new BadRequestException(
      `As tarefas escolhidas são de ${dasTarefas.length} plantas. Uma programação atende uma planta só: programe cada planta separadamente.`,
    );
  }
  if (dasTarefas.length === 1) fontes.push({ de: 'das tarefas', planta: dasTarefas[0] });

  const [doEquipamento] = await plantasDosEquipamentos(prisma, [onde.equipamento_id]);
  if (doEquipamento) fontes.push({ de: 'do equipamento', planta: doEquipamento });

  const informada = onde.planta_id?.trim();
  if (informada) fontes.push({ de: 'informada', planta: informada });

  const gravada = onde.planta_gravada?.trim();
  if (fontes.length === 0 && gravada) return gravada;

  if (fontes.length === 0) {
    throw new BadRequestException(
      'Toda programação precisa de planta. A origem escolhida não tem planta e nenhuma foi informada.',
    );
  }

  const [primeira] = fontes;
  const divergente = fontes.find((f) => f.planta !== primeira.planta);
  if (divergente) {
    throw new BadRequestException(
      `A planta ${divergente.de} não é a mesma ${primeira.de}. Confira a origem da programação.`,
    );
  }
  return primeira.planta;
}

/** A planta gravada na anomalia ou, na anomalia antiga sem ela, a do equipamento. */
async function plantaDaAnomalia(prisma: PrismaService, anomaliaId: string): Promise<string | null> {
  const [anomalia] = await prisma.$queryRaw<{ planta_id: string | null; equipamento_id: string | null }[]>`
    SELECT trim(planta_id) AS planta_id, trim(equipamento_id) AS equipamento_id
    FROM anomalias WHERE trim(id) = ${anomaliaId}`;
  if (!anomalia) return null;
  if (anomalia.planta_id) return anomalia.planta_id;
  const [doEquipamento] = await plantasDosEquipamentos(prisma, [anomalia.equipamento_id]);
  return doEquipamento ?? null;
}

/** Os equipamentos das tarefas escolhidas (a tarefa viva, antes de congelar no vínculo). */
export async function equipamentosDasTarefas(prisma: PrismaService, tarefaIds: string[] | undefined): Promise<string[]> {
  const ids = [...new Set((tarefaIds ?? []).map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];
  const linhas = await prisma.$queryRaw<{ equipamento_id: string | null }[]>`
    SELECT trim(equipamento_id) AS equipamento_id FROM tarefas WHERE trim(id) IN (${Prisma.join(ids)})`;
  return linhas.map((l) => l.equipamento_id).filter((id): id is string => !!id);
}
