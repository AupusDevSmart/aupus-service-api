import type { Prisma } from '@prisma/client';
import { comNomeDaPosicao } from '@/core/modules/equipamentos/nome-exibido';
import { valoresDasInstrucoes } from '../instrucoes/valor-da-instrucao';
import { variantesDeIds } from '../tarefas/ids';

/**
 * O que a linha da programação congela além do pedido (SN-93):
 *
 * - o valor da instrução (D1): o do cadastro no vínculo, que o planejador
 *   ajusta só nesta programação, sem mexer no padrão da instrução — como a
 *   proposta e o AupusProject. `valor_original` fica para a tela mostrar o ajuste
 *   (o ajuste: `ajustarValoresDasInstrucoes`, em `instrucoes-da-programacao.ts`);
 * - o nome do equipamento, o da posição como a tela mostra: o PDF dizia "INV-03 ·
 *   Termografia e reaperto" nove vezes sem dizer de qual inversor.
 *
 * Uma consulta por tabela para todas as linhas.
 */
type Leitor = Pick<Prisma.TransactionClient, 'instrucao_recursos' | 'instrucao_maquinarios' | 'equipamentos'>;

export interface CongelamentoDaLinha {
  valor: number | null;
  valor_original: number | null;
  equipamento_nome: string | null;
}

interface LinhaACongelar {
  instrucao_id?: string | null;
  equipamento_id?: string | null;
}

/** O nome com que cada equipamento se apresenta (o da posição, ou o próprio) */
export async function nomesDosEquipamentos(db: Pick<Prisma.TransactionClient, 'equipamentos'>, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.map((id) => id?.trim()).filter((id): id is string => !!id))];
  if (unicos.length === 0) return new Map();
  const lidos = await db.equipamentos.findMany({
    where: { id: { in: variantesDeIds(unicos) } },
    select: { id: true, nome: true, ativo_funcional: { select: { nome: true } } },
  });
  return new Map(lidos.map((e) => [e.id.trim(), comNomeDaPosicao(e).nome.trim().slice(0, 255)]));
}

export async function congelamentoDasLinhas(db: Leitor, linhas: LinhaACongelar[]): Promise<CongelamentoDaLinha[]> {
  const [valores, nomes] = await Promise.all([
    valoresDasInstrucoes(db, linhas.map((l) => l.instrucao_id)),
    nomesDosEquipamentos(db, linhas.map((l) => l.equipamento_id)),
  ]);
  return linhas.map((l) => {
    const valor = l.instrucao_id ? (valores.get(l.instrucao_id.trim())?.valor ?? null) : null;
    return {
      valor,
      valor_original: valor,
      equipamento_nome: l.equipamento_id ? (nomes.get(l.equipamento_id.trim()) ?? null) : null,
    };
  });
}
