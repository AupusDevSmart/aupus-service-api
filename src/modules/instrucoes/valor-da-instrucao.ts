import type { Prisma } from '@prisma/client';
import { centavos } from '../recursos/regras-do-recurso';
import { variantesDeIds } from '../tarefas/ids';
import { linhaDoMaquinario, linhaDoRecurso } from './custo-da-instrucao';

/**
 * O valor de cada instrução pelo cadastro: a soma das linhas de recurso e de
 * maquinário (a conta do AupusProject, `custo-da-instrucao.ts`). É o valor que a
 * proposta (SN-86) e a OS (SN-93) congelam ao vincular a instrução, e que quem
 * vincula ajusta só ali.
 *
 * A linha sem preço entra como zero, porque é sugestão; `semPreco` diz quais
 * instruções têm linha assim, para a tela avisar: sem o aviso, o valor parecia
 * completo e saía abaixo do custo.
 */
export interface ValorDaInstrucao {
  valor: number;
  semPreco: boolean;
}

type Leitor = Pick<Prisma.TransactionClient, 'instrucao_recursos' | 'instrucao_maquinarios'>;

export async function valoresDasInstrucoes(db: Leitor, ids: (string | null | undefined)[]): Promise<Map<string, ValorDaInstrucao>> {
  const unicos = [...new Set(ids.map((id) => id?.trim()).filter((id): id is string => !!id))];
  const valores = new Map<string, ValorDaInstrucao>(unicos.map((id) => [id, { valor: 0, semPreco: false }]));
  if (unicos.length === 0) return valores;

  // Pelas variantes do id: instrucao_recursos.instrucao_id é Char(26), e o id de 25 caracteres cru não casava
  const [recursos, maquinarios] = await Promise.all([
    db.instrucao_recursos.findMany({ where: { instrucao_id: { in: variantesDeIds(unicos) } }, include: { recurso: true } }),
    db.instrucao_maquinarios.findMany({ where: { instrucao_id: { in: variantesDeIds(unicos) } }, include: { maquinario: true } }),
  ]);
  const somar = (instrucaoId: string, subtotal: number | null) => {
    const atual = valores.get(instrucaoId.trim());
    if (!atual) return;
    atual.valor += subtotal ?? 0;
    if (subtotal === null) atual.semPreco = true;
  };
  for (const r of recursos) somar(r.instrucao_id, linhaDoRecurso(r).subtotal);
  for (const m of maquinarios) somar(m.instrucao_id, linhaDoMaquinario(m).subtotal);
  for (const v of valores.values()) v.valor = centavos(v.valor);
  return valores;
}
