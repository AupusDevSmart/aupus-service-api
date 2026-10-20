// src/modules/dashboard/dashboard-manutencao.service.ts
import { Injectable, Logger } from '@nestjs/common';
import type { anomalias, ordens_servico } from '@prisma/client';
import { Prisma, PrismaService, PermissionScopeService, PlantaScope, ScopedUser } from '@/core';
import { ordemDasPlantas } from '../../common/helpers/filtros-da-os';
import type { QueryDashboardManutencaoDto } from './dto/query-dashboard-manutencao.dto';
import { calcularConfiabilidade, frotaDoRecorte, type Confiabilidade, type Frota } from './confiabilidade';
import { custosDasOrdens, montarCusto, montarCustoPorOS, type CustosDoPainel } from './custo-do-painel';
import { explicacoesDosGraficos } from './explicacoes-do-painel';
import {
  STATUS_CONCLUIDO,
  STATUS_EM_ABERTO,
  filtroDasAnomalias,
  filtroDe,
  fimDaOrdem,
  horasEstimadas,
  indiceDoMes,
  janelaDoPeriodo,
  naEstimativaPadrao,
  naJanela,
  ordensDoPainel,
  type JanelaDoPainel,
  type OrdemDoPainel,
} from './recorte-do-painel';

type UserCtx = ScopedUser | undefined;

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Como o painel reconhece a OS sem estimativa (SN-81) */
const TEXTO_DO_PADRAO =
  'Sem estimativa, a OS entra com o padrão do servidor (2 h de trabalho e 3 h de duração) ou com o do formulário antigo (4 e 6 h) e é contada à parte; a estimada de verdade nesses números também conta como sem estimativa.';

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
  /** Como o número sai, escrito para quem lê o painel (SN-80: a fórmula visível na tela) */
  formula?: string;
  /** Em quantos registros o número se baseia, e o que ficou de fora */
  base?: string;
}

/**
 * As OS do painel, cada grupo pela data que ele mede (SN-79). Antes tudo era
 * cortado pela criação: a OS concluída no mês mas criada antes não entrava no
 * custo do mês, e o backlog perdia a OS antiga ainda aberta.
 */
interface OrdensDoPeriodo {
  /** Abertas agora (backlog, atrasadas): não dependem do período */
  emAberto: OrdemDoPainel[];
  /** Concluídas no período, pela data de fim */
  concluidas: OrdemDoPainel[];
  /** Criadas no período (de onde veio a demanda, o tipo) */
  criadas: OrdemDoPainel[];
  /** Programadas para o período (a execução do plano) */
  programadas: OrdemDoPainel[];
}

/** OS vinculada a uma anomalia, como o `select` de `getDashboard` a lê. */
type OrdemDaAnomalia = Pick<ordens_servico, 'id' | 'status' | 'criado_em' | 'data_hora_fim_real'>;

