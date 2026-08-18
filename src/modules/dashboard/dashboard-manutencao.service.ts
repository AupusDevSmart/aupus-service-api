// src/modules/dashboard/dashboard-manutencao.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, PermissionScopeService, PlantaScope } from '@aupus/api-shared';

type UserCtx = { id: string; role?: string | null } | undefined;

export interface FiltrosDashboardManutencao {
  periodo?: '12meses' | 'mes' | 'trimestre' | 'ano';
  plantaId?: string;
  unidadeId?: string;
  equipe?: string;
  criticidade?: string;
}

/**
 * Indicador que a tela mostra. `simulado` existe porque nem tudo que a
 * especificação pede tem origem no banco hoje — e mostrar número inventado sem
 * dizer que é inventado é a forma mais rápida de perder a confiança no painel.
 *
 * O que falta para cada um sair de simulado está em `pendencia`.
 */
export interface Indicador {
  id: string;
  icone: string;
  rotulo: string;
  valor: string;
  unidade?: string;
  nota: string;
  status: null | 'ok' | 'warn' | 'bad';
  simulado?: boolean;
  pendencia?: string;
}

const MESES_CURTOS = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
];

/** Ordens que ainda consomem capacidade da equipe. */
const STATUS_EM_ABERTO = ['PENDENTE', 'EM_EXECUCAO', 'PAUSADA'];
/** Ordens que já produziram resultado. */
const STATUS_CONCLUIDO = ['EXECUTADA', 'AUDITADA', 'FINALIZADA'];

@Injectable()
export class DashboardManutencaoService {
  private readonly logger = new Logger(DashboardManutencaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: PermissionScopeService,
  ) {}

  // ============================================================
  // ESCOPO E FILTROS
  // ============================================================

  private async getScope(user?: UserCtx): Promise<PlantaScope> {
    if (!user?.id) return null;
    return this.scopeService.getPlantasDoUsuario(user.id, user.role);
  }

  /**
   * Recorte de OS. Junta o escopo de plantas do usuário com os filtros da tela.
   *
   * A planta entra por dois caminhos porque `ordens_servico.planta_id` só está
   * preenchido em parte das linhas — no resto, a planta só se alcança pelo
   * equipamento. Filtrar só pela coluna direta esconderia OS legítimas.
   */
  private filtroOS(scope: PlantaScope, filtros: FiltrosDashboardManutencao): Record<string, any> {
    const where: any = { deletado_em: null, AND: [] as any[] };

    if (Array.isArray(scope)) {
      if (scope.length === 0) return { id: '__NEVER__' };
      where.AND.push({
        OR: [
          { planta_id: { in: scope } },
          { equipamento: { unidade: { planta_id: { in: scope } } } },
        ],
      });
    }

    const plantaId = filtros.plantaId?.trim();
    if (plantaId && plantaId !== 'all') {
      where.AND.push({
        OR: [
          { planta_id: plantaId },
          { equipamento: { unidade: { planta_id: plantaId } } },
        ],
      });
    }

    const unidadeId = filtros.unidadeId?.trim();
    if (unidadeId && unidadeId !== 'all') {
      where.AND.push({ equipamento: { unidade_id: unidadeId } });
    }

    // Criticidade mora no equipamento, então filtrar por ela exclui as OS sem
    // ativo vinculado. É o comportamento correto: uma OS sem equipamento não
    // tem criticidade e não pertence a nenhuma faixa.
    const criticidade = filtros.criticidade?.trim();
    if (criticidade && criticidade !== 'all') {
      where.AND.push({ equipamento: { criticidade } });
    }

    const equipe = filtros.equipe?.trim();
    if (equipe && equipe !== 'all') {
      where.AND.push({ time_equipe: equipe });
    }

    if (where.AND.length === 0) delete where.AND;
    return where;
  }

