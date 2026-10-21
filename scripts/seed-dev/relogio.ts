import type { PrismaService } from '@/core';

/**
 * O relógio do seed: cada passo roda agora, pelos services de verdade, e os
 * carimbos que ele gravou vão para a data simulada daquele passo.
 *
 * Os services carimbam com `new Date()` (o instante real do passo, de poucos
 * milissegundos) e o banco com `now()`, que numa transação só é o instante em
 * que ela começou. Depois de cada passo, todo carimbo que caiu na janela real
 * dele, ou que é o `now()` da transação, vira a data simulada (mais o
 * deslocamento dentro do passo, que preserva a ordem). O que veio de fora — a
 * data programada, o início real informado no DTO — está fora da janela e
 * fica como veio.
 *
 * É o que deixa a história de seis meses coerente: o gerador de preventivas
 * lê a última execução da tarefa já na data simulada, e o código de
 * verificação da OS finalizada é regravado com as datas do passo.
 */
export interface ColunaDeCarimbo {
  tabela: string;
  coluna: string;
  /** O tipo da coluna como o banco o escreve ("timestamp(3) without time zone") */
  tipo: string;
  comFuso: boolean;
}

/** As tabelas cujos carimbos o seed move: as que os passos gravam. */
export const TABELAS_DO_RELOGIO = [
  'usuarios', 'model_has_roles', 'planta_operadores', 'plantas', 'unidades', 'configuracao_plantas', 'configuracoes_dias_uteis',
  'feriados', 'feriado_plantas', 'equipamentos', 'equipamentos_dados_tecnicos', 'ativos_funcionais', 'ativos_funcionais_equipamentos',
  'recursos', 'maquinarios', 'instrucoes', 'sub_instrucoes', 'instrucao_recursos', 'instrucao_maquinarios', 'anexos_instrucao',
  'planos_manutencao', 'tarefas', 'propagacoes_plano', 'veiculos', 'documentacao_veiculos', 'reservas_veiculos',
  'anomalias', 'historico_anomalias', 'anexos_anomalias', 'anomalias_instrucoes',
  'solicitacoes_servico', 'historico_solicitacao_servico', 'solicitacoes_instrucoes', 'solicitacoes_itens', 'solicitacoes_outros_custos',
  'solicitacoes_subinstrucoes', 'comentarios_solicitacao_servico', 'anexos_solicitacao_servico',
  'programacoes_os', 'historico_programacao_os', 'tarefas_programacao_os', 'materiais_programacao_os', 'ferramentas_programacao_os',
  'tecnicos_programacao_os', 'itens_orcamento_programacao_os',
  'ordens_servico', 'historico_os', 'tarefas_os', 'checklist_atividades_os', 'anexos_os', 'registros_tempo_os', 'tecnicos_os',
  'materiais_os', 'ferramentas_os', 'itens_orcamento_os', 'comentarios_os',
  'notificacoes_eventos', 'notificacoes', 'notificacoes_envios',
];

/** Texto do instante para o SQL: sem fuso nas colunas `timestamp` (o Prisma grava UTC nelas). */
const literal = (instante: Date, comFuso: boolean) => {
  const iso = instante.toISOString();
  return comFuso ? `'${iso}'::timestamptz` : `'${iso.replace('T', ' ').replace('Z', '')}'::timestamp`;
};

/**
 * O `now()` da transação no tipo da coluna: é exatamente o que o `DEFAULT now()`
 * gravou nela (mesma precisão, mesmo arredondamento, mesmo fuso da sessão). Um
 * literal do JavaScript tem milissegundo e o `now()`, microssegundo: não casava.
 */
const agoraDaTransacao = (coluna: ColunaDeCarimbo) => `now()::${coluna.tipo}`;

