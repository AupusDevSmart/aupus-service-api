import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

type Cliente = Pick<Prisma.TransactionClient, '$queryRaw' | 'unidades' | 'plantas' | 'solicitacoes_servico'>;

/**
 * A solicitação sem planta ganha a planta e a instalação da programação que a
 * atende (28/out/2026).
 *
 * A equipe cadastra a solicitação só com o cliente em texto, porque muita delas
 * não vira OS; a planta e a instalação se escolhem ao programar. A programação
 * guarda a planta, mas a instalação não é coluna dela: vem da origem. Gravar as
 * duas de volta na solicitação deixa a origem, a OS e o histórico completos dali
 * em diante — e o cliente dono da planta passa a enxergar a solicitação.
 *
 * Só preenche o que está vazio: a solicitação que já tem planta não é mexida (a
 * planta da programação já foi conferida contra ela em `plantaDaProgramacao`).
 */
export async function lugarParaASolicitacaoSemPlanta(
  prisma: Cliente,
  solicitacaoId: string | null | undefined,
  plantaDaProgramacao: string | null | undefined,
  unidadeId: string | null | undefined,
): Promise<void> {
  const id = solicitacaoId?.trim();
  const plantaId = plantaDaProgramacao?.trim();
  if (!id || !plantaId) return;

  // O id da solicitação é texto sem espaço (cuid): a igualdade usa o índice da chave
  const [solicitacao] = await prisma.$queryRaw<{ id: string; planta_id: string | null }[]>`
    SELECT id, trim(planta_id) AS planta_id FROM solicitacoes_servico WHERE id = ${id}`;
  if (!solicitacao || solicitacao.planta_id) return;

  const unidade = unidadeId?.trim() || null;
  if (unidade) {
    const achada = await prisma.unidades.findFirst({ where: { id: unidade, deleted_at: null }, select: { planta_id: true } });
    if (!achada || achada.planta_id?.trim() !== plantaId) {
      throw new BadRequestException('A instalação escolhida não é da planta da programação.');
    }
  }

  const planta = await prisma.plantas.findFirst({ where: { id: plantaId, deleted_at: null }, select: { proprietario_id: true } });
  if (!planta) throw new NotFoundException('Planta não encontrada');

  // `planta_id: null` no filtro: duas programações da mesma solicitação ao mesmo tempo não se sobrescrevem
  await prisma.solicitacoes_servico.updateMany({
    where: { id: solicitacao.id, planta_id: null },
    data: { planta_id: plantaId, unidade_id: unidade, proprietario_id: planta.proprietario_id?.trim() || null },
  });
}
