import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { equipamentoEComponentes, ordemDasPlantas, ordemDoEquipamento, periodoDoFiltro } from '../../common/helpers/filtros-da-os';
import { PrismaService, PermissionScopeService, ScopedUser } from '@/core';
import {
  OSFiltersDto,
  IniciarExecucaoDto,
  PausarExecucaoDto,
  RetomarExecucaoDto,
  AtualizarChecklistDto,
  RegistrarMateriaisDto,
  RegistrarFerramentasDto,
  RegistrarOutrosCustosDto,
  ConcluirTarefaDto,
  CancelarTarefaDto,
  ExecutarOSDto,
  AuditarOSDto,
  ReabrirOSDto,
  FinalizarOSDto,
  CancelarOSDto,
  OrdemServicoResponseDto,
  OrdemServicoDetalhesResponseDto,
  ListarOSResponseDto,
  OSStatsDto,
} from './dto';
import {
  StatusOS,
  PrioridadeOS,
  Prisma,
  type anomalias,
  type equipamentos,
  type ferramentas_os,
  type materiais_os,
  type ordens_servico,
  type planos_manutencao,
  type plantas,
  type programacoes_os,
  type reserva_veiculo,
  type tarefas_os,
  type tecnicos_os,
  type historico_os,
  type veiculo,
} from '@/core';
import { gerarNumeroOS } from '../../common/helpers/numeracao-os';
import { Instalacao, instalacoesDasOrdens } from '../../common/helpers/instalacao-da-os';
import { finalizarOrigem, origemDaProgramacao } from '../../common/helpers/status-da-origem';
import { cancelarOS } from './cancelar-os';
import { exigirOSAlteravel, travarOSAlteravel } from './os-alteravel';
import { dadosDaOS, dadosDeFalha, equipamentoDaCorretiva, minutosParado, mudancasNaFalha } from './dados-de-falha';
import { MARCOS_DO_TEMPO, gravacaoDasHoras, horasDaEquipe, minutosEfetivos } from './horas-da-execucao';
import { reais } from './custo-da-os';
import { congelarValoresDasInstrucoes, custoRealDaOS, dadosDoCustoDaOS } from './dados-do-custo';
import { SELECAO_DA_TAREFA, instrucoesDasLinhas, tarefasDasLinhas } from './tarefas-das-linhas';
import { gravarOutrosCustos } from './outros-custos';
import { semDinheiro, veOsCustos } from './quem-ve-os-custos';
import { naturezaDoItem } from './natureza-do-custo';
import { comOCustoRegistrado, resumoDoCusto } from './resumo-do-custo';
import { conferirCodigo, gravarCodigoDeVerificacao, relatorioDaOS, semOsCustos, somasDosAnexosSemSoma, type ConferenciaDoCodigo, type RelatorioDaOS } from './verificacao-da-os';
import { pessoasQuePodemAtuar } from '@/modules/programacao-os/pessoas-da-os';
import type { PessoasDaOS } from './horas-da-execucao';
import { fotosDosItens, gravacoesDoChecklist, leituraDoItem, pendenciaDaTarefa, travarItensDoChecklist, travarTarefa } from './itens-do-checklist';
import { anexoParaResposta } from './anexos-os.service';
import { variantesDeId, variantesDeIds } from '../tarefas/ids';
import { devolverViatura } from '../reservas/ocupacao-da-viatura';
import type { Evento } from '../notificacoes/catalogo';
import { registrarNotificacao } from '../notificacoes/registrar-notificacao';
import { vinculoDaOS } from '../programacao-os/instrucoes-da-programacao';
import { idsDasAtrasadas } from './os-atrasadas';

/**
 * Nome da tarefa dentro de uma OS, sem depender da tarefa viva.
 *
 * `tarefas_os.tarefa` é relação OPCIONAL e volta null em dois casos que
 * acontecem de verdade: a cópia do plano foi apagada (trocar o plano do
 * equipamento apaga as cópias) ou o id da tarefa tem 25 chars e não casa com o
 * `Char(26)` do FK, que é blank-padded no Postgres. Sem guarda, concluir ou
 * cancelar uma tarefa dentro da OS estourava 500.
 *
 * O snapshot vem primeiro de propósito: é o que foi pedido na época, e é para
 * isso que o congelamento existe.
 */
const nomeDaTarefa = (vinculo: VinculoComNome | null | undefined): string =>
  vinculo?.nome_snapshot || vinculo?.instrucao_nome || vinculo?.tarefa?.nome || 'tarefa sem nome';

/** O que `nomeDaTarefa` lê do vínculo da tarefa na OS */
type VinculoComNome = Pick<tarefas_os, 'nome_snapshot' | 'instrucao_nome'> & { tarefa?: { nome: string } | null };

/** O usuário da requisição: o controller passa o `user` do JWT, com as permissões */
type UsuarioDaOS = ScopedUser & { permissions?: string[] };

/**
 * Quem gerencia a OS (SN-93): define o valor da hora de quem entrou na execução e
 * corrige os outros custos da OS auditada — custo que o técnico não decide sozinho
 */
const gerenciaAOS = (user?: UsuarioDaOS) => !!user?.permissions?.includes('execucao_os.manage');

/** A reserva da OS como as consultas deste service a trazem: com o resumo da viatura */
type ReservaDaOS = reserva_veiculo & { veiculo: Pick<veiculo, 'id' | 'placa' | 'modelo' | 'marca'> };

/**
 * A OS como `mapearParaResponse` a lê. A listagem e o detalhe incluem relações
 * diferentes; o tipo é o que as duas têm em comum.
 */
type OSParaResposta = Omit<ordens_servico, 'conteudo_finalizado'> & {
  tarefas_os?: Array<
    tarefas_os & {
      tarefa?: {
        id: string;
        nome: string;
        instrucao_id?: string | null;
        plano_manutencao?: { id: string; nome: string } | null;
      } | null;
      /** A instrução da linha pela regra do valor (o código congelado primeiro), no detalhe */
      instrucao_da_linha?: string | null;
    }
  >;
  materiais?: materiais_os[];
  ferramentas?: ferramentas_os[];
  tecnicos?: tecnicos_os[];
  programacao?: Pick<programacoes_os, 'id' | 'codigo' | 'descricao'> | null;
  anomalia?: Pick<anomalias, 'id' | 'descricao' | 'prioridade' | 'status'> | null;
  plano_manutencao?: Pick<planos_manutencao, 'id' | 'nome' | 'descricao'> | null;
  planta?: Pick<plantas, 'id' | 'nome'> | null;
  equipamento?: Pick<equipamentos, 'id' | 'nome' | 'tipo_equipamento' | 'fabricante' | 'modelo'> | null;
  reserva_veiculo?: ReservaDaOS | null;
  historico?: Pick<historico_os, 'acao' | 'data'>[];
};

/** A OS com tudo o que `buscarPorId` inclui */
type OSComDetalhes = Prisma.ordens_servicoGetPayload<{
  omit: { conteudo_finalizado: true };
  include: {
    programacao: {
      include: {
        solicitacao_servico: {
          select: {
            id: true;
            numero: true;
            titulo: true;
            descricao: true;
            tipo: true;
            prioridade: true;
            status: true;
            local: true;
            solicitante_nome: true;
            data_solicitacao: true;
          };
        };
      };
    };
    anomalia: {
      select: {
        id: true;
        descricao: true;
        data: true;
        prioridade: true;
        status: true;
        local: true;
        ativo: true;
        condicao: true;
        origem: true;
        observacoes: true;
        created_at: true;
        updated_at: true;
      };
    };
    plano_manutencao: { select: { id: true; nome: true; descricao: true } };
    planta: { select: { id: true; nome: true } };
    equipamento: { select: { id: true; nome: true; tipo_equipamento: true; fabricante: true; modelo: true } };
    tarefas_os: {
      include: {
        tarefa: {
          select: { id: true; nome: true; instrucao_id: true; plano_manutencao: { select: { id: true; nome: true } } };
        };
      };
    };
    materiais: true;
    ferramentas: true;
    tecnicos: true;
    itens_orcamento: true;
    checklist_atividades: true;
    anexos: true;
    registros_tempo: true;
    historico: true;
    reserva_veiculo: { include: { veiculo: { select: { id: true; placa: true; modelo: true; marca: true } } } };
  };
}>;

/** A ação do histórico que é mudança de status da OS e o evento que ela avisa (SN-47). */
const EVENTO_DA_ACAO_DA_OS: Partial<Record<string, Evento>> = {
  INICIO_EXECUCAO: 'os.iniciada',
  PAUSA: 'os.pausada',
  RETOMADA: 'os.retomada',
  EXECUCAO: 'os.executada',
  AUDITORIA: 'os.auditada',
  REABERTURA: 'os.reaberta',
  FINALIZACAO: 'os.finalizada',
};

@Injectable()
export class ExecucaoOSService {
  private readonly logger = new Logger(ExecucaoOSService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: PermissionScopeService,
  ) {}

  /**
   * Fragmento `where` do escopo de plantas: a planta da OS e, na OS antiga sem
   * planta (SN-33), o equipamento (o componente pela unidade do UC pai), como a
   * programação já fazia. Sem escopo, undefined.
   */
  private async scopeFragment(user?: ScopedUser): Promise<Prisma.ordens_servicoWhereInput | undefined> {
    const scope = await this.scopeService.getScope(user);
    if (!this.scopeService.isScoped(scope)) return undefined;
    if (scope.length === 0) return { id: '__NEVER__' };
    // A mesma regra do filtro de planta (filtros-da-os)
    return ordemDasPlantas(scope);
  }

  async listar(filters: OSFiltersDto, user?: UsuarioDaOS): Promise<ListarOSResponseDto> {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      tipo,
      prioridade,
      responsavel,
      planta_id,
      data_inicio,
      data_fim,
      atrasadas,
      sortBy = 'criado_em',
      sortOrder = 'desc',
    } = filters;

    // Construir filtros
    const where: Prisma.ordens_servicoWhereInput = {
      deletado_em: null,
    };