export class Relogio {
  private colunas: ColunaDeCarimbo[] = [];
  /** A data simulada do passo em curso (a de fora de qualquer passo é a real) */
  private emCurso: Date | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async preparar(): Promise<void> {
    this.colunas = await this.prisma.$queryRawUnsafe<ColunaDeCarimbo[]>(
      `SELECT c.relname AS tabela, a.attname AS coluna, format_type(a.atttypid, a.atttypmod) AS tipo, t.typname = 'timestamptz' AS "comFuso"
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_type t ON t.oid = a.atttypid
        WHERE n.nspname = 'public' AND c.relname = ANY($1::text[]) AND a.attnum > 0 AND NOT a.attisdropped
          AND t.typname IN ('timestamp', 'timestamptz')
        ORDER BY c.relname, a.attname`,
      TABELAS_DO_RELOGIO,
    );
  }

  /** A data simulada do passo em curso; fora de um passo, nula */
  passoEmCurso(): Date | null {
    return this.emCurso;
  }

  /**
   * Quantas linhas cada tabela já recebeu ou mudou nesta transação: o
   * `pg_stat_xact_user_tables` conta só a transação em curso. Comparar antes e
   * depois diz quais tabelas o passo tocou, e o carimbo só passa por elas (passar
   * por todas a cada passo ficava quadrático com a história crescendo).
   */
  private async escritas(): Promise<Map<string, number>> {
    const linhas = await this.prisma.$queryRawUnsafe<{ tabela: string; n: bigint }[]>(
      `SELECT relname AS tabela, n_tup_ins + n_tup_upd AS n FROM pg_stat_xact_user_tables
        WHERE schemaname = 'public' AND relname = ANY($1::text[])`,
      TABELAS_DO_RELOGIO,
    );
    return new Map(linhas.map((l) => [l.tabela, Number(l.n)]));
  }

  /** Roda o passo e leva os carimbos dele para `quando`. */
  async em<T>(quando: Date, passo: () => Promise<T>): Promise<T> {
    if (this.emCurso) return passo();
    if (this.colunas.length === 0) throw new Error('Relógio sem preparar');
    const antes = await this.escritas();
    const inicio = new Date(Date.now() - 1000);
    this.emCurso = quando;
    try {
      const resultado = await passo();
      // Timestamp(0) arredonda para o segundo seguinte: a folga cobre
      const fim = new Date(Date.now() + 1000);
      const depois = await this.escritas();
      const tocadas = new Set([...depois].filter(([tabela, n]) => n !== (antes.get(tabela) ?? 0)).map(([tabela]) => tabela));
      await this.carimbar(inicio, fim, quando, tocadas);
      return resultado;
    } finally {
      this.emCurso = null;
    }
  }

  /**
   * Os carimbos que ficaram no `now()` da transação, por tabela e coluna: o que
   * se gravou fora de qualquer passo. A história deveria não ter nenhum.
   */
  async restos(): Promise<string[]> {
    const restos: string[] = [];
    for (const coluna of this.colunas) {
      const [{ n }] = await this.prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM "${coluna.tabela}" WHERE "${coluna.coluna}" = ${agoraDaTransacao(coluna)}`,
      );
      if (Number(n) > 0) restos.push(`${coluna.tabela}.${coluna.coluna}: ${Number(n)}`);
    }
    return restos;
  }

  private async carimbar(inicio: Date, fim: Date, quando: Date, tocadas: Set<string>): Promise<void> {
    if (tocadas.size === 0) return;
    const comandos = this.colunas.filter(({ tabela }) => tocadas.has(tabela)).map((coluna) => {
      const c = `"${coluna.coluna}"`;
      const de = literal(inicio, coluna.comFuso);
      const ate = literal(fim, coluna.comFuso);
      const banco = agoraDaTransacao(coluna);
      const alvo = literal(quando, coluna.comFuso);
      return `UPDATE "${coluna.tabela}" SET ${c} = CASE WHEN ${c} = ${banco} THEN ${alvo} ELSE ${alvo} + (${c} - ${de}) END
               WHERE ${c} = ${banco} OR (${c} >= ${de} AND ${c} <= ${ate});`;
    });
    await this.prisma.$executeRawUnsafe(`DO $relogio$ BEGIN ${comandos.join('\n')} END $relogio$;`);
  }
}
