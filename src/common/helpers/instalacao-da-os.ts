import { Prisma, PrismaService } from '@/core';

/**
 * A instalacao (tabela `unidades`) de uma programacao ou de uma OS.
 *
 * Nem `programacoes_os` nem `ordens_servico` guardam `unidade_id` — as duas
 * guardam `planta_id` e `equipamento_id`, e o segundo quase nunca vem
 * preenchido (medido em dev: 43 de 45 nas de TAREFA, ZERO nas manuais). A
 * instalacao, entao, e DERIVADA, por quatro caminhos conforme a origem:
 *
 *   TAREFA / PLANO_MANUTENCAO ... `tarefas_*.equipamento_id` (o congelado) -> equipamento -> unidade
 *   ANOMALIA .................... anomalia -> equipamento -> unidade
 *   SOLICITACAO_SERVICO ......... `solicitacao.unidade_id`, quando preenchido
 *   MANUAL ...................... nao ha caminho: a OP manual nao registra equipamento nem unidade
 *
 * Por isso a resposta e uma LISTA e pode vir VAZIA. Vazia nao e falha de
 * consulta, e o dado nao existir — e a tela precisa dizer isso, em vez de cair
 * para a planta, que e um nivel acima e responde outra pergunta.
 *
 * Lista, e nao valor unico, porque uma programacao agrupa N tarefas que podem
 * estar em equipamentos de instalacoes diferentes. Hoje nao ha nenhuma assim em
 * dev, mas nada no schema impede.
 *
 * ## Por que SQL cru
 *
 * Os ids sao `Char(26)` e voltam do banco com padding de espaco, enquanto
 * varias FKs sao `VarChar`. O Prisma resolve relacao comparando os dois lados
 * em JavaScript depois de buscar, e `'abc   ' !== 'abc'` — o proprio
 * `execucao-os.service` ja carrega um laco que refaz a mao os includes que
 * voltaram nulos por causa disso. Com `trim()` dos dois lados no SQL o problema
 * nao existe.
 *
 * E uma consulta por pagina, nao uma por linha.
 */

export interface Instalacao {
  id: string;
  nome: string;
}

interface LinhaCrua {
  ref: string;
  id: string;
  nome: string;
}

/**
 * Equipamento -> instalacao, subindo para o pai quando for componente.
 *
 * UAR nao tem `unidade_id` proprio: quem tem e o UC de que ele faz parte. Sem o
 * `COALESCE`, todo componente ficaria sem instalacao — e componente e boa parte
 * do que aparece em tarefa.
 */
const EQUIPAMENTO_ATE_UNIDADE = Prisma.sql`
  SELECT trim(e.id) AS eq, trim(COALESCE(e.unidade_id, pai.unidade_id)) AS unidade
    FROM equipamentos e
    LEFT JOIN equipamentos pai ON trim(pai.id) = trim(e.equipamento_pai_id)
`;

/**
 * O `DISTINCT` importa: dez tarefas no mesmo equipamento devolvem a mesma
 * instalacao dez vezes, e a tela mostraria "Varias (10)" para o que e uma so.
 */
const SELECT_FINAL = Prisma.sql`
  SELECT DISTINCT o.ref, trim(u.id) AS id, u.nome
    FROM origens o
    JOIN unidades u ON trim(u.id) = o.unidade
   WHERE o.unidade IS NOT NULL AND u.deleted_at IS NULL
   ORDER BY u.nome
`;

export async function instalacoesDasProgramacoes(
  prisma: PrismaService,
  programacaoIds: string[],
): Promise<Map<string, Instalacao[]>> {
  if (programacaoIds.length === 0) return new Map();

  const ids = Prisma.join(programacaoIds);

  const linhas = await prisma.$queryRaw<LinhaCrua[]>(Prisma.sql`
    WITH eq_unidade AS (${EQUIPAMENTO_ATE_UNIDADE}),
    origens AS (
      SELECT tp.programacao_id AS ref, eu.unidade
        FROM tarefas_programacao_os tp
        JOIN eq_unidade eu ON eu.eq = trim(tp.equipamento_id)
       WHERE tp.programacao_id IN (${ids})
      UNION
      SELECT po.id, eu.unidade
        FROM programacoes_os po
        JOIN eq_unidade eu ON eu.eq = trim(po.equipamento_id)
       WHERE po.id IN (${ids})
      UNION
      SELECT po.id, eu.unidade
        FROM programacoes_os po
        JOIN anomalias a ON trim(a.id) = trim(po.anomalia_id)
        JOIN eq_unidade eu ON eu.eq = trim(a.equipamento_id)
       WHERE po.id IN (${ids})
      UNION
      SELECT po.id, trim(s.unidade_id)
        FROM programacoes_os po
        JOIN solicitacoes_servico s ON trim(s.id) = trim(po.solicitacao_servico_id)
       WHERE po.id IN (${ids}) AND s.unidade_id IS NOT NULL
    )
    ${SELECT_FINAL}
  `);

  return agrupar(linhas);
}

export async function instalacoesDasOrdens(
  prisma: PrismaService,
  ordemIds: string[],
): Promise<Map<string, Instalacao[]>> {
  if (ordemIds.length === 0) return new Map();

  const ids = Prisma.join(ordemIds);

  const linhas = await prisma.$queryRaw<LinhaCrua[]>(Prisma.sql`
    WITH eq_unidade AS (${EQUIPAMENTO_ATE_UNIDADE}),
    origens AS (
      SELECT t.os_id AS ref, eu.unidade
        FROM tarefas_os t
        JOIN eq_unidade eu ON eu.eq = trim(t.equipamento_id)
       WHERE t.os_id IN (${ids})
      UNION
      SELECT os.id, eu.unidade
        FROM ordens_servico os
        JOIN eq_unidade eu ON eu.eq = trim(os.equipamento_id)
       WHERE os.id IN (${ids})
      UNION
      SELECT os.id, eu.unidade
        FROM ordens_servico os
        JOIN anomalias a ON trim(a.id) = trim(os.anomalia_id)
        JOIN eq_unidade eu ON eu.eq = trim(a.equipamento_id)
       WHERE os.id IN (${ids})
      UNION
      -- A OS nao tem solicitacao_servico_id: so a programacao tem. Sem este
      -- salto, toda OS vinda de solicitacao ficaria sem instalacao mesmo com a
      -- solicitacao apontando uma.
      SELECT os.id, trim(s.unidade_id)
        FROM ordens_servico os
        JOIN programacoes_os po ON po.id = os.programacao_id
        JOIN solicitacoes_servico s ON trim(s.id) = trim(po.solicitacao_servico_id)
       WHERE os.id IN (${ids}) AND s.unidade_id IS NOT NULL
    )
    ${SELECT_FINAL}
  `);

  return agrupar(linhas);
}

function agrupar(linhas: LinhaCrua[]): Map<string, Instalacao[]> {
  const mapa = new Map<string, Instalacao[]>();

  for (const linha of linhas) {
    const lista = mapa.get(linha.ref) ?? [];
    lista.push({ id: linha.id, nome: linha.nome });
    mapa.set(linha.ref, lista);
  }

  return mapa;
}