    if (search) {
      where.OR = [
        { descricao: { contains: search, mode: 'insensitive' } },
        { local: { contains: search, mode: 'insensitive' } },
        { ativo: { contains: search, mode: 'insensitive' } },
        { numero_os: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status && status !== 'all') {
      where.status = status as StatusOS;
    }

    if (tipo && tipo !== 'all') {
      where.tipo = tipo;
    }

    if (prioridade && prioridade !== 'all') {
      where.prioridade = prioridade;
    }

    if (responsavel) {
      where.responsavel = { contains: responsavel, mode: 'insensitive' };
    }


    // Dia de Brasília inteiro: o fim antes era meia-noite UTC e a OS do último dia ficava de fora
    const periodo = periodoDoFiltro(data_inicio, data_fim);
    if (periodo) where.data_hora_programada = periodo;

    // O equipamento e os componentes, pela regra da instalação da OS (SN-55)
    const equipamentos = await equipamentoEComponentes(this.prisma, filters.equipamento_id);
    const doEquipamento: Prisma.ordens_servicoWhereInput[] = equipamentos
      ? [equipamentos.length ? ordemDoEquipamento(equipamentos) : { id: '__NEVER__' }]
      : [];
    // A planta pela mesma regra do escopo: a da OS ou, na antiga sem planta, a do equipamento
    if (planta_id?.trim()) doEquipamento.push(ordemDasPlantas([planta_id.trim()]));

    // A mesma regra do painel e do cartão (`idsDasAtrasadas`): aberta e com o prazo vencido
    if (atrasadas) {
      where.AND = [{ id: { in: await idsDasAtrasadas(this.prisma, { deletado_em: null }) } }];
    }
    // AND: a busca já usa o OR de cima
    if (doEquipamento.length) where.AND = [...((where.AND as Prisma.ordens_servicoWhereInput[] | undefined) ?? []), ...doEquipamento];

    // Scope RBAC
    const scopeFragment = await this.scopeFragment(user);
    if (scopeFragment) {
      where.AND = where.AND ? [...(where.AND as Prisma.ordens_servicoWhereInput[]), scopeFragment] : [scopeFragment];
    }

    // Contar total
    const total = await this.prisma.ordens_servico.count({ where });

    // Buscar dados
    const ordens = await this.prisma.ordens_servico.findMany({
      where,
      // O conteúdo da finalização (JSONB, dezenas de kB) só serve ao relatório e à conferência
      omit: { conteudo_finalizado: true },
      include: {
        tarefas_os: {
          include: {
            tarefa: true,
          },
        },
        materiais: true,
        ferramentas: true,
        tecnicos: true,
        itens_orcamento: true,
        programacao: {
          select: {
            id: true,
            codigo: true,
            descricao: true,
          },
        },
        anomalia: {
          select: {
            id: true,
            descricao: true,
            prioridade: true,
            status: true,
          },
        },
        plano_manutencao: {
          select: {
            id: true,
            nome: true,
            descricao: true,
          },
        },
        reserva_veiculo: {
          include: {
            veiculo: {
              select: { id: true, placa: true, modelo: true, marca: true },
            },
          },
        },
        // SN-61: só os marcos que param e retomam o trabalho, para o tempo efetivo
        historico: { where: { acao: { in: MARCOS_DO_TEMPO } }, select: { acao: true, data: true } },
        // SN-63: a exportação da lista leva a planta e o equipamento; sem eles a
        // listagem devolvia os dois indefinidos e as colunas saíam vazias
        planta: { select: { id: true, nome: true } },
        equipamento: { select: { id: true, nome: true, tipo_equipamento: true, fabricante: true, modelo: true } },
      },
      // Desempate pelo id: com o mesmo criado_em, a ordem entre páginas não era
      // garantida, e a exportação (que lê todas) perdia ou repetia OS
      orderBy: [{ [sortBy]: sortOrder }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    });

    // 🔧 FIX: Buscar manualmente os relacionamentos quando os IDs têm espaços em branco
    for (const ordem of ordens) {
      // Buscar anomalia se o ID existir mas a relação não veio
      if (ordem.anomalia_id && !ordem.anomalia) {
        const anomaliaId = ordem.anomalia_id.trim();
        if (anomaliaId) {
          ordem.anomalia = await this.prisma.anomalias.findUnique({
            where: { id: anomaliaId },
            select: {
              id: true,
              descricao: true,
              prioridade: true,
              status: true,
            },
          });
        }
      }

      // Buscar plano_manutencao se o ID existir mas a relação não veio
      if (ordem.plano_manutencao_id && !ordem.plano_manutencao) {
        const planoId = ordem.plano_manutencao_id.trim();
        if (planoId) {
          ordem.plano_manutencao = await this.prisma.planos_manutencao.findUnique({
            where: { id: planoId },
            select: {
              id: true,
              nome: true,
              descricao: true,
            },
          });
        }
      }

      // Buscar programacao se o ID existir mas a relação não veio
      if (ordem.programacao_id && !ordem.programacao) {
        const progId = ordem.programacao_id.trim();
        if (progId) {
          ordem.programacao = await this.prisma.programacoes_os.findUnique({
            where: { id: progId },
            select: {
              id: true,
              codigo: true,
              descricao: true,
            },
          });
        }
      }

      // Buscar reserva_veiculo se o ID existir mas a relação não veio (CHAR(26) padding)
      if (ordem.reserva_id && !ordem.reserva_veiculo) {
        const reservaId = ordem.reserva_id.trim();
        if (reservaId) {
          ordem.reserva_veiculo = await this.prisma.reserva_veiculo.findUnique({
            where: { id: reservaId },
            include: {
              veiculo: {
                select: { id: true, placa: true, modelo: true, marca: true },
              },
            },
          });
        }
      }
    }

    // Estatísticas no escopo da listagem: antes contavam as OS de todas as plantas (SN-40)
    const stats = await this.obterEstatisticas(scopeFragment);

    // A instalação não é coluna da OS: sai do equipamento congelado na tarefa,
    // da anomalia ou da solicitação, conforme a origem. Uma consulta para a
    // página inteira.
    const instalacoes = await instalacoesDasOrdens(this.prisma, ordens.map(ordem => ordem.id));

    // SERV-10: o cliente não vê dinheiro da OS
    const resposta = (ordem: (typeof ordens)[number]) => this.mapearParaResponse(ordem, instalacoes.get(ordem.id) ?? []);
    return {
      data: ordens.map((ordem) => (veOsCustos(user) ? resposta(ordem) : semDinheiro(resposta(ordem)))),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats,
    };
  }

  async buscarPorId(id: string, user?: UsuarioDaOS): Promise<OrdemServicoDetalhesResponseDto> {
    if (user) await this.scopeService.assertEntityInScope('ordem_servico', id, user);
    const os = await this.prisma.ordens_servico.findFirst({
      where: {
        id,
        deletado_em: null,
      },
      omit: { conteudo_finalizado: true },
      include: {
        programacao: {
          include: {
            solicitacao_servico: {
              select: {
                id: true,
                numero: true,
                titulo: true,
                descricao: true,
                tipo: true,
                prioridade: true,
                status: true,
                local: true,
                solicitante_nome: true,
                data_solicitacao: true,
              },
            },
          },
        },
        // ✅ ADICIONADO: Include anomalia
        anomalia: {
          select: {
            id: true,
            descricao: true,
            // SN-60: a tela usa como início da parada na corretiva
            data: true,
            prioridade: true,
            status: true,
            local: true,
            ativo: true,
            condicao: true,
            origem: true,
            observacoes: true,
            created_at: true,
            updated_at: true,
          },
        },
        // ✅ ADICIONADO: Include plano_manutencao
        plano_manutencao: {
          select: {
            id: true,
            nome: true,
            descricao: true,
          },
        },
        // ✅ COMENTADO: solicitacao_servico não existe como relação no schema
        // solicitacao_servico: {
        //   select: {
        //     id: true,
        //     numero: true,
        //     titulo: true,
        //     descricao: true,
        //     tipo: true,
        //     prioridade: true,
        //     status: true,
        //     local: true,
        //     solicitante_nome: true,
        //     data_solicitacao: true,
        //   },
        // },
        // ✅ ADICIONADO: Include planta
        planta: {
          select: {
            id: true,
            nome: true,
          },
        },
        // ✅ ADICIONADO: Include equipamento
        equipamento: {
          select: {
            id: true,
            nome: true,
            tipo_equipamento: true,
            fabricante: true,
            modelo: true,
          },
        },
        tarefas_os: {
          include: {
            // O id da instrucao nao esta no congelamento, e e ele que abre o sheet com etapas,
            // recursos e anexos. O include so casa o id de 26 caracteres: o resto vem por
            // `tarefasDasLinhas`, logo abaixo
            tarefa: { select: SELECAO_DA_TAREFA },
          },
          // Sem `where: { tarefa_id: { not: null } }`. O vinculo fica orfao
          // quando a copia do plano e apagada, mas o que foi PEDIDO continua
          // congelado nele — filtrar aqui esvaziava a OS inteira, sumindo com
          // o checklist e com o card de origem.
          orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
        },
        materiais: true,
        ferramentas: true,
        tecnicos: true,
        // SN-93: na ordem em que entraram (o previsto, depois o não previsto): o quadro de custos sai igual sempre
        itens_orcamento: { orderBy: [{ created_at: 'asc' }, { id: 'asc' }] },
        checklist_atividades: {
          orderBy: { ordem: 'asc' },
        },
        anexos: {
          where: { deletado_em: null },
          orderBy: { uploaded_at: 'desc' },
        },
        registros_tempo: {
          orderBy: { data_hora_inicio: 'desc' },
        },
        historico: {
          orderBy: { data: 'desc' },
        },
        reserva_veiculo: {
          include: {
            veiculo: {
              select: { id: true, placa: true, modelo: true, marca: true },
            },
          },
        },
      },
    });

    if (!os) {
      throw new NotFoundException('Ordem de serviço não encontrada');
    }

    // Fallback manual para reserva_veiculo (CHAR(26) padding)
    if (os.reserva_id && !os.reserva_veiculo) {
      const reservaId = os.reserva_id.trim();
      if (reservaId) {
        os.reserva_veiculo = await this.prisma.reserva_veiculo.findUnique({
          where: { id: reservaId },
          include: {
            veiculo: {
              select: { id: true, placa: true, modelo: true, marca: true },
            },
          },
        });
      }
    }

    // A tarefa de cada linha pelo id (tarefas_os.tarefa_id é Char(26)): com o id de 25 caracteres o
    // include volta null, e a linha perdia a instrução, o plano e o valor do cadastro (SN-93)
    const semTarefa = os.tarefas_os.filter((t) => !t.tarefa && t.tarefa_id?.trim());
    if (semTarefa.length > 0) {
      const tarefas = await tarefasDasLinhas(this.prisma, semTarefa.map((t) => t.tarefa_id));
      for (const linha of semTarefa) linha.tarefa = tarefas.get(linha.tarefa_id!.trim()) ?? null;
    }

    const instalacoes = await instalacoesDasOrdens(this.prisma, [os.id]);

    // SN-93: o custo aberto, pela conta do PDF e do custo real gravado. A OS finalizada pelas regras de
    // antes (conteúdo da versão 1, ou sem código) não tinha os outros custos no custo real: o sheet diz
    // o mesmo que o PDF dela
    const outrosNoReal = os.status !== StatusOS.FINALIZADA || (await this.versaoDoConteudo(os.id)) >= 2;
    const apurado = ([StatusOS.EXECUTADA, StatusOS.AUDITADA, StatusOS.FINALIZADA] as string[]).includes(os.status);
    const resumo = resumoDoCusto({ ...(await dadosDoCustoDaOS(this.prisma, os, outrosNoReal)), apurado });
    // A finalizada pelas regras de antes: o registrado pode não ser a conta das linhas (o PDF diz o mesmo)
    const custos = outrosNoReal ? resumo : comOCustoRegistrado(resumo, os.custo_real === null ? null : Number(os.custo_real));

    const instrucoesDaLinha = await instrucoesDasLinhas(this.prisma, os.tarefas_os);
    const tarefas_os = os.tarefas_os.map((t, i) => ({ ...t, instrucao_da_linha: instrucoesDaLinha[i] }));
    const detalhes = { ...this.mapearParaDetalhes({ ...os, tarefas_os }, instalacoes.get(os.id) ?? []), custos };
    // SERV-10: o cliente não vê dinheiro da OS (sem o quadro de custos, os valores e o R$ da trilha)
    return veOsCustos(user) ? detalhes : semDinheiro(detalhes);
  }

  /** A versão do conteúdo registrado na finalização (0 = sem conteúdo); o JSON inteiro não precisa sair do banco */
  private async versaoDoConteudo(id: string): Promise<number> {
    const [linha] = await this.prisma.$queryRaw<{ versao: string | null }[]>`
      SELECT conteudo_finalizado->>'versao' AS versao FROM ordens_servico WHERE id = ${id}`;
    return Number(linha?.versao ?? 0) || 0;
  }

  /**
   * Quem pode registrar horas sem estar escalado (SN-61): a regra de quem é
   * escalado na programação (SN-31), na planta da OS. Rota da OS porque o
   * técnico de campo, que executa, não tem a da programação.
   */
  async pessoasQuePodemAtuar(id: string, user?: ScopedUser): Promise<PessoasDaOS> {
    if (user) await this.scopeService.assertEntityInScope('ordem_servico', id, user);
    const os = await this.prisma.ordens_servico.findFirst({ where: { id, deletado_em: null }, select: { planta_id: true } });
    if (!os) throw new NotFoundException('Ordem de serviço não encontrada');
    // Só id e nome: quem executa é o menor papel interno, e e-mail (o login) e
    // papel de todo o apoio (quem é administrador) não servem à tela
    const { equipe, apoio } = await pessoasQuePodemAtuar(this.prisma, os.planta_id);
    const soNome = ({ id: pessoaId, nome }: { id: string; nome: string }) => ({ id: pessoaId, nome });
    return { equipe: equipe.map(soNome), apoio: apoio.map(soNome) };
  }

  async iniciar(id: string, dto: IniciarExecucaoDto, usuarioId?: string, user?: ScopedUser): Promise<void> {
    if (user) await this.scopeService.assertEntityInScope('ordem_servico', id, user);
    const os = await this.buscarPorId(id);

    if (os.status !== StatusOS.PENDENTE) {
      throw new ConflictException('Apenas OS pendentes podem ser iniciadas');
    }

    const dataHoraInicio = dto.data_hora_inicio_real ? new Date(dto.data_hora_inicio_real) : new Date();

    await this.prisma.$transaction(async (prisma) => {
      await prisma.ordens_servico.update({
        where: { id },
        data: {
          status: StatusOS.EM_EXECUCAO,
          data_hora_inicio_real: dataHoraInicio,
          responsavel: dto.responsavel_execucao || os.responsavel,
          equipe_presente: dto.equipe_presente || undefined,
          observacoes_execucao: dto.observacoes,
        },
      });

      // Criar registro de tempo inicial
      await prisma.registros_tempo_os.create({
        data: {
          os_id: id,
          tecnico_nome: dto.responsavel_execucao || os.responsavel || 'Sistema',
          data_hora_inicio: dataHoraInicio,
          atividade: 'Início da execução',
          observacoes: dto.observacoes,
        },
      });

      // Gerar checklist padrão se não existir
      await this.gerarChecklistPadrao(prisma, id);

      // Viatura sai: km inicial (opcional) na reserva e viatura "em uso" (D4
      // da SPEC-RESERVAS-DE-VIATURA). Antes iniciar não tocava na viatura.
      const reserva = await this.reservaAtivaDaOS(prisma, os.reserva_id);
      if (reserva) {
        if (dto.km_inicial != null) {
          await prisma.reserva_veiculo.update({ where: { id: reserva.id }, data: { km_inicial: dto.km_inicial } });
        }
        await prisma.veiculo.updateMany({
          where: { id: { in: variantesDeId(reserva.veiculo_id) }, status: 'disponivel' },
          data: { status: 'em_uso' },
        });
      }

      await this.registrarHistorico(
        prisma,
        id,
        'INICIO_EXECUCAO',
        'Sistema',
        usuarioId,
        `Execução iniciada. Equipe: ${dto.equipe_presente?.join(', ') || 'N/A'}`,
        StatusOS.PENDENTE,
        StatusOS.EM_EXECUCAO,
      );
    });
  }

  /**
   * Cria uma ordem de serviço a partir de uma programação APROVADA (chamado internamente ao aprovar OP)
   * A OS é criada já pelo gerarOrdemServico da programação. Este método é para criação manual.
   */
  async iniciarDeProgramacao(programacaoId: string, dto: IniciarExecucaoDto, usuarioId?: string): Promise<{ os_id: string }> {
    // 1️⃣ Buscar programação com todos os dados
    const programacao = await this.prisma.programacoes_os.findFirst({
      where: {
        id: programacaoId,
        deletado_em: null,
      },
      include: {
        materiais: true,
        ferramentas: true,
        tecnicos: true,
        itens_orcamento: true,
        tarefas_programacao: {
          include: {
            tarefa: true,
          },
        },
      },
    });

    if (!programacao) {
      throw new NotFoundException('Programação não encontrada');
    }

    if (programacao.status !== 'APROVADA') {
      throw new ConflictException('Apenas programações aprovadas podem ser iniciadas');
    }

    // 2️⃣ Verificar se já existe uma OS para esta programação
    const osExistente = await this.prisma.ordens_servico.findFirst({
      where: {
        programacao_id: programacaoId,
        deletado_em: null,
      },
    });

    if (osExistente) {
      throw new ConflictException('Já existe uma ordem de serviço para esta programação');
    }

    const dataHoraInicio = dto.data_hora_inicio_real ? new Date(dto.data_hora_inicio_real) : new Date();

    // 3️⃣ Criar ordem de serviço e copiar dados da programação
    let osId: string;

    await this.prisma.$transaction(async (prisma) => {
      // Gerar número da OS
      const numeroOS = await gerarNumeroOS(prisma, programacao.origem);

      // Criar ordem de serviço
      const os = await prisma.ordens_servico.create({
        data: {
          programacao_id: programacaoId,
          numero_os: numeroOS,
          descricao: programacao.descricao,
          local: programacao.local || '',
          ativo: programacao.ativo || '',
          condicoes: programacao.condicoes,
          status: StatusOS.PENDENTE,
          tipo: programacao.tipo,
          prioridade: programacao.prioridade,
          origem: programacao.origem,
          planta_id: programacao.planta_id,
          equipamento_id: programacao.equipamento_id,
          anomalia_id: programacao.anomalia_id,
          plano_manutencao_id: programacao.plano_manutencao_id,
          reserva_id: programacao.reserva_id,
          dados_origem: programacao.dados_origem,
          tempo_estimado: programacao.tempo_estimado,
          duracao_estimada: programacao.duracao_estimada,
          responsavel: dto.responsavel_execucao || programacao.responsavel,
          responsavel_id: programacao.responsavel_id,
          time_equipe: programacao.time_equipe,
          // Mesma precedencia do outro caminho de geracao de OS: a coluna
          // `data_hora_programada` so e preenchida pela programacao detalhada,
          // que segue comentada no formulario. Copiada crua, a OS nascia com a
          // data nula — sumia da tabela e escapava do filtro de atrasadas.
          data_hora_programada:
            programacao.data_hora_programada || programacao.data_previsao_inicio,
          data_hora_inicio_real: dataHoraInicio,
          equipe_presente: dto.equipe_presente,
          orcamento_previsto: programacao.orcamento_previsto,
          observacoes: programacao.observacoes,
          observacoes_programacao: programacao.observacoes_programacao,
          observacoes_execucao: dto.observacoes,
          criado_por: programacao.criado_por,
          criado_por_id: programacao.criado_por_id,
        },
      });

      osId = os.id;

      // Copiar materiais
      if (programacao.materiais.length > 0) {
        await prisma.materiais_os.createMany({
          data: programacao.materiais.map(m => ({
            os_id: osId,
            descricao: m.descricao,
            quantidade_planejada: m.quantidade_planejada,
            unidade: m.unidade,
            custo_unitario: m.custo_unitario,
            custo_total: m.custo_total,
            confirmado: m.confirmado,
            disponivel: m.disponivel,
            observacoes: m.observacoes,
          })),
        });
      }

      // Copiar ferramentas
      if (programacao.ferramentas.length > 0) {
        await prisma.ferramentas_os.createMany({
          data: programacao.ferramentas.map(f => ({
            os_id: osId,
            descricao: f.descricao,
            quantidade: f.quantidade,
            // A unidade acompanha a quantidade. Sem ela a ferramenta herdada da
            // instrucao chegaria na OS como "2,5" sem dizer de que.
            unidade: f.unidade ?? null,
            confirmada: f.confirmada,
            disponivel: f.disponivel,
            observacoes: f.observacoes,
          })),
        });
      }

      // Copiar técnicos
      if (programacao.tecnicos.length > 0) {
        await prisma.tecnicos_os.createMany({
          data: programacao.tecnicos.map(t => ({
            os_id: osId,
            nome: t.nome,
            especialidade: t.especialidade,
            horas_estimadas: t.horas_estimadas,
            custo_hora: t.custo_hora,
            custo_total: t.custo_total,
            disponivel: t.disponivel,
            tecnico_id: t.tecnico_id,
          })),
        });
      }

      // Copiar itens de orçamento
      if (programacao.itens_orcamento && programacao.itens_orcamento.length > 0) {
        await prisma.itens_orcamento_os.createMany({
          data: programacao.itens_orcamento.map(i => ({
            os_id: osId,
            descricao: i.descricao,
            valor: i.valor,
            natureza: i.natureza,
          })),
        });
      }

      // Copiar tarefas, carregando adiante o conteudo congelado na programacao
      if (programacao.tarefas_programacao.length > 0) {
        // As instruções avulsas (SN-86) vão junto, como as tarefas
        await prisma.tarefas_os.createMany({ data: programacao.tarefas_programacao.map((tp) => vinculoDaOS(tp, osId)) });
      }

      // Gerar checklist padrão
      await this.gerarChecklistPadrao(prisma, osId);

      // Criar registro de tempo inicial
      await prisma.registros_tempo_os.create({
        data: {
          os_id: osId,
          tecnico_nome: dto.responsavel_execucao,
          data_hora_inicio: dataHoraInicio,
          atividade: 'Início da execução',
          observacoes: dto.observacoes,
        },
      });

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        osId,
        'CRIACAO',
        dto.responsavel_execucao,
        usuarioId,
        `OS criada a partir da programação ${programacao.codigo}`,
        undefined,
        StatusOS.PENDENTE,
      );
    });

    return { os_id: osId! };
  }


  async pausar(id: string, dto: PausarExecucaoDto, usuarioId?: string, user?: ScopedUser): Promise<void> {
    if (user) await this.scopeService.assertEntityInScope('ordem_servico', id, user);
    const os = await this.buscarPorId(id);

    if (os.status !== StatusOS.EM_EXECUCAO) {
      throw new ConflictException('Apenas OS em execução podem ser pausadas');
    }

    await this.prisma.$transaction(async (prisma) => {
      // Atualizar OS
      await prisma.ordens_servico.update({
        where: { id },
        data: { status: StatusOS.PAUSADA },
      });

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        id,
        'PAUSA',
        'Sistema',
        usuarioId,
        `${dto.motivo_pausa}. ${dto.observacoes || ''}`,
        StatusOS.EM_EXECUCAO,
        StatusOS.PAUSADA,
      );
    });
  }

