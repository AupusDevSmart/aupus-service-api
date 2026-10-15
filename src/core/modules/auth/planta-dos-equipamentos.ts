import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * A planta de cada equipamento: a do próprio equipamento, senão a da unidade
 * dele, senão — componente (UAR), que não tem unidade — a da unidade do UC pai.
 * SQL cru com trim() dos dois lados: os ids são Char(26) com espaço e os ids
 * congelados nas tarefas da OS não têm relação no Prisma. Planta só de espaços
 * conta como sem planta.
 */
export async function plantaDeCadaEquipamento(
  prisma: PrismaService,
  equipamentoIds: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(equipamentoIds.map((id) => id?.trim()).filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const linhas = await prisma.$queryRaw<{ equipamento_id: string; planta_id: string | null }[]>`
    SELECT trim(e.id) AS equipamento_id,
           COALESCE(NULLIF(trim(e.planta_id), ''), NULLIF(trim(u.planta_id), ''), NULLIF(trim(up.planta_id), '')) AS planta_id
    FROM equipamentos e
    LEFT JOIN unidades u ON trim(u.id) = trim(e.unidade_id)
    LEFT JOIN equipamentos pai ON trim(pai.id) = trim(e.equipamento_pai_id)
    LEFT JOIN unidades up ON trim(up.id) = trim(pai.unidade_id)
    WHERE trim(e.id) IN (${Prisma.join(ids)})`;
  return new Map(linhas.filter((l) => l.planta_id).map((l) => [l.equipamento_id, l.planta_id as string]));
}

/** As plantas (sem repetir) de um conjunto de equipamentos. */
export async function plantasDosEquipamentos(prisma: PrismaService, equipamentoIds: (string | null | undefined)[]): Promise<string[]> {
  return [...new Set((await plantaDeCadaEquipamento(prisma, equipamentoIds)).values())];
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
