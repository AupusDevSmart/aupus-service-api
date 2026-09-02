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

  // As duas formas do mesmo id. `ativos_funcionais_equipamentos.equipamento_id`
  // e char(26) e sempre devolve com padding; `planos_manutencao.equipamento_id`
  // e VARCHAR(26) e guarda exatamente o que quem escreveu mandou — trimado pelo
  // `vincularEquipamento`, com padding por quem gravou direto. char nao ignora
  // espaco nessa comparacao, entao procurar so uma das formas perde metade das
  // linhas, e a heranca sumiria calada: a tela diria "nada a herdar" com o plano
  // existindo no banco.
  const idDoAnterior = anterior.equipamento_id;

  const plano = await prisma.planos_manutencao.findFirst({
    where: {
      equipamento_id: { in: [idDoAnterior, idDoAnterior.trim()] },
      deleted_at: null,
    },
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

/**
 * Traduz os ajustes vindos da tela para as tarefas da copia NOVA.
 *
 * A tela edita as datas olhando as tarefas do equipamento ANTIGO — sao as unicas
 * que existiam quando a pessoa abriu o painel. As tarefas do novo so nascem
 * quando o template e copiado, ja com outros ids.
 *
 * A ponte entre as duas e `tarefa_origem_id`: as duas copias saem da MESMA
 * tarefa do template, entao apontam para o mesmo id. Casar por nome ou por
 * `ordem` daria empate silencioso em plano com duas tarefas de nome parecido, ou
 * erraria de linha se o template tivesse sido reordenado no meio.
 *
 * Tarefa antiga sem origem (criada a mao no equipamento anterior) nao tem
 * correspondente e fica de fora — nao ha o que casar.
 */
export async function mapearAjustesParaCopia(
  prisma: PrismaService,
  equipamentoId: string,
  ajustes: AjusteDeData[],
): Promise<AjusteDeData[]> {
  const equipamento = equipamentoId?.trim();
  if (!equipamento || !ajustes?.length) return [];

  const antigas = await prisma.tarefas.findMany({
    where: { id: { in: ajustes.map(a => a.tarefa_id?.trim()).filter(Boolean) } },
    select: { id: true, tarefa_origem_id: true },
  });
  const origemDaAntiga = new Map(
    antigas
      .filter(t => t.tarefa_origem_id)
      .map(t => [t.id.trim(), t.tarefa_origem_id!.trim()]),
  );

  const novas = await prisma.tarefas.findMany({
    where: {
      equipamento_id: equipamento,
      deleted_at: null,
      tarefa_origem_id: { in: [...new Set(origemDaAntiga.values())] },
    },
    select: { id: true, tarefa_origem_id: true },
  });
  const novaPorOrigem = new Map(
    novas.map(t => [t.tarefa_origem_id!.trim(), t.id.trim()]),
  );

  const traduzidos: AjusteDeData[] = [];
  for (const ajuste of ajustes) {
    const origem = origemDaAntiga.get(ajuste.tarefa_id?.trim());
    const nova = origem && novaPorOrigem.get(origem);
    if (nova) traduzidos.push({ tarefa_id: nova, data_ultima_execucao: ajuste.data_ultima_execucao });
  }
  return traduzidos;
}