  private filtroAnomalia(scope: PlantaScope, filtros: FiltrosDashboardManutencao): Record<string, any> {
    const where: any = { deleted_at: null, AND: [] as any[] };

    if (Array.isArray(scope)) {
      if (scope.length === 0) return { id: '__NEVER__' };
      where.AND.push({
        OR: [
          { planta_id: { in: scope } },
          { equipamento: { unidade: { planta_id: { in: scope } } } },
        ],
      });
    }

    const plantaId = filtros.plantaId?.trim();
    if (plantaId && plantaId !== 'all') {
      where.AND.push({
        OR: [
          { planta_id: plantaId },
          { equipamento: { unidade: { planta_id: plantaId } } },
        ],
      });
    }

    const unidadeId = filtros.unidadeId?.trim();
    if (unidadeId && unidadeId !== 'all') {
      where.AND.push({ equipamento: { unidade_id: unidadeId } });
    }

    const criticidade = filtros.criticidade?.trim();
    if (criticidade && criticidade !== 'all') {
      where.AND.push({ equipamento: { criticidade } });
    }

    if (where.AND.length === 0) delete where.AND;
    return where;
  }

  /** Início da janela. O padrão é 12 meses porque é o que os gráficos mostram. */
  private inicioDoPeriodo(periodo?: string): Date {
    const agora = new Date();
    const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);

