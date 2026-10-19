import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PermissionScopeService, PrismaService, ScopedUser } from '@/core';
import { plantasDosEquipamentos } from '@/core/modules/auth/planta-dos-equipamentos';

export interface LugarDaSolicitacao {
  planta_id?: string | null;
  unidade_id?: string | null;
  equipamento_id?: string | null;
}

/**
 * A planta da solicitação — a informada ou a da unidade — e a coerência do
 * lugar: a unidade e o equipamento têm de ser dessa planta.
 *
 * Para quem tem escopo, a planta, a unidade ou o equipamento de fora respondem
 * como o que não existe: o escopo é conferido antes da busca e com a mesma
 * mensagem do "não encontrado" (SN-57). Antes a ordem era a inversa, e o texto
 * diferente contava que o id de outra planta existe.
 *
 * Antes também a unidade só era lida quando vinha sem a planta, e o equipamento
 * nunca: com as duas, a unidade (ou o equipamento) de outra planta passava. E a
 * edição não conferia nada — a solicitação podia ser levada para uma planta
 * fora do escopo de quem editava.
 */
export async function plantaDaSolicitacao(
  prisma: PrismaService,
  escopo: PermissionScopeService,
  lugar: LugarDaSolicitacao,
  user?: ScopedUser,
): Promise<string> {
  let plantaId = lugar.planta_id?.trim() || undefined;
  const unidadeId = lugar.unidade_id?.trim();
  const equipamentoId = lugar.equipamento_id?.trim();

  if (unidadeId) {
    const naoEncontrada = `Unidade com ID ${unidadeId} não encontrada`;
    const unidade = await prisma.unidades.findUnique({ where: { id: unidadeId }, select: { planta_id: true } });
    if (!unidade) throw new NotFoundException(naoEncontrada);
    if (user) await escopo.assertPlantaInScope(unidade.planta_id, user, naoEncontrada);
    const daUnidade = unidade.planta_id?.trim();
    if (plantaId && daUnidade !== plantaId) throw new BadRequestException('A unidade informada não é da planta informada.');
    plantaId = plantaId || daUnidade;
  }

  if (!plantaId) throw new BadRequestException('É necessário informar planta_id ou unidade_id');

  const plantaNaoEncontrada = `Planta com ID ${plantaId} não encontrada ou foi deletada`;
  if (user) await escopo.assertPlantaInScope(plantaId, user, plantaNaoEncontrada);
  const planta = await prisma.plantas.findFirst({ where: { id: plantaId, deleted_at: null }, select: { id: true } });
  if (!planta) throw new NotFoundException(plantaNaoEncontrada);

  if (equipamentoId) {
    const [doEquipamento] = await plantasDosEquipamentos(prisma, [equipamentoId]);
    if (user) await escopo.assertPlantaInScope(doEquipamento ?? null, user, 'Equipamento não encontrado');
    if (!doEquipamento) throw new NotFoundException('Equipamento não encontrado');
    if (doEquipamento !== plantaId) throw new BadRequestException('O equipamento informado não é da planta informada.');
  }

  return plantaId;
}

/** A edição mexeu no lugar? Só aí ele é conferido: dado antigo incoerente não trava a edição de outro campo. */
export function mudouOLugar(pedido: LugarDaSolicitacao, atual: LugarDaSolicitacao): boolean {
  const igual = (a?: string | null, b?: string | null) => (a?.trim() || null) === (b?.trim() || null);
  return (['planta_id', 'unidade_id', 'equipamento_id'] as const).some(
    (campo) => pedido[campo] !== undefined && !igual(pedido[campo], atual[campo]),
  );
}