/** Linha de anomalia como o `select` de `getDashboard` a lê. */
type AnomaliaDoPainel = Pick<anomalias, 'id' | 'created_at' | 'status' | 'equipamento_id'> & {
  ordens_servico: OrdemDaAnomalia[];
};

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

  private pct(parte: number, total: number): number {
    if (!total) return 0;
    return Math.round((parte / total) * 100);
  }

  /** Número com vírgula e ponto de milhar, sem depender do ICU do Node */
  private decimal(n: number, casas = 1): string {
    const [inteiro, fracao] = n.toFixed(casas).split('.');
    const comMilhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return fracao ? `${comMilhar},${fracao}` : comMilhar;
  }

  /** Uma série zerada, um valor por mês da janela */
  private serie(janela: JanelaDoPainel): number[] {
    return new Array(janela.meses.length).fill(0);
  }

  // ============================================================
  // ENTRADA
  // ============================================================

  async getDashboard(filtros: QueryDashboardManutencaoDto, user?: UserCtx) {
    const scope = await this.getScope(user);
    this.logger.log(
      `[dashboard-manutencao] user=${user?.id ?? 'anon'} scope=${scope === null ? 'GLOBAL' : JSON.stringify(scope)}`,
    );

    const janela = janelaDoPeriodo(filtros.periodo);

    // Uma leitura só das OS que entram em algum número: são dezenas, não
    // milhões, e agregar em memória evita uma dúzia de count() em série
    const ordens = await ordensDoPainel(this.prisma, scope, filtros, janela);

    const daAnomalia = filtroDasAnomalias(scope, filtros);
    // A OS cancelada ou excluída não fez a anomalia "virar OS"
    const osValida: Prisma.ordens_servicoWhereInput = { deletado_em: null, status: { not: 'CANCELADA' } };
    const anomalias = await this.prisma.anomalias.findMany({
      where: { AND: [daAnomalia, { created_at: { gte: janela.desde, lt: janela.ate } }] },
      select: {
        id: true,
        created_at: true,
        status: true,
        equipamento_id: true,
        ordens_servico: {
          where: osValida,
          select: { id: true, status: true, criado_em: true, data_hora_fim_real: true },
        },
      },
    });

    // As abertas são de agora, como o backlog: a registrada há 40 dias sumia do card no "mês"
    const abertas: Prisma.anomaliasWhereInput = { AND: [daAnomalia, { status: { not: 'FINALIZADA' } }] };
    const [anomaliasAbertas, anomaliasSemOS, frota, custos] = await Promise.all([
      this.prisma.anomalias.count({ where: abertas }),
      this.prisma.anomalias.count({ where: { AND: [abertas, { ordens_servico: { none: osValida } }] } }),
      frotaDoRecorte(this.prisma, scope, filtros, janela),
      // O custo por natureza, das linhas de material e de técnico (SN-81)
      custosDasOrdens(this.prisma, ordens.filter((o) => STATUS_CONCLUIDO.includes(o.status))),
    ]);

    return {
      atualizadoEm: new Date().toISOString(),
      meses: janela.meses.map((m) => m.rotulo),
      periodo: { desde: janela.desde.toISOString(), ate: janela.ate.toISOString() },
      opcoes: await this.montarOpcoes(scope, filtros),
      ...this.montarBlocos(ordens, anomalias, janela, { abertas: anomaliasAbertas, semOS: anomaliasSemOS }, frota, custos, Boolean(filtroDe(filtros.equipe))),
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
  private async montarOpcoes(scope: PlantaScope, filtros: QueryDashboardManutencaoDto) {
    const wherePlanta: Prisma.plantasWhereInput = { deleted_at: null };
    if (Array.isArray(scope)) {
      if (scope.length === 0) return { plantas: [], unidades: [], equipes: [] };
      wherePlanta.id = { in: scope };
    }

    const plantas = await this.prisma.plantas.findMany({
      where: wherePlanta,
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    });

    const plantaId = filtroDe(filtros.plantaId);
    const whereUnidade: Prisma.unidadesWhereInput = { deleted_at: null };
    // A planta pedida E o escopo: fora dele, a instalação "não existe" (SN-57) — os
    // nomes das instalações da planta de outro cliente vinham no combo
    if (plantaId) whereUnidade.AND = [{ planta_id: plantaId }, ...(Array.isArray(scope) ? [{ planta_id: { in: scope } }] : [])];
    else if (Array.isArray(scope)) whereUnidade.planta_id = { in: scope };

    const unidades = await this.prisma.unidades.findMany({
      where: whereUnidade,
      select: { id: true, nome: true, planta_id: true },
      orderBy: { nome: 'asc' },
      take: 300,
    });

    // Equipes saem das próprias OS: não existe cadastro de times no banco, e
    // `time_equipe` é texto livre. Sem linha preenchida, o combo não aparece.
    // Do escopo: as equipes das outras plantas não são de quem só vê as suas
    const equipes = await this.prisma.ordens_servico.findMany({
      where: { deletado_em: null, time_equipe: { not: null }, ...(Array.isArray(scope) && ordemDasPlantas(scope)) },
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
      // Aparadas e sem repetir: "Equipe X" e "Equipe X " são a mesma
      equipes: [...new Set(equipes.map((e) => e.time_equipe?.trim()).filter((e): e is string => !!e))].sort(),
    };
  }

  // ============================================================
  // AGREGAÇÕES
  // ============================================================

  private montarBlocos(
    ordens: OrdemDoPainel[],
    anomalias: AnomaliaDoPainel[],
    janela: JanelaDoPainel,
    anomaliasDeAgora: { abertas: number; semOS: number },
    frota: Frota,
    custos: CustosDoPainel,
    porEquipe: boolean,
  ) {
    const grupos: OrdensDoPeriodo = {
      emAberto: ordens.filter((o) => STATUS_EM_ABERTO.includes(o.status)),
      concluidas: ordens.filter((o) => STATUS_CONCLUIDO.includes(o.status) && naJanela(fimDaOrdem(o), janela)),
      criadas: ordens.filter((o) => naJanela(o.criado_em, janela)),
      // A cancelada não foi programada para acontecer (a mesma regra do calendário)
      programadas: ordens.filter((o) => o.status !== 'CANCELADA' && naJanela(o.data_hora_programada, janela)),
    };

    // As OS concluídas (de qualquer data: a parada pode estar no período e a OS ter terminado
    // depois): a base do MTBF, do MTTR e da disponibilidade
    const conf = calcularConfiabilidade(
      ordens
        .filter((o) => STATUS_CONCLUIDO.includes(o.status))
        .map((o) => ({ ...o, fim: fimDaOrdem(o), equipamentos: o.equipamentos.map((e) => e.id) })),
      frota,
      janela,
    );

    const aderencia = this.montarAderencia(grupos);
    // A fórmula e a base do custo e do HH saem da conta deles, mas vão na legenda com as outras
    const { formula: formulaDoCusto, base: baseDoCusto, ...custo } = montarCusto(grupos.concluidas, custos, janela);
    const custoPorOS = montarCustoPorOS(grupos.concluidas, custos, janela);
    const blocoDeAnomalias = this.montarAnomalias(anomalias, janela);
    const {
      hh: { formula: formulaDoHH, base: baseDoHH, ...hh },
      ...produtividade
    } = this.montarProdutividade(grupos, janela);

    return {
      kpis: this.montarKpis(grupos, anomaliasDeAgora, conf, porEquipe),
      ...aderencia,
      custo,
      custoPorOS,
      finalidade: this.montarFinalidade(grupos.criadas, janela),
      anomalias: blocoDeAnomalias,
      backlogIdade: this.montarBacklog(grupos.emAberto),
      ofensores: this.montarOfensores(grupos.concluidas, custos),
      ...produtividade,
      hh,
      alertas: this.montarAlertas(grupos, anomalias, conf),
      // A legenda das fórmulas: como cada gráfico sai (no ícone dele e em "Como se calcula")
      graficos: explicacoesDosGraficos({
        doPlano: aderencia.execucaoPlano.programadas,
        doPlanoConcluidas: aderencia.execucaoPlano.executadas,
        metaDoPlano: aderencia.execucaoPlano.meta,
        criadas: grupos.criadas.length,
        concluidasComCusto: custoPorOS.base,
        anomalias: blocoDeAnomalias,
        abertas: grupos.emAberto.length,
        concluidasComEquipe: grupos.concluidas.filter((o) => o.time_equipe?.trim()).length,
        metaPrazo: produtividade.metaPrazo,
        custo: { formula: formulaDoCusto, base: baseDoCusto },
        hh: { formula: formulaDoHH, base: baseDoHH },
      }),
    };
  }

  private montarKpis(
    { emAberto, concluidas, programadas }: OrdensDoPeriodo,
    anomalias: { abertas: number; semOS: number },
    conf: Confiabilidade,
    porEquipe: boolean,
  ): Indicador[] {
    // O plano do período: as OS do plano programadas para ele, e quantas delas já saíram
    const doPlano = programadas.filter((o) => o.origem === 'PLANO_MANUTENCAO' || o.origem === 'TAREFA');
    const planoConcluidas = doPlano.filter((o) => STATUS_CONCLUIDO.includes(o.status));

    const atrasadas = emAberto.filter(
      (o) => o.data_hora_programada && new Date(o.data_hora_programada) < new Date(),
    ).length;

    const noPrazo = concluidas.filter((o) => o.data_hora_programada && new Date(fimDaOrdem(o)!) <= new Date(o.data_hora_programada)).length;

    // Backlog em HH: em semanas exigiria a capacidade das equipes, que não é
    // cadastrada — pode ir gente de fora (decisão do usuário, 20/out/2026)
    const hhPendente = emAberto.reduce((soma, o) => soma + horasEstimadas(o), 0);
    // A OS gerada sem estimativa soma o padrão do servidor: contada à parte (SN-81)
    const noPadrao = emAberto.filter(naEstimativaPadrao).length;

    const baseDaFalha = `${plural(conf.corretivas, 'corretiva', 'corretivas')} no período: ${plural(conf.falhas, 'parou', 'pararam')} o equipamento (${conf.comHorario} com horário, ${conf.semHorario} sem), ${conf.semDadosDeFalha} sem os dados de falha. Frota: ${plural(conf.equipamentos, 'UC', 'UCs')}, ${this.decimal(conf.horasDaFrota, 0)} h no período.`;
    // A corretiva sem a resposta "parou?" (anterior ao SN-60): não se sabe se parou, e o
    // cartão não pode afirmar "nenhuma falha" nem 100% de disponibilidade
    const incompleto = conf.semDadosDeFalha > 0;
    const semDado = `${plural(conf.semDadosDeFalha, 'corretiva', 'corretivas')} sem dado de falha`;
    const naoSeSabe = conf.falhas === 0 && incompleto;
    // A frota não é por equipe: as falhas de uma equipe sobre a frota inteira inflavam o MTBF
    const semFrota = porEquipe ? 'não se calcula por equipe' : undefined;

    return [
      {
        id: 'os_planejada',
        icone: 'calendar-check',
        rotulo: 'OS planejada',
        valor: String(doPlano.length),
        nota: `${planoConcluidas.length} executadas`,
        status: null,
        formula: 'OS do plano de manutenção (e das tarefas) programadas para o período, sem as canceladas; "executadas" são as que já foram concluídas.',
      },
      {
        id: 'os_aberta',
        icone: 'folder-open',
        rotulo: 'OS aberta',
        valor: String(emAberto.length),
        nota: atrasadas > 0 ? `${atrasadas} atrasadas` : 'nenhuma atrasada',
        status: atrasadas > 0 ? 'bad' : 'ok',
        formula: 'OS pendentes, em execução ou pausadas agora, de qualquer data. Atrasada: programada para antes de agora.',
      },
      {
        id: 'os_concluida',
        icone: 'circle-check',
        rotulo: 'OS concluída',
        valor: String(concluidas.length),
        nota: concluidas.length > 0 ? `${this.pct(noPrazo, concluidas.length)}% no prazo` : 'sem conclusões',
        status: null,
        formula: 'OS executadas, auditadas ou finalizadas no período, pela data de fim (sem ela, a de início). No prazo: terminou até a data programada.',
      },
      {
        id: 'backlog',
        icone: 'stack',
        rotulo: 'Backlog',
        valor: this.decimal(hhPendente, 0),
        unidade: 'HH',
        nota: `${plural(emAberto.length, 'OS aberta', 'OS abertas')}${noPadrao > 0 ? ` · ${noPadrao} sem estimativa` : ''}`,
        status: noPadrao > 0 ? 'warn' : null,
        formula: `Soma da duração estimada (horas) das OS abertas agora, de qualquer data. A preventiva do plano leva a duração das instruções (a soma das sub-instruções); as demais, a que o planejador informou. ${TEXTO_DO_PADRAO} Sem semanas: a capacidade das equipes não é cadastrada (pode ir gente de fora).`,
        base: `${plural(emAberto.length, 'OS aberta', 'OS abertas')}: ${emAberto.length - noPadrao} com estimativa, ${noPadrao} sem (no padrão).`,
      },
      {
        id: 'anomalias',
        icone: 'alert-triangle',
        rotulo: 'Anomalias abertas',
        valor: String(anomalias.abertas),
        nota: `${anomalias.semOS} ainda sem OS`,
        status: anomalias.semOS > 0 ? 'warn' : null,
        formula: 'Anomalias não finalizadas agora, de qualquer data. Sem OS: nenhuma OS válida (a cancelada não conta).',
      },
      {
        id: 'mtbf',
        icone: 'activity',
        rotulo: 'MTBF',
        valor: semFrota ? '—' : conf.mtbf !== null ? this.decimal(conf.mtbf, conf.mtbf < 10 ? 1 : 0) : '—',
        unidade: 'h',
        nota: semFrota ?? (incompleto ? semDado : conf.falhas > 0 ? `${plural(conf.falhas, 'falha', 'falhas')} · ${conf.equipamentos} equip.` : 'nenhuma falha no período'),
        status: incompleto && !semFrota ? 'warn' : null,
        formula: 'Tempo médio entre falhas = (horas da frota no período − horas paradas) ÷ falhas. Falha: corretiva que parou o equipamento, no período em que parou. Frota: os UCs do filtro, cada um desde que foi cadastrado; calendário 24 h, até agora.',
        base: baseDaFalha,
      },
      {
        id: 'mttr',
        icone: 'clock',
        rotulo: 'MTTR',
        valor: conf.mttr !== null ? this.decimal(conf.mttr) : '—',
        unidade: 'h',
        nota:
          conf.comHorario > 0
            ? `base: ${plural(conf.comHorario, 'parada', 'paradas')}${conf.semHorario ? ` · ${conf.semHorario} sem horário` : ''}`
            : conf.semHorario > 0
              ? `${plural(conf.semHorario, 'parada', 'paradas')} sem horário`
              : incompleto
                ? semDado
                : 'nenhuma parada no período',
        status: incompleto ? 'warn' : null,
        formula: 'Tempo médio para reparar = média de (fim − início da parada) das corretivas que pararam com o horário informado. A parada sem horário conta como falha, mas não tem duração.',
        base: baseDaFalha,
      },
      {
        id: 'disponibilidade',
        icone: 'plug',
        rotulo: 'Disponibilidade',
        // Truncada, nunca arredondada para cima: com uma frota grande, 99,996% virava "100,0"
        valor: semFrota || naoSeSabe || conf.disponibilidade === null ? '—' : this.decimal(Math.floor(conf.disponibilidade * 10_000) / 100, 2),
        unidade: semFrota || naoSeSabe || conf.disponibilidade === null ? undefined : '%',
        nota:
          semFrota ??
          (conf.equipamentos === 0
            ? 'nenhum equipamento no filtro'
            : naoSeSabe || incompleto
              ? semDado
              : conf.semHorario > 0
                ? `${plural(conf.semHorario, 'parada', 'paradas')} sem horário (não descontada${conf.semHorario > 1 ? 's' : ''})`
                : `${this.decimal(conf.horasParadas, conf.horasParadas < 10 ? 1 : 0)} h paradas · ${conf.equipamentos} equip.`),
        status: incompleto && !semFrota ? 'warn' : null,
        formula: '(horas da frota no período − horas paradas) ÷ horas da frota. Horas paradas: as de toda OS concluída com parada (a preventiva que parou também tira de operação), só a parte dentro do período e sem contar duas vezes a mesma hora do mesmo equipamento; a parada sem horário não desconta. Calendário 24 h, até agora.',
        base: baseDaFalha,
      },
    ];
  }

  /** De onde veio a demanda do período (as criadas nele) e quanto do plano programado saiu. */
  private montarAderencia({ criadas: ordens, programadas }: OrdensDoPeriodo) {
    const doPlano = programadas.filter((o) => o.origem === 'PLANO_MANUTENCAO' || o.origem === 'TAREFA');
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
   * Manutenção vs. serviços. Não existe campo `finalidade` — a separação abaixo
   * usa o tipo da OS como aproximação: visita técnica e inspeção contam como
   * serviço, o resto como manutenção. É uma leitura defensável, mas é derivada,
   * não declarada.
   */
  private montarFinalidade(ordens: OrdemDoPainel[], janela: JanelaDoPainel) {
    const manutencao = this.serie(janela);
    const servicos = this.serie(janela);

    for (const o of ordens) {
      const i = indiceDoMes(o.criado_em, janela);
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
  private montarAnomalias(anomalias: AnomaliaDoPainel[], janela: JanelaDoPainel) {
    const resolvida = this.serie(janela);
    const emExecucao = this.serie(janela);
    const semOS = this.serie(janela);

    let viraramOS = 0;
    let concluidas = 0;
    const diasAteOS: number[] = [];
    const diasExecucao: number[] = [];

    for (const a of anomalias) {
      const i = indiceDoMes(a.created_at, janela);
      const os = a.ordens_servico ?? [];
      const temOS = os.length > 0;
      const osFechada = os.find((o) => STATUS_CONCLUIDO.includes(o.status));

      if (temOS) {
        viraramOS += 1;
        const primeira = os.reduce<OrdemDaAnomalia | null>((mais, o) =>
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

  private montarBacklog(emAberto: OrdemDoPainel[]) {
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

  /**
   * Os equipamentos que mais custaram no período, pelo equipamento DA OS
   * (tarefa, anomalia, solicitação ou coluna). Só pela coluna, o bloco saía
   * vazio: ela quase nunca vem (no dev, as 4 OS com custo a tinham nula). A OS
   * de mais de um equipamento divide o custo em partes iguais entre eles.
   */
  private montarOfensores(ordens: OrdemDoPainel[], custos: CustosDoPainel) {
    const porEquipamento = new Map<string, { ativo: string; custo: number }>();

    for (const o of ordens) {
      // O mesmo custo do gráfico de custo: pelas linhas, mais os adicionais
      const custo = custos.get(o.id)?.total ?? 0;
      if (!custo || o.equipamentos.length === 0) continue;

      const parte = custo / o.equipamentos.length;
      for (const e of o.equipamentos) {
        const atual = porEquipamento.get(e.id) ?? { ativo: e.nome || 'Sem nome', custo: 0 };
        atual.custo += parte;
        porEquipamento.set(e.id, atual);
      }
    }

    return [...porEquipamento.values()]
      .sort((a, b) => b.custo - a.custo)
      .slice(0, 5)
      .map((e) => ({ ativo: e.ativo, custoMil: Math.round(e.custo / 100) / 10 }));
  }

  /**
   * Produtividade. O prazo por equipe não sai: `time_equipe` está vazio em
   * todas as OS. O HH sai de verdade — planejado é a duração estimada,
   * apontado é a duração real entre início e fim.
   */
  private montarProdutividade({ concluidas, programadas }: OrdensDoPeriodo, janela: JanelaDoPainel) {
    const porEquipe = new Map<string, { total: number; noPrazo: number }>();

    for (const o of concluidas) {
      const equipe = o.time_equipe?.trim();
      if (!equipe) continue;

      const atual = porEquipe.get(equipe) ?? { total: 0, noPrazo: 0 };
      atual.total += 1;
      if (o.data_hora_programada && new Date(fimDaOrdem(o)!) <= new Date(o.data_hora_programada)) {
        atual.noPrazo += 1;
      }
      porEquipe.set(equipe, atual);
    }

    // Planejado no mês para o qual a OS foi programada; apontado no mês em que terminou
    const planejado = this.serie(janela);
    const apontado = this.serie(janela);

    let planejadasNoPadrao = 0;
    for (const o of programadas) {
      const i = indiceDoMes(o.data_hora_programada, janela);
      if (i < 0) continue;
      planejado[i] += horasEstimadas(o);
      if (naEstimativaPadrao(o)) planejadasNoPadrao += 1;
    }
    for (const o of concluidas) {
      const i = indiceDoMes(fimDaOrdem(o), janela);
      if (i >= 0 && o.data_hora_inicio_real && o.data_hora_fim_real) {
        apontado[i] += (new Date(o.data_hora_fim_real).getTime() - new Date(o.data_hora_inicio_real).getTime()) / 36e5;
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
        formula: `Planejado: a duração estimada das OS programadas para cada mês (sem as canceladas). Apontado: fim − início das OS concluídas no mês em que terminaram. ${TEXTO_DO_PADRAO}`,
        // O planejado soma também o padrão: dizer quanto dele ninguém estimou
        base: `${plural(programadas.length, 'OS programada', 'OS programadas')} no período, ${planejadasNoPadrao} sem estimativa (no padrão).`,
      },
    };
  }

  private montarAlertas({ emAberto, concluidas }: OrdensDoPeriodo, anomalias: AnomaliaDoPainel[], conf: Confiabilidade): Indicador[] {
    const travadas = emAberto.filter((o) => o.status === 'PAUSADA').length;

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

    // Das concluídas no período: o estimado contra a duração real delas. Sem as
    // que ficaram no padrão: ninguém estimou, e a razão não diria nada (SN-81)
    const estimadas = concluidas.filter((o) => !naEstimativaPadrao(o));
    const hhPlanejado = estimadas.reduce((s, o) => s + horasEstimadas(o), 0);
    const hhReal = estimadas.reduce((s, o) => {
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
        // Sem nenhuma parada com horário o valor é desconhecido, não zero
        valor: conf.comHorario > 0 ? this.decimal(conf.horasParadasNaoProgramadas) : '—',
        unidade: 'h',
        nota: conf.falhas > 0 ? `${conf.falhas} parada${conf.falhas > 1 ? 's' : ''}${conf.semHorario ? ` · ${conf.semHorario} sem horário` : ''}` : 'nenhuma parada no período',
        status: conf.falhas > 0 ? 'warn' : null,
        formula: 'Horas paradas das corretivas que pararam o equipamento (fim − início da parada, a parte dentro do período, sem contar duas vezes a mesma hora). A parada sem horário conta na quantidade, sem horas.',
      },
      {
        id: 'aderencia_hh',
        icone: 'checklist',
        rotulo: 'Aderência HH',
        valor: hhPlanejado > 0 ? `${aderenciaHH}%` : '—',
        nota: 'duração real sobre a estimada',
        formula: 'Duração real (fim − início) sobre a duração estimada, das OS concluídas no período que têm estimativa (as que ficaram no padrão do servidor não entram).',
        status: hhPlanejado > 0 && (aderenciaHH < 90 || aderenciaHH > 110) ? 'warn' : null,
      },
    ];
  }
}
