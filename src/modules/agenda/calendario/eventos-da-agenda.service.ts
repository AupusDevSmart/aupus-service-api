import { BadRequestException, Injectable } from '@nestjs/common';
import type { TipoOS } from '@prisma/client';
import { PermissionScopeService, Prisma, PrismaService, type ScopedUser } from '@/core';
import { instalacoesDasOrdens, instalacoesDasProgramacoes } from '../../../common/helpers/instalacao-da-os';
import { equipamentoEComponentes, ordemDoEquipamento, programacaoDoEquipamento, programacaoNaData } from '../../../common/helpers/filtros-da-os';
import { dataDaProgramacao } from '../../tarefas/ciclos-das-tarefas';
import { variantesDeIds } from '../../tarefas/ids';
import { PrevisaoDaAgendaService, type CicloPrevisto } from '../previsao/previsao-da-agenda.service';

/**
 * O que o calendário pinta: `previsto` (o gerador ainda vai criar), `atrasado`
 * (venceu e não foi feito), `programado` (programação ou OS a fazer),
 * `em_execucao`, `feito` (executada, auditada ou finalizada) e `nao_sai` (o
 * gerador não consegue programar; o motivo vem junto).
 */
export type SituacaoDoEvento = 'previsto' | 'atrasado' | 'programado' | 'em_execucao' | 'feito' | 'nao_sai';

export interface EventoDaAgenda {
  /** Único no calendário: `os:<id>`, `programacao:<id>`, `previsao:<tarefa>:<ciclo>`. */
  id: string;
  origem: 'os' | 'programacao' | 'previsao';
  data: Date;
  titulo: string;
  descricao: string | null;
  situacao: SituacaoDoEvento;
  /** Por que não sai (só `nao_sai`). */
  motivo: string | null;
  /** O status do registro (StatusOS, StatusProgramacaoOS) ou a situação da previsão. */
  status: string;
  tipo: string;
  prioridade: string | null;
  planta_id: string | null;
  planta_nome: string | null;
  instalacoes: string[];
  /** Caminho na tela que abre o registro; a previsão não tem página. */
  link: string | null;
  /** Só na previsão: a tarefa e quando o gerador a programa. */
  previsao: {
    tarefa_tag: string;
    tarefa_nome: string;
    frequencia: string | null;
    equipamento_nome: string;
    /** O dia em que o ciclo vence; a `data` do evento é para quando sai (o próximo dia útil). */
    ciclo: Date;
    programacao_a_partir_de: Date | null;
    /** A data é estimada (o gerador agrupa por instalação e a pessoa pode remarcar). */
    data_estimada: boolean;
  } | null;
}

export interface CalendarioDaAgenda {
  eventos: EventoDaAgenda[];
  /** O que venceu antes do período e continua por fazer: a tela avisa, não some com eles. */
  atrasados_antes: number;
  /** Programações a aprovar e OS abertas sem data nenhuma: não cabem num dia, mas existem. */
  sem_data: number;
  opcoes: { plantas: { id: string; nome: string }[] };
}

export interface FiltroDaAgenda {
  inicio: Date;
  fim: Date;
  plantaId?: string;
  equipamentoId?: string;
  tipo?: TipoOS;
}

/** Quem pede: as permissões vêm no usuário da requisição, como o guard as lê. */
export type UsuarioDaAgenda = ScopedUser & { permissions?: string[] };

/** Mais que isto não cabe num calendário: recusa (estreitar o período ou filtrar), em vez de cortar calado. */
const MAXIMO_DE_REGISTROS = 2_000;

/**
 * A previsão escolhe pelo ciclo, mas o evento vai para o próximo dia útil: o
 * ciclo de sábado é desenhado na segunda. Sem pedir a previsão um pouco antes,
 * o ciclo do fim de semana na borda caía fora das duas semanas. Quinze dias
 * cobrem fim de semana com feriados e a planta que só trabalha um dia na semana.
 */
const RECUO_DA_PREVISAO_MS = 15 * 86_400_000;

/** OS que ainda pedem trabalho: a que não tem data entra na conta do "sem data". */
const OS_ABERTA = ['PENDENTE', 'EM_EXECUCAO', 'PAUSADA'] as const;