    switch (periodo) {
      case 'mes':
        return inicio;
      case 'trimestre':
        inicio.setMonth(inicio.getMonth() - 2);
        return inicio;
      case 'ano':
        return new Date(agora.getFullYear(), 0, 1);
      default:
        inicio.setMonth(inicio.getMonth() - 11);
        return inicio;
    }
  }

  /** Os 12 rótulos do eixo X, do mais antigo para o mais recente. */
  private janelaDeMeses(): { rotulo: string; ano: number; mes: number }[] {
    const agora = new Date();
    const janela: { rotulo: string; ano: number; mes: number }[] = [];

    for (let i = 11; i >= 0; i--) {
      const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      janela.push({ rotulo: MESES_CURTOS[d.getMonth()], ano: d.getFullYear(), mes: d.getMonth() });
    }

    return janela;
  }

  private indiceDoMes(data: Date | null | undefined, janela: ReturnType<typeof this.janelaDeMeses>): number {
    if (!data) return -1;
    const d = new Date(data);
    return janela.findIndex((m) => m.ano === d.getFullYear() && m.mes === d.getMonth());
  }

  private numero(valor: any): number {
    if (valor === null || valor === undefined) return 0;
    const n = typeof valor === 'object' && 'toNumber' in valor ? valor.toNumber() : Number(valor);
    return Number.isFinite(n) ? n : 0;
  }

  private pct(parte: number, total: number): number {
    if (!total) return 0;
    return Math.round((parte / total) * 100);
  }

  private virgula(n: number, casas = 1): string {
    return n.toFixed(casas).replace('.', ',');
  }

  // ============================================================
  // ENTRADA
  // ============================================================

  async getDashboard(filtros: FiltrosDashboardManutencao, user?: UserCtx) {
    const scope = await this.getScope(user);
    this.logger.log(
      `[dashboard-manutencao] user=${user?.id ?? 'anon'} scope=${scope === null ? 'GLOBAL' : JSON.stringify(scope)}`,
    );

    const janela = this.janelaDeMeses();
    const desde = this.inicioDoPeriodo(filtros.periodo);
    const whereOS = this.filtroOS(scope, filtros);
    const whereAnom = this.filtroAnomalia(scope, filtros);

    // Uma leitura só das OS da janela: são dezenas, não milhões, e agregar em
    // memória evita uma dúzia de count() em série contra o mesmo recorte.
    const ordens = await this.prisma.ordens_servico.findMany({
      where: { ...whereOS, criado_em: { gte: desde } },
      select: {
        id: true,
        criado_em: true,
        status: true,
        tipo: true,
        origem: true,
        tempo_estimado: true,
        custo_real: true,
        orcamento_previsto: true,
        custos_adicionais: true,
        data_hora_programada: true,
        data_hora_inicio_real: true,
        data_hora_fim_real: true,
        time_equipe: true,
        equipamento_id: true,
        equipamento: { select: { nome: true } },
      },
    });

    const anomalias = await this.prisma.anomalias.findMany({
      where: { ...whereAnom, created_at: { gte: desde } },
      select: {
        id: true,
        created_at: true,
        status: true,
        equipamento_id: true,
        ordens_servico: {
          select: { id: true, status: true, criado_em: true, data_hora_fim_real: true },
        },
      },
    });

    return {
      atualizadoEm: new Date().toISOString(),
      meses: janela.map((m) => m.rotulo),
      opcoes: await this.montarOpcoes(scope, filtros),
      ...this.montarBlocos(ordens, anomalias, janela),
    };
  }

  /**
   * O que preencher nos combos da tela.
   *
   * Vem junto com os dados, e não de endpoints separados, por dois motivos: são
   * as mesmas plantas que o escopo do usuário já autoriza (uma segunda origem
   * poderia divergir), e evita três requisições extras a cada abertura da
   * página. A lista de unidades acompanha a planta escolhida.
   */
  private async montarOpcoes(scope: PlantaScope, filtros: FiltrosDashboardManutencao) {
    const wherePlanta: any = { deleted_at: null };
    if (Array.isArray(scope)) {
      if (scope.length === 0) return { plantas: [], unidades: [], equipes: [] };
      wherePlanta.id = { in: scope };
    }

    const plantas = await this.prisma.plantas.findMany({
      where: wherePlanta,
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    });

    const plantaId = filtros.plantaId?.trim();
    const whereUnidade: any = { deleted_at: null };
    if (plantaId && plantaId !== 'all') {
      whereUnidade.planta_id = plantaId;
    } else if (Array.isArray(scope)) {
      whereUnidade.planta_id = { in: scope };
    }

    const unidades = await this.prisma.unidades.findMany({
      where: whereUnidade,
      select: { id: true, nome: true, planta_id: true },
      orderBy: { nome: 'asc' },
      take: 300,
    });

    // Equipes saem das próprias OS: não existe cadastro de times no banco, e
    // `time_equipe` é texto livre. Sem linha preenchida, o combo não aparece.
    const equipes = await this.prisma.ordens_servico.findMany({
      where: { deletado_em: null, time_equipe: { not: null } },
      select: { time_equipe: true },
      distinct: ['time_equipe'],
      take: 50,
    });

    return {
      plantas: plantas.map((p) => ({ id: p.id.trim(), nome: p.nome })),
      unidades: unidades.map((u) => ({
        id: u.id.trim(),
        nome: u.nome,
        plantaId: u.planta_id?.trim() ?? null,
      })),
      equipes: equipes
        .map((e) => e.time_equipe?.trim())
        .filter((e): e is string => !!e)
        .sort(),
    };
  }

  // ============================================================
  // AGREGAÇÕES
  // ============================================================

  private montarBlocos(ordens: any[], anomalias: any[], janela: ReturnType<typeof this.janelaDeMeses>) {
    const emAberto = ordens.filter((o) => STATUS_EM_ABERTO.includes(o.status));
    const concluidas = ordens.filter((o) => STATUS_CONCLUIDO.includes(o.status));

    return {
      kpis: this.montarKpis(ordens, emAberto, concluidas, anomalias),
      ...this.montarAderencia(ordens, concluidas),
      custo: this.montarCusto(ordens, janela),
      custoPorOS: this.montarCustoPorOS(ordens, janela),
      finalidade: this.montarFinalidade(ordens, janela),
      anomalias: this.montarAnomalias(anomalias, janela),
      backlogIdade: this.montarBacklog(emAberto),
      ofensores: this.montarOfensores(ordens),
      ...this.montarProdutividade(ordens, concluidas, janela),
      alertas: this.montarAlertas(ordens, concluidas, anomalias),
    };
  }

  private montarKpis(ordens: any[], emAberto: any[], concluidas: any[], anomalias: any[]): Indicador[] {
    const doPlano = ordens.filter((o) => o.origem === 'PLANO_MANUTENCAO' || o.origem === 'TAREFA');
    const planoConcluidas = doPlano.filter((o) => STATUS_CONCLUIDO.includes(o.status));

    const atrasadas = emAberto.filter(
      (o) => o.data_hora_programada && new Date(o.data_hora_programada) < new Date(),
    ).length;

    const noPrazo = concluidas.filter(
      (o) =>
        o.data_hora_fim_real &&
        o.data_hora_programada &&
        new Date(o.data_hora_fim_real) <= new Date(o.data_hora_programada),
    ).length;

    const anomAbertas = anomalias.filter((a) => a.status !== 'FINALIZADA');
    const anomSemOS = anomAbertas.filter((a) => (a.ordens_servico?.length ?? 0) === 0).length;

    // MTTR real: média de horas entre início e fim das corretivas concluídas.
    const corretivasFechadas = concluidas.filter(
      (o) => o.tipo === 'CORRETIVA' && o.data_hora_inicio_real && o.data_hora_fim_real,
    );
    const mttr =
      corretivasFechadas.length > 0
        ? corretivasFechadas.reduce(
            (soma, o) =>
              soma +
              (new Date(o.data_hora_fim_real).getTime() - new Date(o.data_hora_inicio_real).getTime()) /
                36e5,
            0,
          ) / corretivasFechadas.length
        : 0;

    // Backlog em HH pendente. A spec pede semanas, mas semanas exigem a
    // capacidade da equipe, que não existe cadastrada — então mostra a grandeza
    // que é real (horas) em vez de dividir por um número inventado.
    const hhPendente = emAberto.reduce((soma, o) => soma + this.numero(o.tempo_estimado), 0);

    return [
      {
        id: 'os_planejada',
        icone: 'calendar-check',
        rotulo: 'OS planejada',
        valor: String(doPlano.length),
        nota: `${planoConcluidas.length} executadas`,
        status: null,
      },
      {
        id: 'os_aberta',
        icone: 'folder-open',
        rotulo: 'OS aberta',
        valor: String(emAberto.length),
        nota: atrasadas > 0 ? `${atrasadas} atrasadas` : 'nenhuma atrasada',
        status: atrasadas > 0 ? 'bad' : 'ok',
      },
      {
        id: 'os_concluida',
        icone: 'circle-check',
        rotulo: 'OS concluída',
        valor: String(concluidas.length),
        nota: concluidas.length > 0 ? `${this.pct(noPrazo, concluidas.length)}% no prazo` : 'sem conclusões',
        status: null,
      },
      {
        id: 'backlog',
        icone: 'stack',
        rotulo: 'Backlog',
        valor: this.virgula(hhPendente, 0),
        unidade: 'HH',
        nota: 'em semanas exige capacidade da equipe',
        status: null,
        pendencia: 'Cadastrar HH disponível por semana para converter em semanas de trabalho.',
      },
      {
        id: 'anomalias',
        icone: 'alert-triangle',
        rotulo: 'Anomalias abertas',
        valor: String(anomAbertas.length),
        nota: `${anomSemOS} ainda sem OS`,
        status: anomSemOS > 0 ? 'warn' : null,
      },
      {
        id: 'mtbf',
        icone: 'activity',
        rotulo: 'MTBF',
        valor: '—',
        unidade: 'h',
        nota: 'sem apontamento de falha',
        status: null,
        simulado: true,
        pendencia: 'Exige registro de horas em operação e de cada falha por equipamento.',
      },
      {
        id: 'mttr',
        icone: 'clock',
        rotulo: 'MTTR',
        valor: corretivasFechadas.length > 0 ? this.virgula(mttr) : '—',
        unidade: 'h',
        nota:
          corretivasFechadas.length > 0
            ? `base: ${corretivasFechadas.length} corretiva${corretivasFechadas.length > 1 ? 's' : ''}`
            : 'nenhuma corretiva concluída',
        status: null,
      },
      {
        id: 'disponibilidade',
        icone: 'plug',
        rotulo: 'Disponibilidade',
        valor: '—',
        nota: 'sem apontamento de parada',
        status: null,
        simulado: true,
        pendencia: 'Exige registro de tempo programado e tempo parado por equipamento.',
      },
    ];
  }

  private montarAderencia(ordens: any[], concluidas: any[]) {
    const doPlano = ordens.filter((o) => o.origem === 'PLANO_MANUTENCAO' || o.origem === 'TAREFA');
    const planoConcluidas = doPlano.filter((o) => STATUS_CONCLUIDO.includes(o.status));

    // Não planejada = aberta à mão ou nascida de anomalia; as duas são demanda
    // que entrou fora do plano.
    const naoPlanejada = ordens.filter((o) => o.origem === 'MANUAL' || o.origem === 'ANOMALIA').length;
    const planejada = ordens.length - naoPlanejada;

    const porOrigem = (chaves: string[]) => ordens.filter((o) => chaves.includes(o.origem)).length;
    const porTipo = (tipo: string) => ordens.filter((o) => o.tipo === tipo).length;

    return {
      execucaoPlano: {
        executadas: planoConcluidas.length,
        programadas: doPlano.length,
        meta: 95,
      },
      planejadaVsNao: {
        planejada: this.pct(planejada, ordens.length),
        naoPlanejada: this.pct(naoPlanejada, ordens.length),
      },
      origemOS: {
        plano: this.pct(porOrigem(['PLANO_MANUTENCAO', 'TAREFA']), ordens.length),
        anomalia: this.pct(porOrigem(['ANOMALIA']), ordens.length),
        solicitacao: this.pct(porOrigem(['SOLICITACAO_SERVICO', 'MANUAL']), ordens.length),
      },
      mixTipo: {
        preventiva: this.pct(porTipo('PREVENTIVA'), ordens.length),
        preditiva: this.pct(porTipo('PREDITIVA'), ordens.length),
        corretiva: this.pct(porTipo('CORRETIVA'), ordens.length),
        melhoria: this.pct(porTipo('INSPECAO') + porTipo('VISITA_TECNICA'), ordens.length),
      },
    };
  }

  /**
   * Custo mensal. O total é real (`custo_real` + `custos_adicionais`), mas a
   * decomposição em mão de obra / material / terceiros NÃO existe no banco —
   * `custo_real` é um número único. A divisão abaixo é proporção fixa, para a
   * tela poder ser validada, e vem marcada como simulada.
   */
  private montarCusto(ordens: any[], janela: ReturnType<typeof this.janelaDeMeses>) {
    const total = new Array(12).fill(0);
    const orcado = new Array(12).fill(0);

    for (const o of ordens) {
      const i = this.indiceDoMes(o.data_hora_fim_real ?? o.criado_em, janela);
      if (i < 0) continue;
      total[i] += this.numero(o.custo_real) + this.numero(o.custos_adicionais);
      orcado[i] += this.numero(o.orcamento_previsto);
    }

    const emMil = (v: number) => Math.round(v / 100) / 10;

    return {
      maoObra: total.map((v) => emMil(v * 0.55)),
      material: total.map((v) => emMil(v * 0.3)),
      terceiros: total.map((v) => emMil(v * 0.15)),
      orcado: orcado.map(emMil),
      total: total.map(emMil),
      simulado: true,
      pendencia:
        'A decomposição por natureza é proporção fixa. Para ser real, o custo da OS precisa ser lançado separado em mão de obra, material e terceiros — ou derivado do catálogo de recursos.',
    };
  }

  private montarCustoPorOS(ordens: any[], janela: ReturnType<typeof this.janelaDeMeses>) {
    const soma = { corretiva: new Array(12).fill(0), preventiva: new Array(12).fill(0) };
    const qtd = { corretiva: new Array(12).fill(0), preventiva: new Array(12).fill(0) };

    for (const o of ordens) {
      if (!STATUS_CONCLUIDO.includes(o.status)) continue;
      const custo = this.numero(o.custo_real) + this.numero(o.custos_adicionais);
      if (!custo) continue;

      const i = this.indiceDoMes(o.data_hora_fim_real ?? o.criado_em, janela);
      if (i < 0) continue;

      const chave = o.tipo === 'CORRETIVA' ? 'corretiva' : 'preventiva';
      soma[chave][i] += custo;
      qtd[chave][i] += 1;
    }

    const media = (s: number[], q: number[]) => s.map((v, i) => (q[i] > 0 ? Math.round(v / q[i]) : 0));
    const comCusto = ordens.filter(
      (o) => STATUS_CONCLUIDO.includes(o.status) && this.numero(o.custo_real) > 0,
    ).length;

    return {
      corretiva: media(soma.corretiva, qtd.corretiva),
      preventiva: media(soma.preventiva, qtd.preventiva),
      base: comCusto,
      pendencia:
        comCusto === 0 ? 'Nenhuma OS concluída tem custo real lançado.' : undefined,
    };
  }

  /**
   * Manutenção vs. serviços. Não existe campo `finalidade` — a separação abaixo
   * usa o tipo da OS como aproximação: visita técnica e inspeção contam como
   * serviço, o resto como manutenção. É uma leitura defensável, mas é derivada,
   * não declarada.
   */
  private montarFinalidade(ordens: any[], janela: ReturnType<typeof this.janelaDeMeses>) {
    const manutencao = new Array(12).fill(0);
    const servicos = new Array(12).fill(0);

    for (const o of ordens) {
      const i = this.indiceDoMes(o.criado_em, janela);
      if (i < 0) continue;
      if (o.tipo === 'VISITA_TECNICA' || o.tipo === 'INSPECAO') servicos[i] += 1;
      else manutencao[i] += 1;
    }

    return {
      manutencao,
      servicos,
      simulado: true,
      pendencia:
        'Derivado do tipo da OS. Para ser real, a OS precisa de um campo próprio de finalidade (manutenção ou serviço).',
    };
  }

  /**
   * Anomalias por coorte de REGISTRO — cada barra é o mês em que a anomalia
   * nasceu, dividida entre resolvida, com OS em execução e sem OS. Empilhar por
   * evento do mês (abertas vs. fechadas) faria a soma perder o sentido em mês
   * de mutirão.
   */
  private montarAnomalias(anomalias: any[], janela: ReturnType<typeof this.janelaDeMeses>) {
    const resolvida = new Array(12).fill(0);
    const emExecucao = new Array(12).fill(0);
    const semOS = new Array(12).fill(0);

    let viraramOS = 0;
    let concluidas = 0;
    const diasAteOS: number[] = [];
    const diasExecucao: number[] = [];

    for (const a of anomalias) {
      const i = this.indiceDoMes(a.created_at, janela);
      const os = a.ordens_servico ?? [];
      const temOS = os.length > 0;
      const osFechada = os.find((o: any) => STATUS_CONCLUIDO.includes(o.status));

      if (temOS) {
        viraramOS += 1;
        const primeira = os.reduce((mais: any, o: any) =>
          !mais || new Date(o.criado_em) < new Date(mais.criado_em) ? o : mais, null);
        if (primeira) {
          diasAteOS.push(
            (new Date(primeira.criado_em).getTime() - new Date(a.created_at).getTime()) / 864e5,
          );
        }
      }

      if (osFechada) {
        concluidas += 1;
        if (osFechada.data_hora_fim_real) {
          diasExecucao.push(
            (new Date(osFechada.data_hora_fim_real).getTime() -
              new Date(osFechada.criado_em).getTime()) / 864e5,
          );
        }
      }

      if (i < 0) continue;
      if (osFechada) resolvida[i] += 1;
      else if (temOS) emExecucao[i] += 1;
      else semOS[i] += 1;
    }

    const media = (v: number[]) => (v.length ? v.reduce((s, n) => s + n, 0) / v.length : 0);
    const ateOS = media(diasAteOS);
    const execucao = media(diasExecucao);

    return {
      identificadas: anomalias.length,
      viraramOS,
      concluidas,
      cicloAteOS: Math.round(ateOS * 10) / 10,
      cicloExecucao: Math.round(execucao * 10) / 10,
      cicloTotal: Math.round((ateOS + execucao) * 10) / 10,
      metaCiclo: 10,
      resolvida,
      emExecucao,
      semOS,
    };
  }

  private montarBacklog(emAberto: any[]) {
    const faixas = [
      { faixa: '0 a 7 d', ate: 7, qtd: 0 },
      { faixa: '8 a 15 d', ate: 15, qtd: 0 },
      { faixa: '16 a 30 d', ate: 30, qtd: 0 },
      { faixa: '31 a 60 d', ate: 60, qtd: 0 },
      { faixa: '+60 d', ate: Infinity, qtd: 0 },
    ];

    const agora = Date.now();
    for (const o of emAberto) {
      const dias = (agora - new Date(o.criado_em).getTime()) / 864e5;
      const faixa = faixas.find((f) => dias <= f.ate) ?? faixas[faixas.length - 1];
      faixa.qtd += 1;
    }

    return faixas.map(({ faixa, qtd }) => ({ faixa, qtd }));
  }

  private montarOfensores(ordens: any[]) {
    const porEquipamento = new Map<string, { ativo: string; custo: number }>();

    for (const o of ordens) {
      const custo = this.numero(o.custo_real) + this.numero(o.custos_adicionais);
      if (!custo || !o.equipamento_id) continue;

      const chave = o.equipamento_id.trim();
      const atual = porEquipamento.get(chave) ?? { ativo: o.equipamento?.nome ?? 'Sem nome', custo: 0 };
      atual.custo += custo;
      porEquipamento.set(chave, atual);
    }

    return [...porEquipamento.values()]
      .sort((a, b) => b.custo - a.custo)
      .slice(0, 5)
      .map((e) => ({ ativo: e.ativo, custoMil: Math.round(e.custo / 100) / 10 }));
  }

  /**
   * Produtividade. O prazo por equipe não sai: `time_equipe` está vazio em
   * todas as OS. O HH sai de verdade — planejado é `tempo_estimado`, apontado é
   * a duração real entre início e fim.
   */
  private montarProdutividade(ordens: any[], concluidas: any[], janela: ReturnType<typeof this.janelaDeMeses>) {
    const porEquipe = new Map<string, { total: number; noPrazo: number }>();

    for (const o of concluidas) {
      const equipe = o.time_equipe?.trim();
      if (!equipe) continue;

      const atual = porEquipe.get(equipe) ?? { total: 0, noPrazo: 0 };
      atual.total += 1;
      if (
        o.data_hora_fim_real &&
        o.data_hora_programada &&
        new Date(o.data_hora_fim_real) <= new Date(o.data_hora_programada)
      ) {
        atual.noPrazo += 1;
      }
      porEquipe.set(equipe, atual);
    }

    const planejado = new Array(12).fill(0);
    const apontado = new Array(12).fill(0);

    for (const o of ordens) {
      const i = this.indiceDoMes(o.criado_em, janela);
      if (i < 0) continue;
      planejado[i] += this.numero(o.tempo_estimado);
      if (o.data_hora_inicio_real && o.data_hora_fim_real) {
        apontado[i] +=
          (new Date(o.data_hora_fim_real).getTime() - new Date(o.data_hora_inicio_real).getTime()) / 36e5;
      }
    }

    return {
      prazoPorEquipe: [...porEquipe.entries()].map(([equipe, v]) => ({
        equipe,
        pct: this.pct(v.noPrazo, v.total),
      })),
      metaPrazo: 90,
      prazoPendencia:
        porEquipe.size === 0
          ? 'Nenhuma OS tem equipe registrada. Preencher o time responsável na OS habilita este bloco.'
          : undefined,
      hh: {
        planejado: planejado.map((v) => Math.round(v)),
        apontado: apontado.map((v) => Math.round(v)),
      },
    };
  }

  private montarAlertas(ordens: any[], concluidas: any[], anomalias: any[]): Indicador[] {
    const travadas = ordens.filter((o) => o.status === 'PAUSADA').length;

    // Reincidência: equipamento com mais de uma anomalia em 90 dias.
    const porEquipamento = new Map<string, Date[]>();
    for (const a of anomalias) {
      if (!a.equipamento_id) continue;
      const chave = a.equipamento_id.trim();
      porEquipamento.set(chave, [...(porEquipamento.get(chave) ?? []), new Date(a.created_at)]);
    }

    let reincidentes = 0;
    for (const datas of porEquipamento.values()) {
      const ordenadas = datas.sort((a, b) => a.getTime() - b.getTime());
      for (let i = 1; i < ordenadas.length; i++) {
        if ((ordenadas[i].getTime() - ordenadas[i - 1].getTime()) / 864e5 <= 90) {
          reincidentes += 1;
          break;
        }
      }
    }

    const hhPlanejado = ordens.reduce((s, o) => s + this.numero(o.tempo_estimado), 0);
    const hhReal = ordens.reduce((s, o) => {
      if (!o.data_hora_inicio_real || !o.data_hora_fim_real) return s;
      return s + (new Date(o.data_hora_fim_real).getTime() - new Date(o.data_hora_inicio_real).getTime()) / 36e5;
    }, 0);
    const aderenciaHH = this.pct(hhReal, hhPlanejado);

    return [
      {
        id: 'retrabalho',
        icone: 'rotate',
        rotulo: 'Retrabalho',
        valor: '—',
        nota: 'sem registro de reabertura',
        status: null,
        simulado: true,
        pendencia: 'Exige marcar a OS reaberta e o vínculo com a original.',
      },
      {
        id: 'reincidencia',
        icone: 'repeat',
        rotulo: 'Reincidência',
        valor: String(reincidentes),
        nota: 'equipamentos com anomalia repetida em 90 d',
        status: reincidentes > 0 ? 'warn' : null,
      },
      {
        id: 'travadas',
        icone: 'package-off',
        rotulo: 'OS pausada',
        valor: String(travadas),
        nota: 'motivo da pausa não é classificado',
        status: travadas > 0 ? 'warn' : null,
        pendencia: 'Para separar "travada por material", a pausa precisa de motivo.',
      },
      {
        id: 'parada',
        icone: 'pause',
        rotulo: 'Parada não programada',
        valor: '—',
        unidade: 'h',
        nota: 'sem apontamento de parada',
        status: null,
        simulado: true,
        pendencia: 'Exige registro de parada de equipamento com e sem programação.',
      },
      {
        id: 'aderencia_hh',
        icone: 'checklist',
        rotulo: 'Aderência HH',
        valor: hhPlanejado > 0 ? `${aderenciaHH}%` : '—',
        nota: 'duração real sobre tempo estimado',
        status: hhPlanejado > 0 && (aderenciaHH < 90 || aderenciaHH > 110) ? 'warn' : null,
      },
    ];
  }
}
