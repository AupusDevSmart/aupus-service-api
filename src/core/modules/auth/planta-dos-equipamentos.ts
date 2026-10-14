import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * As plantas de um conjunto de equipamentos: a do próprio equipamento, senão a
 * da unidade dele, senão — componente (UAR), que não tem unidade — a da unidade
 * do UC pai. SQL cru com trim() dos dois lados: os ids são Char(26) com
 * espaço e os ids congelados nas tarefas da OS não têm relação no Prisma.
 */
export async function plantasDosEquipamentos(prisma: PrismaService, equipamentoIds: (string | null | undefined)[]): Promise<string[]> {
  const ids = [...new Set(equipamentoIds.map((id) => id?.trim()).filter((id): id is string => !!id))];
  if (ids.length === 0) return [];
  const linhas = await prisma.$queryRaw<{ planta_id: string | null }[]>`
    SELECT DISTINCT trim(COALESCE(e.planta_id, u.planta_id, up.planta_id)) AS planta_id
    FROM equipamentos e
    LEFT JOIN unidades u ON trim(u.id) = trim(e.unidade_id)
    LEFT JOIN equipamentos pai ON trim(pai.id) = trim(e.equipamento_pai_id)
    LEFT JOIN unidades up ON trim(up.id) = trim(pai.unidade_id)
    WHERE trim(e.id) IN (${Prisma.join(ids)})`;
  return linhas.map((l) => l.planta_id).filter((p): p is string => !!p);
}

/** A planta das tarefas de uma OS ou programação, quando todas são da mesma; senão null. */
export async function plantaDasTarefas(
  prisma: PrismaService,
  de: { osId: string } | { programacaoId: string },
): Promise<string | null> {
  const vinculos =
    'osId' in de
      ? await prisma.tarefas_os.findMany({ where: { os_id: de.osId.trim() }, select: { equipamento_id: true } })
      : await prisma.tarefas_programacao_os.findMany({ where: { programacao_id: de.programacaoId.trim() }, select: { equipamento_id: true } });
  const plantas = await plantasDosEquipamentos(prisma, vinculos.map((v) => v.equipamento_id));
  return plantas.length === 1 ? plantas[0] : null;
}