function seCouber<T>(lista: T[]): T[] {
  if (lista.length > MAXIMO_DE_REGISTROS) {
    throw new BadRequestException(`O período passa de ${MAXIMO_DE_REGISTROS} programações ou OS: estreite o período ou filtre`);
  }
  return lista;
}

const situacaoDaOS = (status: string, data: Date | null, agora: Date): SituacaoDoEvento => {
  if (status === 'EM_EXECUCAO' || status === 'PAUSADA') return 'em_execucao';
  if (status === 'EXECUTADA' || status === 'AUDITADA' || status === 'FINALIZADA') return 'feito';
  return data && data.getTime() < agora.getTime() ? 'atrasado' : 'programado';
};

const dentro = (data: Date, filtro: FiltroDaAgenda) => data.getTime() >= filtro.inicio.getTime() && data.getTime() <= filtro.fim.getTime();

/**
 * O calendário de manutenção (SN-52): programações a aprovar, OS (a fazer, em
 * execução, feitas) e a previsão do gerador (SN-51), num período, nas plantas
 * que a pessoa enxerga. O que já está programado aparece pelo registro de
 * verdade; da previsão entram o previsto, o atrasado e o que não sai.
 * Cancelado não entra. A OS só para quem vê OS e a programação só para quem
 * vê programação: a rota é de quem vê manutenção, e a permissão direta pode
 * dar uma sem as outras.
 */