  async retomar(id: string, dto: RetomarExecucaoDto, usuarioId?: string, user?: ScopedUser): Promise<void> {
    if (user) await this.scopeService.assertEntityInScope('ordem_servico', id, user);
    const os = await this.buscarPorId(id);

    if (os.status !== StatusOS.PAUSADA) {
      throw new ConflictException('Apenas OS pausadas podem ser retomadas');
    }

    await this.prisma.$transaction(async (prisma) => {
      // Atualizar OS
      await prisma.ordens_servico.update({
        where: { id },
        data: { status: StatusOS.EM_EXECUCAO },
      });

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        id,
        'RETOMADA',
        'Sistema',
        usuarioId,
        dto.observacoes_retomada || 'Execução retomada',
        StatusOS.PAUSADA,
        StatusOS.EM_EXECUCAO,
      );
    });
  }

  async atualizarChecklist(id: string, dto: AtualizarChecklistDto, usuarioId?: string, user?: ScopedUser): Promise<void> {
    if (user) await this.scopeService.assertEntityInScope('ordem_servico', id, user);
    const os = await this.buscarPorId(id);
    this.exigirEmExecucao(os.status);
    const autor = await this.nomeDoUsuario(usuarioId);

    await this.prisma.$transaction(async (prisma) => {
      // As linhas travadas antes de ler: o que se lê é o que está gravado, e
      // concluir a tarefa ao mesmo tempo espera (ou é esperado)
      const ids = await travarItensDoChecklist(prisma, id, dto.atividades.map((a) => a.id));
      const itens = await prisma.checklist_atividades_os.findMany({
        where: { os_id: id, id: { in: ids } },
        select: { id: true, atividade: true, tipo: true, concluida: true, valor_lido: true, tarefa_os_id: true, exige_foto: true },
      });
      // As fotos dos itens (SN-59): o que exige foto só é marcado com uma
      const fotos = await fotosDosItens(prisma, id, itens.filter((i) => i.exige_foto).map((i) => i.id));
      const idsDasTarefas = [...new Set(itens.map((i) => i.tarefa_os_id?.trim()).filter((t): t is string => !!t))];
      const tarefas = idsDasTarefas.length
        ? await prisma.tarefas_os.findMany({
            where: { os_id: id, id: { in: idsDasTarefas } },
            select: { id: true, status: true, nome_snapshot: true },
          })
        : [];

      for (const { id: itemId, data } of gravacoesDoChecklist(dto.atividades, itens, tarefas, { autor, usuarioId }, fotos)) {
        // updateMany com os_id: item de outra OS não é alterado por engano
        await prisma.checklist_atividades_os.updateMany({ where: { id: itemId, os_id: id }, data });
      }
      // Sem linha no histórico da OS: a tela grava item a item, e cada clique
      // virava um "Checklist atualizado". Quem marcou e quando fica no item.
    });
  }

  async registrarMateriais(id: string, dto: RegistrarMateriaisDto, usuarioId?: string, user?: ScopedUser): Promise<void> {
    if (user) await this.scopeService.assertEntityInScope('ordem_servico', id, user);
    const os = await this.buscarPorId(id);
    exigirOSAlteravel(os.status);

    await this.prisma.$transaction(async (prisma) => {
      // SN-62: gravado durante o finalizar, ficava fora do conteúdo da OS finalizada
      const status = await travarOSAlteravel(prisma, id, 'gravar');
      for (const material of dto.materiais) {
        // updateMany com os_id: o id de um material de outra OS não altera aquela OS
        const { count } = await prisma.materiais_os.updateMany({
          where: { id: material.id, os_id: id },
          data: {
            quantidade_consumida: material.quantidade_consumida,
            observacoes: material.observacoes,
          },
        });
        if (count === 0) throw new NotFoundException(`Material ${material.id} não pertence a esta OS`);
      }

      // O custo real sai ao executar: o consumo registrado depois (executada ou
      // auditada) ficava fora dele, e o custo da OS mentia (SN-81)
      let mudancaDoCusto = '';
      if (status === StatusOS.EXECUTADA || status === StatusOS.AUDITADA) {
        const antes = (await prisma.ordens_servico.findUniqueOrThrow({ where: { id }, select: { custo_real: true } })).custo_real;
        const custo = await this.calcularCustoReal(prisma, id);
        await prisma.ordens_servico.update({ where: { id }, data: { custo_real: custo } });
        // O auditor aprovou um valor: a trilha diz de quanto para quanto mudou
        if (!custo.equals(antes ?? 0)) mudancaDoCusto = ` Custo real de R$ ${reais(antes)} para R$ ${reais(custo)}.`;
      }

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        id,
        'CONSUMO_MATERIAIS',
        'Sistema',
        usuarioId,
        `Consumo registrado: ${dto.materiais.length} material(is).${mudancaDoCusto}`,
      );
      // O tempo do executar: ele segura a OS até 15 s, e o padrão (5 s) virava 500 (P2028)
    }, { timeout: 15000, maxWait: 15000 });
  }

  /**
   * SN-93: os outros custos registrados fora do Executar (no editar da OS), como
   * o consumo de material: na executada ou auditada, o custo real é refeito e a
   * trilha diz de quanto para quanto.
   */
  /**
   * A correção dos outros custos depois do Executar (SN-93). Só depois dele: em
   * execução, quem confere é o painel do Executar, que manda a lista inteira — a
   * correção feita com ele aberto era sobrescrita pela lista que ele já tinha. Na
   * auditada, só quem gerencia a OS: o auditor aprovou um custo.
   */
  async registrarOutrosCustos(id: string, dto: RegistrarOutrosCustosDto, usuarioId?: string, user?: UsuarioDaOS): Promise<void> {
    if (user) await this.scopeService.assertEntityInScope('ordem_servico', id, user);
    const os = await this.buscarPorId(id);
    exigirOSAlteravel(os.status);

    await this.prisma.$transaction(async (prisma) => {
      const status = await travarOSAlteravel(prisma, id, 'gravar');
      if (status !== StatusOS.EXECUTADA && status !== StatusOS.AUDITADA) {
        throw new ConflictException('Os outros custos se conferem no Executar; corrigir é depois dele, antes de finalizar.');
      }
      if (status === StatusOS.AUDITADA && user && !gerenciaAOS(user)) {
        throw new ForbiddenException('A OS já foi auditada: só quem gerencia a OS corrige os outros custos.');
      }
      const mudancas = await gravarOutrosCustos(prisma, id, dto.outros_custos);
      if (!mudancas) return;

      const antes = (await prisma.ordens_servico.findUniqueOrThrow({ where: { id }, select: { custo_real: true } })).custo_real;
      const custo = await this.calcularCustoReal(prisma, id);
      await prisma.ordens_servico.update({ where: { id }, data: { custo_real: custo } });
      const mudancaDoCusto = custo.equals(antes ?? 0) ? '' : ` Custo real de R$ ${reais(antes)} para R$ ${reais(custo)}.`;
      await this.registrarHistorico(prisma, id, 'OUTROS_CUSTOS', 'Sistema', usuarioId, `${mudancas}${mudancaDoCusto}`);
    }, { timeout: 15000, maxWait: 15000 });
  }

  async registrarFerramentas(id: string, dto: RegistrarFerramentasDto, usuarioId?: string, user?: ScopedUser): Promise<void> {
    if (user) await this.scopeService.assertEntityInScope('ordem_servico', id, user);
    const os = await this.buscarPorId(id);
    exigirOSAlteravel(os.status);

    await this.prisma.$transaction(async (prisma) => {
      await travarOSAlteravel(prisma, id);
      for (const ferramenta of dto.ferramentas) {
        const { count } = await prisma.ferramentas_os.updateMany({
          where: { id: ferramenta.id, os_id: id },
          data: {
            utilizada: ferramenta.utilizada,
            condicao_antes: ferramenta.condicao_antes,
            condicao_depois: ferramenta.condicao_depois,
            observacoes: ferramenta.observacoes,
          },
        });
        if (count === 0) throw new NotFoundException(`Ferramenta ${ferramenta.id} não pertence a esta OS`);
      }

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        id,
        'USO_FERRAMENTAS',
        'Sistema',
        usuarioId,
        `Uso registrado: ${dto.ferramentas.length} ferramenta(s)`,
      );
    });
  }

  async concluirTarefa(id: string, tarefaId: string, dto: ConcluirTarefaDto, usuarioId?: string, user?: ScopedUser): Promise<void> {
    if (user) await this.scopeService.assertEntityInScope('ordem_servico', id, user);
    const os = await this.buscarPorId(id);
    this.exigirEmExecucao(os.status);
    const tarefa = await this.vinculoDaTarefa(id, tarefaId);

    const autor = dto.concluida_por || (await this.nomeDoUsuario(usuarioId));

    await this.prisma.$transaction(async (prisma) => {
      // A tarefa travada antes de olhar os itens: desmarcar um item ao mesmo
      // tempo espera, e a tarefa não fecha com a pendência que acabou de surgir
      if ((await travarTarefa(prisma, id, tarefa.id)) !== 'PENDENTE') {
        throw new ConflictException(`A tarefa "${nomeDaTarefa(tarefa)}" não está pendente: desfaça antes de marcar de novo.`);
      }

      // D1: a tarefa só conclui com os itens obrigatórios dela marcados, e a
      // leitura fora da faixa explicada (SN-58).
      const pendencia = pendenciaDaTarefa(
        await prisma.checklist_atividades_os.findMany({
          where: { os_id: id, tarefa_os_id: tarefa.id },
          orderBy: { ordem: 'asc' },
          select: {
            atividade: true,
            obrigatoria: true,
            concluida: true,
            tipo: true,
            unidade: true,
            valor_lido: true,
            valor_minimo: true,
            valor_maximo: true,
            observacoes: true,
          },
        }),
      );
      if (pendencia) throw new ConflictException(pendencia);

      // Atualizar tarefa
      await prisma.tarefas_os.update({
        where: { id: tarefa.id },
        data: {
          status: 'CONCLUIDA',
          data_conclusao: new Date(),
          concluida_por: autor,
          observacoes: dto.observacoes ?? null,
        },
      });

      // Registrar tempo se fornecido
      if (dto.tempo_execucao) {
        await prisma.registros_tempo_os.create({
          data: {
            os_id: id,
            tecnico_nome: autor,
            data_hora_inicio: new Date(),
            tempo_total: dto.tempo_execucao,
            atividade: `Execução da tarefa: ${nomeDaTarefa(tarefa)}`,
            observacoes: dto.observacoes,
          },
        });
      }

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        id,
        'CONCLUSAO_TAREFA',
        autor,
        usuarioId,
        `Tarefa concluída: ${nomeDaTarefa(tarefa)}. ${dto.problemas_encontrados ? `Problemas: ${dto.problemas_encontrados}` : ''}`,
      );
    });
  }

  async cancelarTarefa(id: string, tarefaId: string, dto: CancelarTarefaDto, usuarioId?: string, user?: ScopedUser): Promise<void> {
    if (user) await this.scopeService.assertEntityInScope('ordem_servico', id, user);
    const os = await this.buscarPorId(id);
    this.exigirEmExecucao(os.status);
    const tarefa = await this.vinculoDaTarefa(id, tarefaId);

    await this.prisma.$transaction(async (prisma) => {
      // "Não feita": o motivo fica no vínculo e continua devendo no plano
      // (o cron só conta CONCLUIDA). Não avança a âncora — diferente de
      // cancelar a OS inteira, que é decisão de pular o ciclo.
      await prisma.tarefas_os.update({
        where: { id: tarefa.id },
        data: {
          status: 'CANCELADA',
          data_conclusao: null,
          observacoes: [dto.motivo_cancelamento, dto.observacoes].filter(Boolean).join('. '),
        },
      });

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        id,
        'CANCELAMENTO_TAREFA',
        'Sistema',
        usuarioId,
        `Tarefa cancelada: ${nomeDaTarefa(tarefa)}. Motivo: ${dto.motivo_cancelamento}`,
      );
    });
  }

  /** Desfaz "feita" ou "não feita" enquanto a OS está em execução (clique errado) */
  async reabrirTarefa(id: string, tarefaId: string, usuarioId?: string, user?: ScopedUser): Promise<void> {
    if (user) await this.scopeService.assertEntityInScope('ordem_servico', id, user);
    const os = await this.buscarPorId(id);
    this.exigirEmExecucao(os.status);
    const tarefa = await this.vinculoDaTarefa(id, tarefaId);

    await this.prisma.$transaction(async (prisma) => {
      await prisma.tarefas_os.update({
        where: { id: tarefa.id },
        data: { status: 'PENDENTE', data_conclusao: null, concluida_por: null, observacoes: null },
      });
      await this.registrarHistorico(
        prisma, id, 'REABERTURA_TAREFA', 'Sistema', usuarioId,
        `Tarefa reaberta: ${nomeDaTarefa(tarefa)}`,
      );
    });
  }

  /**
   * O vínculo da tarefa na OS, pelo id do vínculo (o que a tela usa) ou pelo id
   * da tarefa do plano (contrato antigo). O vínculo existe mesmo quando a cópia
   * do plano foi apagada; e o id da tarefa vem com as duas formas do Char(26).
   */
  private async vinculoDaTarefa(osId: string, ref: string) {
    const alvo = ref.trim();
    const vinculo = await this.prisma.tarefas_os.findFirst({
      where: { os_id: osId, OR: [{ id: alvo }, { tarefa_id: { in: [alvo, alvo.padEnd(26, ' ')] } }] },
      include: { tarefa: true },
    });
    if (!vinculo) throw new NotFoundException('Tarefa não encontrada na OS');
    return vinculo;
  }

  /** Checklist e tarefas só mudam com a OS em execução ou pausada */
  private exigirEmExecucao(status: string) {
    if (status !== StatusOS.EM_EXECUCAO && status !== StatusOS.PAUSADA) {
      throw new ConflictException('Checklist e tarefas só podem ser alterados com a OS em execução ou pausada');
    }
  }

  private async nomeDoUsuario(usuarioId?: string): Promise<string> {
    if (!usuarioId) return 'Sistema';
    const usuario = await this.prisma.usuarios.findUnique({
      where: { id: usuarioId.trim() },
      select: { nome: true },
    });
    return usuario?.nome ?? 'Sistema';
  }

  async executar(id: string, dto: ExecutarOSDto, usuarioId?: string, user?: UsuarioDaOS): Promise<void> {
    if (user) await this.scopeService.assertEntityInScope('ordem_servico', id, user);
    const os = await this.buscarPorId(id);

    if (os.status !== StatusOS.EM_EXECUCAO && os.status !== StatusOS.PAUSADA) {
      throw new ConflictException('Apenas OS em execução ou pausadas podem ser marcadas como executadas');
    }

    const dataHoraFim = dto.data_hora_fim_real ? new Date(dto.data_hora_fim_real) : new Date();

    // SN-60: na corretiva, se parou, sintoma, causa e ação (400 sem eles)
    const falha = dadosDeFalha(os.tipo, dto);
    const mudancaNaFalha =
      os.falha_sintoma || os.parada_inicio || os.equipamento_parou !== null ? mudancasNaFalha(dadosDaOS(os), falha) : null;
    // O equipamento que parou fica na OS: a coluna quase nunca vinha preenchida, e
    // o MTBF por equipamento da Fase 6 não teria de onde ler
    const equipamentoDaFalha =
      os.tipo === 'CORRETIVA' && !os.equipamento_id?.trim() ? await equipamentoDaCorretiva(this.prisma, id, os.anomalia_id) : null;

    // D2: executar não bloqueia por tarefa pendente, mas exige o motivo de cada
    // uma. Não fazer uma tarefa é comum (a equipe viaja e não consegue); o que
    // não pode é ela sumir sem registro.
    // Na ordem do id: dois "Executar" travam as mesmas tarefas na mesma ordem (sem deadlock)
    const pendentes = await this.prisma.tarefas_os.findMany({
      where: { os_id: id, status: 'PENDENTE' },
      include: { tarefa: true },
      orderBy: { id: 'asc' },
    });
    const motivos = new Map(
      (dto.tarefas_nao_feitas ?? [])
        .filter((t) => t.motivo?.trim())
        .map((t) => [t.id.trim(), t.motivo.trim()]),
    );
    const semMotivo = pendentes.filter((t) => !motivos.has(t.id.trim()));
    if (semMotivo.length > 0) {
      throw new ConflictException(
        `Informe por que estas tarefas não foram feitas: ${semMotivo.map(nomeDaTarefa).join(', ')}`,
      );
    }
    // Lido antes: dentro da transação, pelo this.prisma, ocupava uma segunda conexão do pool
    const autor = await this.nomeDoUsuario(usuarioId);


    await this.prisma.$transaction(async (prisma) => {
      for (const tarefa of pendentes) {
        const motivo = motivos.get(tarefa.id.trim())!;
        await prisma.tarefas_os.update({
          where: { id: tarefa.id },
          data: { status: 'CANCELADA', data_conclusao: null, observacoes: motivo },
        });
        await this.registrarHistorico(
          prisma, id, 'TAREFA_NAO_FEITA', 'Sistema', usuarioId,
          `Tarefa não feita: ${nomeDaTarefa(tarefa)}. Motivo: ${motivo}`,
        );
      }

      // O status conferido de novo na gravação: dois "Executar" juntos (toque
      // duplo, dois aparelhos) passavam os dois, e o segundo regravava calado
      const executada = await prisma.ordens_servico.updateMany({
        where: { id, status: { in: [StatusOS.EM_EXECUCAO, StatusOS.PAUSADA] } },
        data: {
          status: StatusOS.EXECUTADA,
          data_hora_fim_real: dataHoraFim,
          ...falha,
          ...(equipamentoDaFalha && { equipamento_id: equipamentoDaFalha }),
          resultado_servico: dto.resultado_servico,
          problemas_encontrados: dto.problemas_encontrados,
          recomendacoes: dto.recomendacoes,
          atividades_realizadas: dto.atividades_realizadas,
          // Derivado do proprio checklist, nao pedido ao usuario: o painel de
          // executar nunca coletou esse campo, entao a coluna vivia nula.
          checklist_concluido: await this.calcularChecklistConcluido(prisma, id),
          procedimentos_seguidos: dto.procedimentos_seguidos,
          equipamentos_seguranca: dto.equipamentos_seguranca,
          incidentes_seguranca: dto.incidentes_seguranca,
          custos_adicionais: dto.custos_adicionais,
        },
      });
      if (executada.count === 0) {
        throw new ConflictException('A OS já não está em execução (executada por outra pessoa agora há pouco?): recarregue a tela.');
      }

      // SN-61: as horas de cada técnico (toda linha da equipe) e quem entrou na
      // hora. Lidas depois da trava do status: no toque duplo, o segundo
      // "Executar" via a equipe já com quem o primeiro acrescentou e pedia as
      // horas dele, em vez de dizer que a OS já tinha sido executada
      const equipe = await prisma.tecnicos_os.findMany({ where: { os_id: id }, orderBy: [{ created_at: 'asc' }, { id: 'asc' }] });
      const horas = await gravacaoDasHoras(prisma, os.planta_id, equipe, dto, gerenciaAOS(user));
      for (const { id: tecnicoId, data } of horas.atualizacoes) {
        await prisma.tecnicos_os.update({ where: { id: tecnicoId }, data });
      }
      if (horas.novos.length > 0) {
        await prisma.tecnicos_os.createMany({ data: horas.novos.map((n) => ({ ...n, os_id: id })) });
      }

      // Atualizar materiais consumidos
      if (dto.materiais_consumidos && dto.materiais_consumidos.length > 0) {
        for (const material of dto.materiais_consumidos) {
          // Com os_id, como no registrarMateriais: o id de um material de outra
          // OS (até de outra planta) era gravado por esta rota
          const { count } = await prisma.materiais_os.updateMany({
            where: { id: material.id, os_id: id },
            data: {
              quantidade_consumida: material.quantidade_consumida,
              observacoes: material.observacoes,
            },
          });
          if (count === 0) throw new NotFoundException(`Material ${material.id} não pertence a esta OS`);
        }
      }

      // Atualizar ferramentas utilizadas
      if (dto.ferramentas_utilizadas && dto.ferramentas_utilizadas.length > 0) {
        for (const ferramenta of dto.ferramentas_utilizadas) {
          const { count } = await prisma.ferramentas_os.updateMany({
            where: { id: ferramenta.id, os_id: id },
            data: {
              condicao_depois: ferramenta.condicao_depois,
              observacoes: ferramenta.observacoes,
              utilizada: true,
            },
          });
          if (count === 0) throw new NotFoundException(`Ferramenta ${ferramenta.id} não pertence a esta OS`);
        }
      }

      // SN-93 (D2): os outros custos conferidos e os não previstos, antes da conta do custo real
      const outrosCustos = dto.outros_custos ? await gravarOutrosCustos(prisma, id, dto.outros_custos) : null;

      // Viatura volta: reserva finalizada com o km final, quilometragem da
      // viatura atualizada e viatura disponível. É aqui que ela fica livre (D3).
      const reserva = await this.reservaAtivaDaOS(prisma, os.reserva_id);
      if (reserva) {
        if (dto.km_final != null && reserva.km_inicial != null && dto.km_final < reserva.km_inicial) {
          throw new BadRequestException(
            `O km final (${dto.km_final}) não pode ser menor que o inicial (${reserva.km_inicial})`,
          );
        }
        await prisma.reserva_veiculo.update({
          where: { id: reserva.id },
          data: {
            status: 'finalizada',
            km_final: dto.km_final,
            observacoes_finalizacao: dto.observacoes_veiculo,
            data_finalizacao: dataHoraFim,
            finalizado_por: autor,
            finalizado_por_id: usuarioId,
          },
        });
        await devolverViatura(prisma, reserva.veiculo_id, dto.km_final);
      }

      // O custo sai do que acabou de ser gravado: as horas reais e o consumo de material
      await prisma.ordens_servico.update({ where: { id }, data: { custo_real: await this.calcularCustoReal(prisma, id) } });

      await this.registrarHistorico(
        prisma,
        id,
        'EXECUCAO',
        'Sistema',
        usuarioId,
        `OS executada. ${dto.resultado_servico || ''}`,
        os.status,
        StatusOS.EXECUTADA,
      );
      // Reexecutar depois de reabrir: o auditor vê o que mudou na falha
      if (mudancaNaFalha) await this.registrarHistorico(prisma, id, 'DADOS_DE_FALHA', 'Sistema', usuarioId, mudancaNaFalha);
      if (horas.resumo) await this.registrarHistorico(prisma, id, 'HORAS_TRABALHADAS', 'Sistema', usuarioId, horas.resumo);
      if (outrosCustos) await this.registrarHistorico(prisma, id, 'OUTROS_CUSTOS', 'Sistema', usuarioId, outrosCustos);
    }, {
      // Até 100 linhas da equipe, tarefas, materiais e a viatura; e no toque
      // duplo o segundo espera a trava da OS no próprio relógio (P2028 = 500, não 409)
      timeout: 15000,
      maxWait: 15000,
    });
  }

  async auditar(id: string, dto: AuditarOSDto, usuarioId?: string, user?: ScopedUser): Promise<void> {
    if (user) await this.scopeService.assertEntityInScope('ordem_servico', id, user);
    const os = await this.buscarPorId(id);

    if (os.status !== StatusOS.EXECUTADA) {
      throw new ConflictException('Apenas OS executadas podem ser auditadas');
    }

    let nomeAuditor: string | null = null;
    if (usuarioId) {
      try {
        const usuario = await this.prisma.usuarios.findUnique({ where: { id: usuarioId }, select: { nome: true } });
        if (usuario) nomeAuditor = usuario.nome;
      } catch (erro) {
        // Falhar aqui nao pode derrubar a operacao: o nome e so o rotulo do
        // historico, e ja existe fallback. Mas engolir calado escondia uma
        // consulta quebrada indefinidamente — o aviso deixa ela aparecer.
        this.logger.warn(`Nao foi possivel ler o nome do usuario ${usuarioId}: ${erro}`);
      }
    }

    await this.prisma.$transaction(async (prisma) => {
      // O status conferido na gravação (como no executar e no finalizar)
      const auditada = await prisma.ordens_servico.updateMany({
        where: { id, status: StatusOS.EXECUTADA },
        data: {
          status: StatusOS.AUDITADA,
          avaliacao_qualidade: dto.avaliacao_qualidade,
          observacoes_qualidade: dto.observacoes_qualidade,
          aprovado_por: nomeAuditor,
          aprovado_por_id: usuarioId,
          data_aprovacao: new Date(),
        },
      });
      if (auditada.count === 0) {
        throw new ConflictException('A OS já não está executada (auditada por outra pessoa agora há pouco?): recarregue a tela.');
      }

      await this.registrarHistorico(
        prisma,
        id,
        'AUDITORIA',
        nomeAuditor || 'Sistema',
        usuarioId,
        `OS auditada. Qualidade: ${dto.avaliacao_qualidade}/5. ${dto.observacoes_qualidade || ''}`,
        StatusOS.EXECUTADA,
        StatusOS.AUDITADA,
      );
    });
  }

  async reabrir(id: string, dto: ReabrirOSDto, usuarioId?: string, user?: ScopedUser): Promise<void> {
    if (user) await this.scopeService.assertEntityInScope('ordem_servico', id, user);
    const os = await this.buscarPorId(id);

    if (os.status !== StatusOS.AUDITADA) {
      throw new ConflictException('Apenas OS auditadas podem ser reabertas');
    }

    await this.prisma.$transaction(async (prisma) => {
      // Com a trava do status: reabrir junto com o finalizar esperava o commit e
      // sobrescrevia a FINALIZADA, deixando a OS em execução com o código gravado
      const reaberta = await prisma.ordens_servico.updateMany({
        where: { id, status: StatusOS.AUDITADA },
        data: {
          status: StatusOS.EM_EXECUCAO,
          data_hora_fim_real: null,
        },
      });
      if (reaberta.count === 0) {
        throw new ConflictException('A OS já não está auditada (finalizada ou reaberta agora há pouco?): recarregue a tela.');
      }

      await this.registrarHistorico(
        prisma,
        id,
        'REABERTURA',
        'Sistema',
        usuarioId,
        dto.observacoes || 'OS reaberta para execução',
        StatusOS.AUDITADA,
        StatusOS.EM_EXECUCAO,
      );
    });
  }

  async finalizar(id: string, dto: FinalizarOSDto, usuarioId?: string, user?: ScopedUser): Promise<void> {
    if (user) await this.scopeService.assertEntityInScope('ordem_servico', id, user);
    const os = await this.buscarPorId(id);

    if (os.status !== StatusOS.AUDITADA) {
      throw new ConflictException('Apenas OS auditadas podem ser finalizadas');
    }

    let nomeFinalizador: string | null = null;
    if (usuarioId) {
      try {
        const usuario = await this.prisma.usuarios.findUnique({ where: { id: usuarioId }, select: { nome: true } });
        if (usuario) nomeFinalizador = usuario.nome;
      } catch (erro) {
        // Falhar aqui nao pode derrubar a operacao: o nome e so o rotulo do
        // historico, e ja existe fallback. Mas engolir calado escondia uma
        // consulta quebrada indefinidamente — o aviso deixa ela aparecer.
        this.logger.warn(`Nao foi possivel ler o nome do usuario ${usuarioId}: ${erro}`);
      }
    }

    // Os anexos de antes do SN-62 não têm a soma gravada: lidos do disco aqui,
    // fora da transação (que segura a OS, a programação, a origem e as tarefas)
    const somasAntigas = await somasDosAnexosSemSoma(this.prisma, id);

    await this.prisma.$transaction(async (prisma) => {
      // O status conferido na gravação: dois "Finalizar" juntos passavam os
      // dois e contavam a execução de cada tarefa duas vezes no plano
      const finalizada = await prisma.ordens_servico.updateMany({
        where: { id, status: StatusOS.AUDITADA },
        data: {
          status: StatusOS.FINALIZADA,
          finalizado_por: nomeFinalizador,
          finalizado_por_id: usuarioId,
          // No segundo, para baixo: a coluna é TIMESTAMP(0) e arredondaria
          finalizada_em: new Date(Math.floor(Date.now() / 1000) * 1000),
        },
      });
      if (finalizada.count === 0) {
        throw new ConflictException('A OS já não está auditada (finalizada por outra pessoa agora há pouco?): recarregue a tela.');
      }

      // O custo real refeito antes de selar o conteúdo (SN-81): a OS executada
      // pelo código antigo, com consumo registrado depois, ficaria no documento
      // provado com o custo de antes do consumo
      const custoAntes = (await prisma.ordens_servico.findUniqueOrThrow({ where: { id }, select: { custo_real: true } })).custo_real;
      const custoFinal = await this.calcularCustoReal(prisma, id);
      await prisma.ordens_servico.update({ where: { id }, data: { custo_real: custoFinal } });
      // SN-93: a linha de antes, sem valor, sela com o do cadastro de agora
      await congelarValoresDasInstrucoes(prisma, id);

      // O auditor aprovou um custo: se a finalização o refez (a OS executada antes da regra de agora), a trilha diz
      const mudancaDoCusto = custoFinal.equals(custoAntes ?? 0) ? '' : ` Custo real refeito de R$ ${reais(custoAntes)} para R$ ${reais(custoFinal)}.`;
      await this.registrarHistorico(
        prisma,
        id,
        'FINALIZACAO',
        nomeFinalizador || 'Sistema',
        usuarioId,
        `${dto.observacoes || 'OS finalizada'}${mudancaDoCusto}`,
        StatusOS.AUDITADA,
        StatusOS.FINALIZADA,
      );

      // A programacao e a origem fecham junto com a OS, na mesma transacao.
      // Antes cada passo tinha um try/catch que so logava: se a origem falhasse,
      // a OS finalizava e a anomalia ficava PROGRAMADA para sempre.
      const programacao = await prisma.programacoes_os.findUnique({
        where: { id: os.programacao_id },
        select: { id: true, status: true, anomalia_id: true, solicitacao_servico_id: true, dados_origem: true },
      });

      if (programacao && programacao.status !== 'FINALIZADA') {
        await prisma.programacoes_os.update({
          where: { id: programacao.id },
          data: {
            status: 'FINALIZADA',
            finalizado_por: nomeFinalizador,
            finalizado_por_id: usuarioId,
            data_finalizacao: new Date(),
            observacoes_finalizacao: dto.observacoes || 'Finalizada automaticamente via OS',
          },
        });
      }

      const origem = programacao
        ? origemDaProgramacao(programacao)
        : { anomaliaId: null, solicitacaoId: null };
      origem.anomaliaId = origem.anomaliaId ?? (os.anomalia_id?.trim() || null);
      await finalizarOrigem(prisma, origem, { usuarioId, numeroOS: os.numero_os });

      // Registrar execução APENAS das tarefas efetivamente concluídas.
      // Uma OS pode ser finalizada com tarefas PENDENTE ou CANCELADA — marcar
      // todas como executadas faria a periodicidade contar a partir de algo que
      // nunca aconteceu, e a tarefa sumiria do agendamento por um ciclo inteiro.
      // A data é a da conclusão daquela tarefa, não a da finalização da OS:
      // OS fechada com atraso deslocaria todo o calendário seguinte.
      // Fica dentro da transação de propósito — se falhar, a finalização inteira
      // volta atrás em vez de deixar o agendamento silenciosamente parado.
      const tarefasConcluidas = await prisma.tarefas_os.findMany({
        where: {
          os_id: id,
          tarefa_id: { not: null },
          status: 'CONCLUIDA',
        },
        select: { tarefa_id: true, data_conclusao: true },
      });

      for (const vinculo of tarefasConcluidas) {
        const tarefaId = vinculo.tarefa_id?.trim();
        if (!tarefaId) continue;

        await prisma.tarefas.update({
          where: { id: tarefaId },
          data: {
            data_ultima_execucao: vinculo.data_conclusao ?? new Date(),
            numero_execucoes: { increment: 1 },
          },
        });
      }

      const totalVinculos = await prisma.tarefas_os.count({
        where: { os_id: id, tarefa_id: { not: null } },
      });

      // SN-62: o conteúdo registrado e o código dele, por último — depois de
      // tudo o que a finalização grava na OS. É dele que sai o PDF
      const semArquivo = await gravarCodigoDeVerificacao(prisma, id, somasAntigas);
      // Arquivo que não estava no disco fica no conteúdo sem soma: a trilha diz qual
      if (semArquivo.length > 0) {
        await this.registrarHistorico(
          prisma, id, 'ANEXO_SEM_ARQUIVO', 'Sistema', usuarioId,
          `Finalizada com anexo sem arquivo no servidor (sem soma no código de verificação): ${semArquivo.join(', ')}`,
        );
      }

      this.logger.log(
        `OS ${id} finalizada: ${tarefasConcluidas.length} de ${totalVinculos} tarefas concluídas tiveram a execução registrada`,
      );
    }, {
      // No toque duplo o segundo espera a trava da OS no próprio relógio
      timeout: 15000,
      maxWait: 15000,
    });
  }

  /** O conteúdo do PDF da OS (SN-62): o finalizado, com o código; antes de finalizar, o de agora, como prévia. */
  async relatorio(id: string, user?: UsuarioDaOS): Promise<RelatorioDaOS> {
    if (user) await this.scopeService.assertEntityInScope('ordem_servico', id, user);
    const relatorio = await relatorioDaOS(this.prisma, id);
    // Técnico de campo e cliente recebem o PDF sem os custos (SERV-9)
    return user && !gerenciaAOS(user) ? semOsCustos(relatorio) : relatorio;
  }

  /** Confere um código de verificação: a OS dele, e se o conteúdo de agora ainda é o finalizado. */
  async conferirCodigo(codigo: string, user?: ScopedUser): Promise<ConferenciaDoCodigo> {
    return conferirCodigo(this.prisma, codigo, async (osId) => {
      if (user) await this.scopeService.assertEntityInScope('ordem_servico', osId, user);
    });
  }

  async cancelar(id: string, dto: CancelarOSDto, usuarioId?: string, user?: ScopedUser): Promise<void> {
    if (user) await this.scopeService.assertEntityInScope('ordem_servico', id, user);
    await this.buscarPorId(id);

    // Reserva, ancora das tarefas, programacao e origem vao juntas — ver cancelarOS.
    await this.prisma.$transaction((prisma) =>
      cancelarOS(prisma, id, {
        motivo: dto.motivo_cancelamento,
        observacoes: dto.observacoes,
        usuarioId,
      }),
    );
  }

  // Métodos auxiliares privados

  private async reservaAtivaDaOS(prisma: Prisma.TransactionClient, reservaId?: string | null) {
    if (!reservaId?.trim()) return null;
    const reserva = await prisma.reserva_veiculo.findFirst({ where: { id: { in: variantesDeId(reservaId) } } });
    return reserva?.status === 'ativa' ? reserva : null;
  }

  /**
   * Semeia o checklist da OS.
   *
   * Antes eram apenas seis itens genericos, sem nenhuma relacao com o que foi
   * pedido: a OS nao sabia dizer o que era para ter sido feito. Agora sao so
   * as sub-instrucoes reais de cada tarefa. Os genericos de seguranca que
   * fechavam a lista sairam em 2026-10-01, a pedido do usuario: repetiam o
   * mesmo texto em toda OS e so faziam a pessoa marcar mais caixas.
   *
   * O texto e copiado (a tabela guarda `atividade` como texto, nao FK), entao o
   * checklist fica congelado junto com o resto do conteudo da OS.
   */
  private async gerarChecklistPadrao(prisma: Prisma.TransactionClient, osId: string): Promise<void> {
    const checklistExistente = await prisma.checklist_atividades_os.count({
      where: { os_id: osId },
    });

    if (checklistExistente > 0) return;

    const dados: Prisma.checklist_atividades_osCreateManyInput[] = [];

    // Todos os vínculos (SN-86): a instrução avulsa (da anomalia, da solicitação ou
    // acrescentada) não tem tarefa, e antes ficava de fora — a corretiva nascia sem checklist
    const vinculos = await prisma.tarefas_os.findMany({
      where: { os_id: osId },
      orderBy: { ordem: 'asc' },
      select: { id: true, tarefa_id: true, instrucao_id: true, nome_snapshot: true, instrucao_nome: true },
    });

    // As tarefas vêm numa consulta à parte, pelo id sem espaço. Pelo include
    // da relação, `tarefas_os.tarefa_id` (Char(26), com padding) contra
    // `tarefas.id` (VarChar(26)) volta NULO para ids de 25 caracteres — o
    // Prisma compara em JS —, e a OS nascia só com os itens gerais, sem as
    // sub-instruções das tarefas.
    const idsDasTarefas = vinculos.map((v) => v.tarefa_id?.trim()).filter((id): id is string => !!id);
    const tarefasBase: Array<{ id: string; nome: string; instrucao_id: string | null; instrucao: { nome: string } | null }> =
      idsDasTarefas.length
        ? await prisma.tarefas.findMany({
            where: { id: { in: variantesDeIds(idsDasTarefas) } },
            select: { id: true, nome: true, instrucao_id: true, instrucao: { select: { nome: true } } },
          })
        : [];

    // Mesma armadilha um nível abaixo: `sub_instrucoes.instrucao_id` é Char(26)
    // e `instrucoes.id` é VarChar(26). Pelo include, instrução de id com 25
    // caracteres vinha com a lista de sub-instruções VAZIA.
    const idsDasInstrucoes = [
      ...new Set(
        [...tarefasBase.map((t) => t.instrucao_id), ...vinculos.map((v) => v.instrucao_id)]
          .map((id) => id?.trim())
          .filter(Boolean) as string[],
      ),
    ];
    const subs = idsDasInstrucoes.length
      ? await prisma.sub_instrucoes.findMany({
          where: { instrucao_id: { in: variantesDeIds(idsDasInstrucoes) } },
          orderBy: { ordem: 'asc' },
          select: {
            instrucao_id: true,
            descricao: true,
            obrigatoria: true,
            duracao_horas: true,
            registro: true,
            unidade: true,
            valor_minimo: true,
            valor_maximo: true,
            exige_foto: true,
          },
        })
      : [];
    const subsPorInstrucao = new Map<string, typeof subs>();
    for (const s of subs) {
      const chave = s.instrucao_id.trim();
      subsPorInstrucao.set(chave, [...(subsPorInstrucao.get(chave) ?? []), s]);
    }

    const tarefaPorId = new Map(
      tarefasBase.map((t) => [
        t.id.trim(),
        {
          nome: t.nome,
          instrucao: t.instrucao
            ? { nome: t.instrucao.nome, sub_instrucoes: subsPorInstrucao.get(t.instrucao_id?.trim() ?? '') ?? [] }
            : null,
        },
      ]),
    );
    const tarefasDaOS = vinculos.map((v) => ({ ...v, tarefa: v.tarefa_id ? (tarefaPorId.get(v.tarefa_id.trim()) ?? null) : null }));

    let ordem = 1;
    for (const vinculo of tarefasDaOS) {
      // A avulsa (SN-86) traz a instrução no vínculo; a linha de tarefa, pela tarefa
      const subInstrucoes = vinculo.instrucao_id
        ? (subsPorInstrucao.get(vinculo.instrucao_id.trim()) ?? [])
        : (vinculo.tarefa?.instrucao?.sub_instrucoes ?? []);
      if (subInstrucoes.length === 0) continue;

      // Prefixo identifica a que tarefa cada etapa pertence quando a OS junta
      // varias tarefas — que e o caso comum.
      const rotulo =
        vinculo.nome_snapshot ||
        vinculo.tarefa?.nome ||
        vinculo.instrucao_nome ||
        vinculo.tarefa?.instrucao?.nome ||
        'Tarefa';

      for (const sub of subInstrucoes) {
        dados.push({
          os_id: osId,
          atividade: `${rotulo}: ${sub.descricao}`.slice(0, 500),
          ordem: ordem++,
          obrigatoria: sub.obrigatoria ?? false,
          // O item guarda minutos; o passo, horas desde o SN-85
          tempo_estimado: sub.duracao_horas == null ? null : Math.round(Number(sub.duracao_horas) * 60),
          // A tela agrupa por tarefa e exige os obrigatórios dela (D4)
          tarefa_os_id: vinculo.id,
          // A leitura congela unidade e faixa da época, como o texto (SN-58). O
          // item da OS chama de tipo o que no passo é o registro (SN-85)
          tipo: sub.registro,
          unidade: sub.unidade,
          valor_minimo: sub.valor_minimo,
          valor_maximo: sub.valor_maximo,
          // O item que exige foto só é marcado com uma foto dele (SN-59)
          exige_foto: sub.exige_foto,
        });
      }
    }

    if (dados.length === 0) return;

    await prisma.checklist_atividades_os.createMany({ data: dados });
  }

  /**
   * Percentual de itens concluidos do checklist da OS, arredondado.
   * Sem itens devolve null — 0% diria que nada foi feito, quando na verdade
   * nao havia o que fazer.
   */
  private async calcularChecklistConcluido(prisma: Prisma.TransactionClient, osId: string): Promise<number | null> {
    const [total, concluidas] = await Promise.all([
      prisma.checklist_atividades_os.count({ where: { os_id: osId } }),
      prisma.checklist_atividades_os.count({ where: { os_id: osId, concluida: true } }),
    ]);

    if (total === 0) return null;
    return Math.round((concluidas / total) * 100);
  }

  /**
   * O custo real pelo resumo do custo (SN-93): mão de obra, material, os outros
   * custos conferidos e os não previstos. Lido na transação do executar, depois
   * de gravar: antes era calculado antes dela, com as horas estimadas e o
   * consumo de material de antes do pedido. Até o SN-93, só mão de obra e material.
   */
  private calcularCustoReal(prisma: Prisma.TransactionClient, osId: string): Promise<Prisma.Decimal> {
    return custoRealDaOS(prisma, osId);
  }

  /**
   * Registra uma transicao, resolvendo o NOME de quem a fez.
   *
   * A maioria das chamadas passava 'Sistema' como autor e o `usuarioId` de
   * verdade ao lado — entao a trilha guardava quem foi, mas mostrava "Sistema"
   * em toda linha. Quem abria a OS via a sequencia de acoes sem saber de quem
   * era nenhuma delas, que e metade do motivo de existir uma trilha.
   *
   * O nome vem do id quando ha id. So o que acontece sem usuario — rotina
   * automatica — e que continua como "Sistema".
   */
  private async registrarHistorico(
    prisma: Prisma.TransactionClient,
    osId: string,
    acao: string,
    usuario: string,
    usuarioId?: string,
    observacoes?: string,
    statusAnterior?: StatusOS,
    statusNovo?: StatusOS,
  ): Promise<void> {
    // A mudança de status avisa quem precisa saber (SN-47), na mesma transação
    // do histórico: se ela desfaz, o aviso some junto
    const evento = EVENTO_DA_ACAO_DA_OS[acao];
    if (evento) await registrarNotificacao(prisma, { evento, entidade: 'ordem_servico', entidadeId: osId, atorId: usuarioId });

    let autor = usuario;

    if (usuarioId) {
      const dono = await prisma.usuarios.findUnique({
        where: { id: usuarioId.trim() },
        select: { nome: true },
      });
      if (dono?.nome) autor = dono.nome;
    }

    await prisma.historico_os.create({
      data: {
        os_id: osId,
        acao,
        usuario: autor,
        usuario_id: usuarioId,
        observacoes,
        status_anterior: statusAnterior,
        status_novo: statusNovo,
      },
    });
  }

  private async obterEstatisticas(escopo?: Prisma.ordens_servicoWhereInput): Promise<OSStatsDto> {
    const base: Prisma.ordens_servicoWhereInput = { deletado_em: null, ...(escopo && { AND: [escopo] }) };
    const stats = await this.prisma.ordens_servico.groupBy({
      by: ['status'],
      where: base,
      _count: true,
    });

    const resultado: OSStatsDto = {
      pendentes: 0,
      em_execucao: 0,
      pausadas: 0,
      executadas: 0,
      auditadas: 0,
      finalizadas: 0,
      canceladas: 0,
      atrasadas: 0,
      criticas: 0,
    };

    stats.forEach(stat => {
      switch (stat.status) {
        case StatusOS.PENDENTE:
          resultado.pendentes = stat._count;
          break;
        case StatusOS.EM_EXECUCAO:
          resultado.em_execucao = stat._count;
          break;
        case StatusOS.PAUSADA:
          resultado.pausadas = stat._count;
          break;
        case StatusOS.EXECUTADA:
          resultado.executadas = stat._count;
          break;
        case StatusOS.AUDITADA:
          resultado.auditadas = stat._count;
          break;
        case StatusOS.FINALIZADA:
          resultado.finalizadas = stat._count;
          break;
        case StatusOS.CANCELADA:
          resultado.canceladas = stat._count;
          break;
      }
    });

    // Atrasadas: abertas e com o prazo vencido, a regra do painel (`idsDasAtrasadas`)
    resultado.atrasadas = (await idsDasAtrasadas(this.prisma, base)).length;

    // Contar críticas
    resultado.criticas = await this.prisma.ordens_servico.count({
      where: {
        ...base,
        prioridade: PrioridadeOS.CRITICA,
        status: { notIn: [StatusOS.FINALIZADA, StatusOS.CANCELADA] },
      },
    });

    return resultado;
  }

  /**
   * `instalacoes` ausente é diferente de vazio: vazio significa "esta origem
   * não tem instalação" — a OS manual não tem —, e é o que a tela mostra como
   * "—". Ausente é o chamador que não apurou.
   */
  private mapearParaResponse(os: OSParaResposta, instalacoes?: Instalacao[]): OrdemServicoResponseDto {
    return {
      instalacoes,
      id: os.id,
      criado_em: os.criado_em,
      atualizado_em: os.atualizado_em,
      deletado_em: os.deletado_em,
      programacao_id: os.programacao_id,
      numero_os: os.numero_os,
      descricao: os.descricao,
      local: os.local,
      ativo: os.ativo,
      condicoes: os.condicoes,
      status: os.status,
      tipo: os.tipo,
      prioridade: os.prioridade,
      origem: os.origem,
      planta_id: os.planta_id,
      equipamento_id: os.equipamento_id,
      anomalia_id: os.anomalia_id,
      plano_manutencao_id: os.plano_manutencao_id,
      reserva_id: os.reserva_id,
      dados_origem: os.dados_origem,
      tempo_estimado: Number(os.tempo_estimado),
      duracao_estimada: Number(os.duracao_estimada),
      data_hora_programada: os.data_hora_programada,
      responsavel: os.responsavel,
      responsavel_id: os.responsavel_id,
      time_equipe: os.time_equipe,
      data_hora_inicio_real: os.data_hora_inicio_real,
      data_hora_fim_real: os.data_hora_fim_real,
      // Coluna Json, gravada só a partir de IniciarExecucaoDto.equipe_presente (string[])
      equipe_presente: os.equipe_presente as string[],
      orcamento_previsto: os.orcamento_previsto ? Number(os.orcamento_previsto) : null,
      custo_real: os.custo_real ? Number(os.custo_real) : null,
      observacoes: os.observacoes,
      observacoes_programacao: os.observacoes_programacao,
      observacoes_execucao: os.observacoes_execucao,
      motivo_cancelamento: os.motivo_cancelamento,
      resultado_servico: os.resultado_servico,
      problemas_encontrados: os.problemas_encontrados,
      // SN-60: os dados de falha
      equipamento_parou: os.equipamento_parou,
      parada_inicio: os.parada_inicio,
      parada_fim: os.parada_fim,
      minutos_parado: minutosParado(os),
      // SN-61: o HH real é a soma das horas registradas; o tempo efetivo, sem as
      // pausas (em andamento, até agora: o painel do Executar parte dele)
      ...horasDaEquipe(os.tecnicos ?? []),
      tempo_efetivo_minutos: minutosEfetivos(
        os.data_hora_inicio_real,
        os.data_hora_fim_real ?? (os.status === StatusOS.EM_EXECUCAO || os.status === StatusOS.PAUSADA ? new Date() : null),
        os.historico ?? [],
      ),
      falha_sintoma: os.falha_sintoma,
      falha_causa: os.falha_causa,
      falha_acao: os.falha_acao,
      recomendacoes: os.recomendacoes,
      proxima_manutencao: os.proxima_manutencao,
      avaliacao_qualidade: os.avaliacao_qualidade,
      observacoes_qualidade: os.observacoes_qualidade,
      // Detalhes da execução
      atividades_realizadas: os.atividades_realizadas,
      checklist_concluido: os.checklist_concluido,
      procedimentos_seguidos: os.procedimentos_seguidos,
      equipamentos_seguranca: os.equipamentos_seguranca,
      incidentes_seguranca: os.incidentes_seguranca,
      medidas_seguranca_adicionais: os.medidas_seguranca_adicionais,
      custos_adicionais: os.custos_adicionais ? Number(os.custos_adicionais) : null,
      // Sem `filter(to => to.tarefa)`: descartar o vínculo por causa da tarefa
      // viva esvaziava a OS inteira nos dois casos que o congelamento existe
      // para cobrir — cópia do plano apagada, e id de 25 chars que não casa com
      // o Char(26) do FK. A OS ficava sem checklist e o card de origem sem
      // nada a dizer.
      tarefas_os: os.tarefas_os?.map((to) => ({
        id: to.id,
        os_id: to.os_id,
        tarefa_id: to.tarefa_id,
        ordem: to.ordem,
        status: to.status,
        data_conclusao: to.data_conclusao,
        concluida_por: to.concluida_por,
        observacoes: to.observacoes,
        created_at: to.created_at,
        updated_at: to.updated_at,
        // O que foi PEDIDO, congelado na geração da OS. É a fonte da tela.
        nome_snapshot: to.nome_snapshot,
        criticidade_snapshot: to.criticidade_snapshot,
        frequencia_snapshot: to.frequencia_snapshot,
        instrucao_tag: to.instrucao_tag,
        instrucao_nome: to.instrucao_nome,
        instrucao_descricao: to.instrucao_descricao,
        // Ponte para a instrução e para o plano: o congelamento guarda o nome
        // e a descrição do que foi pedido, mas não os ids — e é o id que abre
        // o sheet da instrução com etapas, recursos e anexos.
        // A do código congelado (`instrucoesDasLinhas`, no detalhe): a tarefa de hoje pode ter trocado de
        // instrução, e o atalho abria uma enquanto o custo mostrava o valor da outra
        instrucao_id: to.instrucao_id?.trim() || to.instrucao_da_linha || to.tarefa?.instrucao_id?.trim() || null,
        // SN-86: TAREFA ou INSTRUCAO (a avulsa, sem tarefa)
        origem_item: to.origem_item,
        // SN-93: o valor da instrução nesta OS e o equipamento congelado
        valor: to.valor === null ? null : Number(to.valor),
        valor_original: to.valor_original === null ? null : Number(to.valor_original),
        equipamento_nome: to.equipamento_nome?.trim() || null,
        plano_id: to.tarefa?.plano_manutencao?.id ?? null,
        plano_nome: to.tarefa?.plano_manutencao?.nome ?? null,
        // Só id e nome: `categoria` e `tipo_manutencao` foram droppadas da
        // tabela `tarefas` no PR6 e saíam `undefined` daqui. O conteúdo da
        // época está nos campos `*_snapshot` acima; o atual, na instrução que
        // `instrucao_id` abre.
        tarefa: to.tarefa
          ? {
              id: to.tarefa.id,
              nome: to.tarefa.nome,
            }
          : null,
      })) || [],
      materiais: os.materiais?.map((m) => ({
        id: m.id,
        os_id: m.os_id,
        descricao: m.descricao,
        quantidade_planejada: Number(m.quantidade_planejada),
        quantidade_consumida: m.quantidade_consumida ? Number(m.quantidade_consumida) : null,
        unidade: m.unidade,
        custo_unitario: m.custo_unitario ? Number(m.custo_unitario) : null,
        custo_total: m.custo_total ? Number(m.custo_total) : null,
        confirmado: m.confirmado,
        disponivel: m.disponivel,
        observacoes: m.observacoes,
        created_at: m.created_at,
        updated_at: m.updated_at,
      })) || [],
      ferramentas: os.ferramentas?.map((f) => ({
        id: f.id,
        os_id: f.os_id,
        descricao: f.descricao,
        quantidade: Number(f.quantidade),
        confirmada: f.confirmada,
        disponivel: f.disponivel,
        utilizada: f.utilizada,
        condicao_antes: f.condicao_antes,
        condicao_depois: f.condicao_depois,
        observacoes: f.observacoes,
        created_at: f.created_at,
        updated_at: f.updated_at,
      })) || [],
      tecnicos: os.tecnicos?.map((t) => ({
        id: t.id,
        os_id: t.os_id,
        nome: t.nome,
        especialidade: t.especialidade,
        horas_estimadas: Number(t.horas_estimadas),
        horas_trabalhadas: t.horas_trabalhadas ? Number(t.horas_trabalhadas) : null,
        custo_hora: t.custo_hora ? Number(t.custo_hora) : null,
        custo_total: t.custo_total ? Number(t.custo_total) : null,
        disponivel: t.disponivel,
        presente: t.presente,
        tecnico_id: t.tecnico_id,
        created_at: t.created_at,
        updated_at: t.updated_at,
      })) || [],
      criado_por: os.criado_por,
      criado_por_id: os.criado_por_id,
      programado_por: os.programado_por,
      programado_por_id: os.programado_por_id,
      finalizado_por: os.finalizado_por,
      finalizado_por_id: os.finalizado_por_id,
      // SN-62: quando foi finalizada e o código do PDF (o conteúdo vem pelo relatório)
      finalizada_em: os.finalizada_em,
      codigo_verificacao: os.codigo_verificacao?.trim() || null,
      aprovado_por: os.aprovado_por,
      aprovado_por_id: os.aprovado_por_id,
      data_aprovacao: os.data_aprovacao,
      // Relacionamentos expandidos
      programacao: os.programacao,
      anomalia: os.anomalia,
      plano_manutencao: os.plano_manutencao,
      // solicitacao_servico não existe no schema
      planta: os.planta,
      equipamento: os.equipamento,
      reserva_veiculo: os.reserva_veiculo,
    };
  }

  private mapearParaDetalhes(os: OSComDetalhes, instalacoes?: Instalacao[]): OrdemServicoDetalhesResponseDto {
    const base = this.mapearParaResponse(os, instalacoes);

    return {
      ...base,
      programacao_origem: os.programacao,
      solicitacao_servico: os.programacao?.solicitacao_servico || undefined,
      materiais: os.materiais?.map((m) => ({
        id: m.id,
        os_id: m.os_id,
        descricao: m.descricao,
        quantidade_planejada: Number(m.quantidade_planejada),
        quantidade_consumida: m.quantidade_consumida ? Number(m.quantidade_consumida) : null,
        unidade: m.unidade,
        custo_unitario: m.custo_unitario ? Number(m.custo_unitario) : null,
        custo_total: m.custo_total ? Number(m.custo_total) : null,
        confirmado: m.confirmado,
        disponivel: m.disponivel,
        observacoes: m.observacoes,
        created_at: m.created_at,
        updated_at: m.updated_at,
      })) || [],
      ferramentas: os.ferramentas?.map((f) => ({
        id: f.id,
        os_id: f.os_id,
        descricao: f.descricao,
        quantidade: Number(f.quantidade),
        confirmada: f.confirmada,
        disponivel: f.disponivel,
        utilizada: f.utilizada,
        condicao_antes: f.condicao_antes,
        condicao_depois: f.condicao_depois,
        observacoes: f.observacoes,
        created_at: f.created_at,
        updated_at: f.updated_at,
      })) || [],
      itens_orcamento: os.itens_orcamento?.map((i) => ({
        id: i.id,
        os_id: i.os_id,
        descricao: i.descricao,
        valor: Number(i.valor),
        natureza: naturezaDoItem(i.natureza),
        valor_real: i.valor_real === null ? null : Number(i.valor_real),
        nao_previsto: i.nao_previsto,
        created_at: i.created_at,
        updated_at: i.updated_at,
      })) || [],
      tecnicos: os.tecnicos?.map((t) => ({
        id: t.id,
        os_id: t.os_id,
        nome: t.nome,
        especialidade: t.especialidade,
        horas_estimadas: Number(t.horas_estimadas),
        horas_trabalhadas: t.horas_trabalhadas ? Number(t.horas_trabalhadas) : null,
        custo_hora: t.custo_hora ? Number(t.custo_hora) : null,
        custo_total: t.custo_total ? Number(t.custo_total) : null,
        disponivel: t.disponivel,
        presente: t.presente,
        tecnico_id: t.tecnico_id,
        created_at: t.created_at,
        updated_at: t.updated_at,
      })) || [],
      checklist: os.checklist_atividades?.map((c) => ({
        id: c.id,
        os_id: c.os_id,
        atividade: c.atividade,
        ordem: c.ordem,
        concluida: c.concluida,
        obrigatoria: c.obrigatoria,
        tempo_estimado: c.tempo_estimado,
        observacoes: c.observacoes,
        concluida_em: c.concluida_em,
        concluida_por: c.concluida_por,
        concluida_por_id: c.concluida_por_id,
        tarefa_os_id: c.tarefa_os_id ?? null,
        ...leituraDoItem(c),
        exige_foto: c.exige_foto,
        created_at: c.created_at,
        updated_at: c.updated_at,
      })) || [],
      anexos: os.anexos?.map(anexoParaResposta) || [],
      registros_tempo: os.registros_tempo?.map((r) => ({
        id: r.id,
        os_id: r.os_id,
        tecnico_id: r.tecnico_id,
        tecnico_nome: r.tecnico_nome,
        // Eram data_inicio/hora_inicio/data_fim/hora_fim, que não existem na
        // tabela: saíam sempre vazios (SN-36)
        data_hora_inicio: r.data_hora_inicio,
        data_hora_fim: r.data_hora_fim,
        tempo_total: r.tempo_total,
        atividade: r.atividade,
        observacoes: r.observacoes,
        pausas: r.pausas,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })) || [],
      reserva_veiculo: os.reserva_veiculo ? {
        id: os.reserva_veiculo.id,
        veiculo_id: os.reserva_veiculo.veiculo_id,
        veiculo: os.reserva_veiculo.veiculo,
        solicitante_id: os.reserva_veiculo.solicitante_id,
        tipo_solicitante: os.reserva_veiculo.tipo_solicitante,
        data_inicio: os.reserva_veiculo.data_inicio,
        data_fim: os.reserva_veiculo.data_fim,
        hora_inicio: os.reserva_veiculo.hora_inicio,
        hora_fim: os.reserva_veiculo.hora_fim,
        responsavel: os.reserva_veiculo.responsavel,
        responsavel_id: os.reserva_veiculo.responsavel_id,
        finalidade: os.reserva_veiculo.finalidade,
        status: os.reserva_veiculo.status,
        km_inicial: os.reserva_veiculo.km_inicial,
        km_final: os.reserva_veiculo.km_final,
        observacoes: os.reserva_veiculo.observacoes,
        criado_em: os.reserva_veiculo.criado_em,
        atualizado_em: os.reserva_veiculo.atualizado_em,
      } : undefined,
      historico: os.historico?.map((h) => ({
        id: h.id,
        os_id: h.os_id,
        acao: h.acao,
        usuario: h.usuario,
        usuario_id: h.usuario_id,
        data: h.data,
        observacoes: h.observacoes,
        status_anterior: h.status_anterior,
        status_novo: h.status_novo,
        dados_extras: h.dados_extras,
      })) || [],
    };
  }
}