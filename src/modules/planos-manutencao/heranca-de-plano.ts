import { PrismaService } from '@/core';

export interface TarefaHerdada {
  id: string;
  nome: string;
  data_ultima_execucao: Date | null;
  data_ancora: Date | null;
  numero_execucoes: number;
}

export interface PlanoAHerdar {
  template_id: string | null;
  nome: string;
  tarefas: TarefaHerdada[];
}

export interface AjusteDeData {
  tarefa_id: string;
  data_ultima_execucao: Date | null;
}

/**
 * O plano que o ocupante ANTERIOR desta posicao tinha.
 *
 * O plano e do equipamento, entao o novo nasce sem nenhum. Mas a posicao nao
 * mudou de funcao: o que se fazia ali continua tendo de ser feito. Isto e o que
 * a tela mostra antes de perguntar "quer herdar?".
 *
 * Devolve o TEMPLATE, nao a copia. Herdar a copia amarraria o equipamento novo
 * ao plano do antigo — e o que se repete e o plano da categoria, do qual as duas
 * copias sao instancias.
 *
 * As datas vem junto porque sao o que precisa de ajuste: uma preventiva
 * semestral feita ha 3 meses no equipamento antigo pode ter sido feita ha 5 no
 * novo. Herdar o plano com as datas do outro equipamento produziria vencimento
 * errado silenciosamente.
 */
export async function planoAHerdar(
  prisma: PrismaService,
  ativoFuncionalId: string,
): Promise<PlanoAHerdar | null> {
  const posicao = ativoFuncionalId?.trim();
  if (!posicao) return null;

  const anterior = await prisma.ativos_funcionais_equipamentos.findFirst({
    where: { ativo_funcional_id: posicao, removido_em: { not: null } },
    orderBy: { removido_em: 'desc' },
    select: { equipamento_id: true },
  });
  if (!anterior) return null;

  const plano = await prisma.planos_manutencao.findFirst({
    where: { equipamento_id: anterior.equipamento_id, deleted_at: null },
    select: {
      nome: true,
      plano_origem_id: true,
      tarefas: {
        where: { deleted_at: null },
        orderBy: { ordem: 'asc' },
        select: {
          id: true, nome: true, data_ultima_execucao: true,
          data_ancora: true, numero_execucoes: true,
        },
      },
    },
  });
  if (!plano) return null;

  return {
    template_id: plano.plano_origem_id?.trim() ?? null,
    nome: plano.nome,
    tarefas: plano.tarefas.map(t => ({
      id: t.id.trim(),
      nome: t.nome,
      data_ultima_execucao: t.data_ultima_execucao,
      data_ancora: t.data_ancora,
      numero_execucoes: t.numero_execucoes,
    })),
  };
}

/**
 * Ajusta as datas das tarefas do equipamento novo depois da heranca.
 *
 * A ancora acompanha a ultima execucao porque e dela que sai o proximo
 * vencimento: mudar so a data de execucao deixaria o agendamento contando a
 * partir do dia em que a copia foi criada.
 *
 * So mexe em tarefa que pertence ao equipamento informado — ajustar tarefa de
 * outro reescreveria historico alheio, e a chamada vem do front com ids que o
 * usuario pode ter visto numa tela anterior.
 */
export async function aplicarDatasHerdadas(
  prisma: PrismaService,
  equipamentoId: string,
  ajustes: AjusteDeData[],
): Promise<number> {
  const equipamento = equipamentoId?.trim();
  if (!equipamento || !ajustes?.length) return 0;

  const permitidas = await prisma.tarefas.findMany({
    where: {
      equipamento_id: equipamento,
      deleted_at: null,
      id: { in: ajustes.map(a => a.tarefa_id?.trim()).filter(Boolean) },
    },
    select: { id: true },
  });
  const podeAjustar = new Set(permitidas.map(t => t.id.trim()));

  let ajustadas = 0;
  for (const ajuste of ajustes) {
    const id = ajuste.tarefa_id?.trim();
    if (!id || !podeAjustar.has(id)) continue;

    await prisma.tarefas.update({
      where: { id },
      data: {
        data_ultima_execucao: ajuste.data_ultima_execucao,
        data_ancora: ajuste.data_ultima_execucao,
      },
    });
    ajustadas++;
  }

  return ajustadas;
}