@Injectable()
export class EventosDaAgendaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: PermissionScopeService,
    private readonly previsao: PrevisaoDaAgendaService,
  ) {}

  async listar(filtro: FiltroDaAgenda, user: UsuarioDaAgenda | undefined, agora: Date = new Date()): Promise<CalendarioDaAgenda> {
    const escopo = await this.escopo.getScope(user);
    // As plantas do filtro vêm daqui, do escopo: o filtro nunca oferece planta que os dados não teriam
    const opcoes = { plantas: await this.plantasDoEscopo(escopo) };
    const vazio: CalendarioDaAgenda = { eventos: [], atrasados_antes: 0, sem_data: 0, opcoes };
    const plantas = this.plantasPedidas(escopo, filtro.plantaId);
    if (plantas && plantas.length === 0) return vazio;
    const equipamentos = await equipamentoEComponentes(this.prisma, filtro.equipamentoId);
    if (equipamentos && equipamentos.length === 0) return vazio;

    // Sem usuário é chamada interna (e o teste): vê tudo
    const pode = (permissao: string) => !user || (user.permissions ?? []).includes(permissao);
    const veOS = pode('execucao_os.view');
    const veProgramacao = pode('programacao_os.view');
    const onde = { plantas, equipamentos };

    const [ordens, programacoes, prevista, pendentesAntes, semData] = await Promise.all([
      veOS ? this.ordens(filtro, onde).then(seCouber) : Promise.resolve([]),
      veProgramacao ? this.programacoes(filtro, onde).then(seCouber) : Promise.resolve([]),
      // A previsão é sempre preventiva
      !filtro.tipo || filtro.tipo === 'PREVENTIVA'
        ? this.previsao.prever(
            { inicio: new Date(filtro.inicio.getTime() - RECUO_DA_PREVISAO_MS), fim: filtro.fim, plantaId: filtro.plantaId, equipamentoId: filtro.equipamentoId },
            user,
            agora,
          )
        : Promise.resolve({ itens: [], atrasados_antes: 0 }),
      this.pendentesAntesDoPeriodo(filtro, onde, agora, { veOS, veProgramacao }),
      this.semData(filtro, onde, { veOS, veProgramacao }),
    ]);
    const [instalacoesDaOS, instalacoesDaProgramacao] = await Promise.all([
      instalacoesDasOrdens(this.prisma, ordens.map((o) => o.id)),
      instalacoesDasProgramacoes(this.prisma, programacoes.map((p) => p.id)),
    ]);
    const nomes = (lista?: { nome: string }[]) => (lista ?? []).map((i) => i.nome);

    // O que já está programado aparece pelo registro; o resto, pela data em que sai
    const daPrevisao = prevista.itens.filter((i) => i.situacao !== 'programado');
    const previstosAntes = daPrevisao.filter(
      (i) => i.data_programada.getTime() < filtro.inicio.getTime() && i.ciclo.getTime() < agora.getTime() && i.situacao !== 'previsto',
    ).length;

    const eventos: EventoDaAgenda[] = [
      ...ordens.map((o): EventoDaAgenda => ({
        id: `os:${o.id.trim()}`,
        origem: 'os',
        data: o.data_hora_programada!,
        titulo: `OS ${o.numero_os}`,
        descricao: o.descricao,
        situacao: situacaoDaOS(o.status, o.data_hora_programada, agora),
        motivo: null,
        status: o.status,
        tipo: o.tipo,
        prioridade: o.prioridade,
        planta_id: o.planta_id?.trim() ?? null,
        planta_nome: o.planta?.nome ?? null,
        instalacoes: nomes(instalacoesDaOS.get(o.id.trim())),
        link: `/execucao-os?execucaoId=${o.id.trim()}`,
        previsao: null,
      })),
      ...programacoes.map((p): EventoDaAgenda => {
        const data = dataDaProgramacao(p)!;
        return {
          id: `programacao:${p.id.trim()}`,
          origem: 'programacao',
          data,
          titulo: `Programação ${p.codigo}`,
          descricao: p.descricao,
          situacao: data.getTime() < agora.getTime() ? 'atrasado' : 'programado',
          motivo: null,
          status: p.status,
          tipo: p.tipo,
          prioridade: p.prioridade,
          planta_id: p.planta_id?.trim() ?? null,
          planta_nome: p.planta?.nome ?? null,
          instalacoes: nomes(instalacoesDaProgramacao.get(p.id.trim())),
          link: `/programacao-os?programacaoId=${p.id.trim()}`,
          previsao: null,
        };
      }),
      ...daPrevisao.filter((i) => dentro(i.data_programada, filtro)).map(eventoDaPrevisao),
    ].sort((a, b) => a.data.getTime() - b.data.getTime() || a.titulo.localeCompare(b.titulo));

    return { eventos, atrasados_antes: prevista.atrasados_antes + previstosAntes + pendentesAntes, sem_data: semData, opcoes };
  }

  /** OS e programações a fazer marcadas antes do período, que já passaram. */
  private async pendentesAntesDoPeriodo(
    filtro: FiltroDaAgenda,
    onde: { plantas: string[] | null; equipamentos: string[] | null },
    agora: Date,
    ve: { veOS: boolean; veProgramacao: boolean },
  ): Promise<number> {
    const antes = { lt: new Date(Math.min(filtro.inicio.getTime(), agora.getTime())) };
    const [ordens, programacoes] = await Promise.all([
      ve.veOS ? this.prisma.ordens_servico.count({ where: this.ondeDaOS(filtro, onde, { status: 'PENDENTE', data_hora_programada: antes }) }) : 0,
      ve.veProgramacao ? this.prisma.programacoes_os.count({ where: this.ondeDaProgramacao(filtro, onde, antes) }) : 0,
    ]);
    return ordens + programacoes;
  }

  /** Sem data nenhuma não cabe num dia: conta à parte, para não sumir. */
  private async semData(
    filtro: FiltroDaAgenda,
    onde: { plantas: string[] | null; equipamentos: string[] | null },
    ve: { veOS: boolean; veProgramacao: boolean },
  ): Promise<number> {
    const [ordens, programacoes] = await Promise.all([
      ve.veOS ? this.prisma.ordens_servico.count({ where: this.ondeDaOS(filtro, onde, { status: { in: [...OS_ABERTA] }, data_hora_programada: null }) }) : 0,
      ve.veProgramacao ? this.prisma.programacoes_os.count({ where: this.ondeDaProgramacao(filtro, onde, null) }) : 0,
    ]);
    return ordens + programacoes;
  }

  private plantasDoEscopo(escopo: string[] | null): Promise<{ id: string; nome: string }[]> {
    return this.prisma.plantas
      .findMany({
        where: { deleted_at: null, ...(this.escopo.isScoped(escopo) ? { id: { in: variantesDeIds(escopo) } } : {}) },
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
      })
      .then((lista) => lista.map((p) => ({ id: p.id.trim(), nome: p.nome })));
  }

  /** null = todas; [] = nenhuma (o filtro pediu uma planta fora do escopo). */
  private plantasPedidas(escopo: string[] | null, plantaId?: string): string[] | null {
    const pedida = plantaId?.trim();
    const doEscopo = this.escopo.isScoped(escopo) ? escopo.map((p) => p.trim()) : null;
    if (!pedida) return doEscopo;
    if (doEscopo && !doEscopo.includes(pedida)) return [];
    return [pedida];
  }

  /** Planta, tipo e equipamento (pela regra da instalação da OS: a tarefa congelada, a anomalia, a solicitação). */
  private ondeDaOS(
    filtro: FiltroDaAgenda,
    onde: { plantas: string[] | null; equipamentos: string[] | null },
    extra: Prisma.ordens_servicoWhereInput,
  ): Prisma.ordens_servicoWhereInput {
    return {
      deletado_em: null,
      ...(onde.plantas ? { planta_id: { in: variantesDeIds(onde.plantas) } } : {}),
      ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
      ...(onde.equipamentos ? ordemDoEquipamento(onde.equipamentos) : {}),
      ...extra,
    };
  }

  /**
   * Só as que esperam aprovação (a aprovada já tem OS, que é quem aparece), pela
   * data delas: a do gerador ou, sem ela, a do formulário. `null` = sem data nenhuma.
   */
  private ondeDaProgramacao(
    filtro: FiltroDaAgenda,
    onde: { plantas: string[] | null; equipamentos: string[] | null },
    quando: Prisma.DateTimeFilter | null,
  ): Prisma.programacoes_osWhereInput {
    return {
      deletado_em: null,
      status: 'PENDENTE',
      ...(onde.plantas ? { planta_id: { in: variantesDeIds(onde.plantas) } } : {}),
      ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
      // AND: a data e o equipamento são OR, e na mesma chave um apagaria o outro
      AND: [programacaoNaData(quando), ...(onde.equipamentos ? [programacaoDoEquipamento(onde.equipamentos)] : [])],
    };
  }

  private ordens(filtro: FiltroDaAgenda, onde: { plantas: string[] | null; equipamentos: string[] | null }) {
    return this.prisma.ordens_servico.findMany({
      where: this.ondeDaOS(filtro, onde, { status: { not: 'CANCELADA' }, data_hora_programada: { gte: filtro.inicio, lte: filtro.fim } }),
      orderBy: { data_hora_programada: 'asc' },
      take: MAXIMO_DE_REGISTROS + 1,
      select: {
        id: true, numero_os: true, descricao: true, status: true, tipo: true, prioridade: true,
        data_hora_programada: true, planta_id: true, planta: { select: { nome: true } },
      },
    });
  }

  private programacoes(filtro: FiltroDaAgenda, onde: { plantas: string[] | null; equipamentos: string[] | null }) {
    return this.prisma.programacoes_os.findMany({
      where: this.ondeDaProgramacao(filtro, onde, { gte: filtro.inicio, lte: filtro.fim }),
      take: MAXIMO_DE_REGISTROS + 1,
      select: {
        id: true, codigo: true, descricao: true, status: true, tipo: true, prioridade: true,
        data_hora_programada: true, data_previsao_inicio: true, planta_id: true, planta: { select: { nome: true } },
      },
    });
  }
}

function eventoDaPrevisao(i: CicloPrevisto): EventoDaAgenda {
  return {
    id: `previsao:${i.tarefa_id}:${i.ciclo.getTime()}`,
    origem: 'previsao',
    data: i.data_programada,
    titulo: i.tarefa_nome,
    descricao: i.equipamento_nome,
    situacao: i.situacao === 'atrasado' || i.situacao === 'nao_sai' ? i.situacao : 'previsto',
    motivo: i.motivo,
    status: i.situacao,
    tipo: 'PREVENTIVA',
    prioridade: null,
    planta_id: i.planta_id,
    planta_nome: i.planta_nome,
    instalacoes: i.unidade_nome ? [i.unidade_nome] : [],
    link: null,
    previsao: {
      tarefa_tag: i.tarefa_tag,
      tarefa_nome: i.tarefa_nome,
      frequencia: i.frequencia,
      equipamento_nome: i.equipamento_nome,
      ciclo: i.ciclo,
      programacao_a_partir_de: i.programacao_a_partir_de,
      data_estimada: i.data_programada_estimada,
    },
  };
}
