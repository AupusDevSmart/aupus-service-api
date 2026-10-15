import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * A planta de cada equipamento: a da unidade dele, senão — componente (UAR),
 * que não tem unidade — a da unidade do UC pai, senão a coluna `planta_id` do
 * próprio equipamento. Essa coluna é da estrutura antiga e fica velha quando o
 * UC muda de planta, por isso vem por último (SN-12).
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
           COALESCE(NULLIF(trim(u.planta_id), ''), NULLIF(trim(up.planta_id), ''), NULLIF(trim(e.planta_id), '')) AS planta_id
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

/**
 * A regra de `plantaDeCadaEquipamento` como filtro do Prisma, para as listas
 * no escopo: a planta da unidade; sem unidade, a da unidade do UC pai; sem
 * nenhuma das duas, a coluna antiga. A coluna só vale sem unidade, porque fica
 * velha quando o UC muda de planta (SN-12).
 */
export function equipamentoNasPlantas(plantas: string[]): Prisma.equipamentosWhereInput {
  return {
    OR: [
      { unidade: { planta_id: { in: plantas } } },
      { unidade_id: null, equipamento_pai: { unidade: { planta_id: { in: plantas } } } },
      { unidade_id: null, planta_id: { in: plantas }, OR: [{ equipamento_pai_id: null }, { equipamento_pai: { unidade_id: null } }] },
    ],
  };
}
