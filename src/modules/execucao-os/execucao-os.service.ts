import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AnomaliasService } from '../anomalias/anomalias.service';
import { StatusAnomalia } from '../anomalias/dto/create-anomalia.dto';
import {
  OSFiltersDto,
  ProgramarOSDto,
  IniciarExecucaoDto,
  PausarExecucaoDto,
  RetomarExecucaoDto,
  AtualizarChecklistDto,
  RegistrarMateriaisDto,
  RegistrarFerramentasDto,
  ConcluirTarefaDto,
  CancelarTarefaDto,
  FinalizarOSDto,
  CancelarOSDto,
  OrdemServicoResponseDto,
  OrdemServicoDetalhesResponseDto,
  ListarOSResponseDto,
} from './dto';
import { StatusOS, Prisma } from '@prisma/client';

@Injectable()
export class ExecucaoOSService {
  private readonly logger = new Logger(ExecucaoOSService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anomaliasService: AnomaliasService,
  ) {}

  async listar(filters: OSFiltersDto): Promise<ListarOSResponseDto> {
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
      sortBy = 'data_hora_programada',
      sortOrder = 'asc',
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

    if (planta_id) {
      where.planta_id = planta_id;
    }

    if (data_inicio || data_fim) {
      where.data_hora_programada = {};
      if (data_inicio) {
        where.data_hora_programada.gte = new Date(data_inicio);
      }
      if (data_fim) {
        where.data_hora_programada.lte = new Date(data_fim);
      }
    }

    if (atrasadas) {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      where.AND = [
        { data_hora_programada: { lt: hoje } },
        { status: { notIn: [StatusOS.FINALIZADA, StatusOS.CANCELADA] } },
      ];
    }

    // Contar total
    const total = await this.prisma.ordens_servico.count({ where });

    // Buscar dados
    const ordens = await this.prisma.ordens_servico.findMany({
      where,
      include: {
        tarefas_os: {
          include: {
            tarefa: true,
          },
        },
        materiais: true,
        ferramentas: true,
        tecnicos: true,
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
              select: {
                id: true,
                placa: true,
                modelo: true,
                marca: true,
              },
            },
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
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

      // Buscar reserva_veiculo se o ID existir mas a relação não veio
      if (ordem.reserva_id && !ordem.reserva_veiculo) {
        const reservaId = ordem.reserva_id.trim();
        if (reservaId) {
          ordem.reserva_veiculo = await this.prisma.reserva_veiculo.findUnique({
            where: { id: reservaId },
            include: {
              veiculo: {
                select: {
                  id: true,
                  placa: true,
                  modelo: true,
                  marca: true,
                },
              },
            },
          });
        }
      }
    }

    // Buscar estatísticas
    const stats = await this.obterEstatisticas();

    return {
      data: ordens.map(ordem => this.mapearParaResponse(ordem)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats,
    };
  }

  async buscarPorId(id: string): Promise<OrdemServicoDetalhesResponseDto> {
    const os = await this.prisma.ordens_servico.findFirst({
      where: {
        id,
        deletado_em: null,
      },
      include: {
        programacao: true,
        tarefas_os: {
          include: {
            tarefa: {
              select: {
                id: true,
                nome: true,
                categoria: true,
                tipo_manutencao: true,
              },
            },
          },
          // ✅ CORREÇÃO: Filtrar tarefas com tarefa_id válido
          where: {
            tarefa_id: {
              not: null,
            },
          },
        },
        materiais: true,
        ferramentas: true,
        tecnicos: true,
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
              select: {
                id: true,
                placa: true,
                modelo: true,
                marca: true,
              },
            },
          },
        },
      },
    });

    if (!os) {
      throw new NotFoundException('Ordem de serviço não encontrada');
    }

    return this.mapearParaDetalhes(os);
  }

  async programar(id: string, dto: ProgramarOSDto, usuarioId?: string): Promise<void> {
    const os = await this.buscarPorId(id);

    if (os.status !== StatusOS.PLANEJADA) {
      throw new ConflictException('Apenas OS planejadas podem ser programadas');
    }

    await this.prisma.$transaction(async (prisma) => {
      // Atualizar OS
      await prisma.ordens_servico.update({
        where: { id },
        data: {
          status: StatusOS.PROGRAMADA,
          data_hora_programada: new Date(dto.data_hora_programada),
          responsavel: dto.responsavel,
          responsavel_id: dto.responsavel_id,
          time_equipe: dto.time_equipe,
          observacoes_programacao: dto.observacoes_programacao,
          programado_por_id: usuarioId,
        },
      });

      // Confirmar materiais
      if (dto.materiais_confirmados && dto.materiais_confirmados.length > 0) {
        await prisma.materiais_os.updateMany({
          where: {
            os_id: id,
            id: { in: dto.materiais_confirmados },
          },
          data: { confirmado: true },
        });
      }

      // Confirmar ferramentas
      if (dto.ferramentas_confirmadas && dto.ferramentas_confirmadas.length > 0) {
        await prisma.ferramentas_os.updateMany({
          where: {
            os_id: id,
            id: { in: dto.ferramentas_confirmadas },
          },
          data: { confirmada: true },
        });
      }

      // Confirmar técnicos
      if (dto.tecnicos_confirmados && dto.tecnicos_confirmados.length > 0) {
        await prisma.tecnicos_os.updateMany({
          where: {
            os_id: id,
            id: { in: dto.tecnicos_confirmados },
          },
          data: { disponivel: true },
        });
      }

      // Criar reserva de veículo se necessário
      if (dto.reserva_veiculo) {
        const reserva = await prisma.reserva_veiculo.create({
          data: {
            veiculo_id: dto.reserva_veiculo.veiculo_id,
            solicitante_id: id,
            tipo_solicitante: 'ordem_servico',
            data_inicio: new Date(dto.reserva_veiculo.data_inicio),
            data_fim: new Date(dto.reserva_veiculo.data_fim),
            hora_inicio: dto.reserva_veiculo.hora_inicio,
            hora_fim: dto.reserva_veiculo.hora_fim,
            responsavel: dto.responsavel,
            responsavel_id: dto.responsavel_id,
            finalidade: dto.reserva_veiculo.finalidade,
            status: 'ativa',
            km_inicial: dto.reserva_veiculo.km_inicial,
            criado_por_id: usuarioId,
          },
        });

        // Atualizar OS com o reserva_id para estabelecer a relação
        await prisma.ordens_servico.update({
          where: { id },
          data: { reserva_id: reserva.id },
        });
      }

      // Gerar checklist padrão se não existir
      await this.gerarChecklistPadrao(prisma, id);

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        id,
        'PROGRAMACAO',
        'Sistema',
        usuarioId,
        'OS programada com recursos confirmados',
        StatusOS.PLANEJADA,
        StatusOS.PROGRAMADA,
      );
    });
  }

  /**
   * ✅ Cria uma ordem de serviço (execução) a partir de uma programação APROVADA
   * @param programacaoId - ID da programação aprovada
   * @param dto - Dados para iniciar a execução
   * @param usuarioId - ID do usuário que está iniciando
   * @returns ID da ordem de serviço criada
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
      const numeroOS = await this.gerarNumeroOS(prisma);

      // Criar ordem de serviço
      const os = await prisma.ordens_servico.create({
        data: {
          programacao_id: programacaoId,
          numero_os: numeroOS,
          descricao: programacao.descricao,
          local: programacao.local || '',
          ativo: programacao.ativo || '',
          condicoes: programacao.condicoes,
          status: StatusOS.EM_EXECUCAO,
          tipo: programacao.tipo,
          prioridade: programacao.prioridade,
          origem: programacao.origem,
          planta_id: programacao.planta_id,
          equipamento_id: programacao.equipamento_id,
          anomalia_id: programacao.anomalia_id,
          plano_manutencao_id: programacao.plano_manutencao_id,
          reserva_id: programacao.reserva_id,
          dados_origem: programacao.dados_origem as any,
          tempo_estimado: programacao.tempo_estimado,
          duracao_estimada: programacao.duracao_estimada,
          responsavel: dto.responsavel_execucao || programacao.responsavel,
          responsavel_id: programacao.responsavel_id,
          time_equipe: programacao.time_equipe,
          data_hora_programada: programacao.data_hora_programada,
          data_hora_inicio_real: dataHoraInicio,
          equipe_presente: dto.equipe_presente as any,
          orcamento_previsto: programacao.orcamento_previsto,
          observacoes: programacao.observacoes,
          observacoes_programacao: programacao.observacoes_programacao,
          observacoes_execucao: dto.observacoes_inicio,
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

      // Copiar tarefas
      if (programacao.tarefas_programacao.length > 0) {
        await prisma.tarefas_os.createMany({
          data: programacao.tarefas_programacao.map(tp => ({
            os_id: osId,
            tarefa_id: tp.tarefa_id,
            ordem: tp.ordem,
            status: 'PENDENTE',
            observacoes: tp.observacoes,
          })),
        });
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
          observacoes: dto.observacoes_inicio,
        },
      });

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        osId,
        'INICIO_EXECUCAO',
        dto.responsavel_execucao,
        usuarioId,
        `Execução iniciada a partir da programação ${programacao.codigo}. Equipe: ${dto.equipe_presente.join(', ')}`,
        undefined,
        StatusOS.EM_EXECUCAO,
      );
    });

    return { os_id: osId! };
  }

  /**
   * ⚠️ DEPRECATED - Use iniciarDeProgramacao para criar OS a partir de programação
   * Este método só atualiza uma OS já existente
   */
  async iniciar(id: string, dto: IniciarExecucaoDto, usuarioId?: string): Promise<void> {
    const os = await this.buscarPorId(id);

    if (os.status !== StatusOS.PROGRAMADA) {
      throw new ConflictException('Apenas OS programadas podem ser iniciadas');
    }

    const dataHoraInicio = dto.data_hora_inicio_real ? new Date(dto.data_hora_inicio_real) : new Date();

    await this.prisma.$transaction(async (prisma) => {
      // Atualizar OS
      await prisma.ordens_servico.update({
        where: { id },
        data: {
          status: StatusOS.EM_EXECUCAO,
          data_hora_inicio_real: dataHoraInicio,
          equipe_presente: dto.equipe_presente as any,
          observacoes_execucao: dto.observacoes_inicio,
        },
      });

      // Criar registro de tempo inicial
      await prisma.registros_tempo_os.create({
        data: {
          os_id: id,
          tecnico_nome: dto.responsavel_execucao,
          data_hora_inicio: dataHoraInicio,
          atividade: 'Início da execução',
          observacoes: dto.observacoes_inicio,
        },
      });

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        id,
        'INICIO_EXECUCAO',
        dto.responsavel_execucao,
        usuarioId,
        `Execução iniciada. Equipe: ${dto.equipe_presente.join(', ')}`,
        StatusOS.PROGRAMADA,
        StatusOS.EM_EXECUCAO,
      );
    });
  }

  /**
   * Gera um número sequencial único para a OS
   */
  private async gerarNumeroOS(prisma: any): Promise<string> {
    const ano = new Date().getFullYear();
    const ultimaOS = await prisma.ordens_servico.findFirst({
      where: {
        numero_os: { startsWith: `OS-${ano}-` },
      },
      orderBy: { numero_os: 'desc' },
    });

    let proximoNumero = 1;
    if (ultimaOS) {
      const match = ultimaOS.numero_os.match(/OS-\d{4}-(\d+)/);
      if (match) {
        proximoNumero = parseInt(match[1], 10) + 1;
      }
    }

    return `OS-${ano}-${String(proximoNumero).padStart(5, '0')}`;
  }

  async pausar(id: string, dto: PausarExecucaoDto, usuarioId?: string): Promise<void> {
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

  async retomar(id: string, dto: RetomarExecucaoDto, usuarioId?: string): Promise<void> {
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

  async atualizarChecklist(id: string, dto: AtualizarChecklistDto, usuarioId?: string): Promise<void> {
    await this.buscarPorId(id); // Verificar se existe

    await this.prisma.$transaction(async (prisma) => {
      for (const atividade of dto.atividades) {
        await prisma.checklist_atividades_os.update({
          where: { id: atividade.id },
          data: {
            concluida: atividade.concluida,
            observacoes: atividade.observacoes,
            concluida_em: atividade.concluida ? new Date() : null,
            concluida_por_id: atividade.concluida ? usuarioId : null,
          },
        });
      }

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        id,
        'ATUALIZACAO_CHECKLIST',
        'Sistema',
        usuarioId,
        `Checklist atualizado: ${dto.atividades.length} atividade(s)`,
      );
    });
  }

  async registrarMateriais(id: string, dto: RegistrarMateriaisDto, usuarioId?: string): Promise<void> {
    await this.buscarPorId(id); // Verificar se existe

    await this.prisma.$transaction(async (prisma) => {
      for (const material of dto.materiais) {
        await prisma.materiais_os.update({
          where: { id: material.id },
          data: {
            quantidade_consumida: material.quantidade_consumida,
            observacoes: material.observacoes,
          },
        });
      }

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        id,
        'CONSUMO_MATERIAIS',
        'Sistema',
        usuarioId,
        `Consumo registrado: ${dto.materiais.length} material(is)`,
      );
    });
  }

  async registrarFerramentas(id: string, dto: RegistrarFerramentasDto, usuarioId?: string): Promise<void> {
    await this.buscarPorId(id); // Verificar se existe

    await this.prisma.$transaction(async (prisma) => {
      for (const ferramenta of dto.ferramentas) {
        await prisma.ferramentas_os.update({
          where: { id: ferramenta.id },
          data: {
            utilizada: ferramenta.utilizada,
            condicao_antes: ferramenta.condicao_antes,
            condicao_depois: ferramenta.condicao_depois,
            observacoes: ferramenta.observacoes,
          },
        });
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

  async concluirTarefa(id: string, tarefaId: string, dto: ConcluirTarefaDto, usuarioId?: string): Promise<void> {
    await this.buscarPorId(id); // Verificar se existe

    const tarefa = await this.prisma.tarefas_os.findFirst({
      where: {
        os_id: id,
        tarefa_id: tarefaId,
      },
      include: { tarefa: true },
    });

    if (!tarefa) {
      throw new NotFoundException('Tarefa não encontrada na OS');
    }

    await this.prisma.$transaction(async (prisma) => {
      // Atualizar tarefa
      await prisma.tarefas_os.update({
        where: { id: tarefa.id },
        data: {
          status: 'CONCLUIDA',
          data_conclusao: new Date(),
          concluida_por: dto.concluida_por || 'Sistema',
          observacoes: dto.observacoes,
        },
      });

      // Registrar tempo se fornecido
      if (dto.tempo_execucao) {
        await prisma.registros_tempo_os.create({
          data: {
            os_id: id,
            tecnico_nome: dto.concluida_por || 'Sistema',
            data_hora_inicio: new Date(),
            tempo_total: dto.tempo_execucao,
            atividade: `Execução da tarefa: ${tarefa.tarefa.nome}`,
            observacoes: dto.observacoes,
          },
        });
      }

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        id,
        'CONCLUSAO_TAREFA',
        dto.concluida_por || 'Sistema',
        usuarioId,
        `Tarefa concluída: ${tarefa.tarefa.nome}. ${dto.problemas_encontrados ? `Problemas: ${dto.problemas_encontrados}` : ''}`,
      );
    });
  }

  async cancelarTarefa(id: string, tarefaId: string, dto: CancelarTarefaDto, usuarioId?: string): Promise<void> {
    await this.buscarPorId(id); // Verificar se existe

    const tarefa = await this.prisma.tarefas_os.findFirst({
      where: {
        os_id: id,
        tarefa_id: tarefaId,
      },
      include: { tarefa: true },
    });

    if (!tarefa) {
      throw new NotFoundException('Tarefa não encontrada na OS');
    }

    await this.prisma.$transaction(async (prisma) => {
      // Atualizar tarefa
      await prisma.tarefas_os.update({
        where: { id: tarefa.id },
        data: {
          status: 'CANCELADA',
          observacoes: `${dto.motivo_cancelamento}. ${dto.observacoes || ''}`,
        },
      });

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        id,
        'CANCELAMENTO_TAREFA',
        'Sistema',
        usuarioId,
        `Tarefa cancelada: ${tarefa.tarefa.nome}. Motivo: ${dto.motivo_cancelamento}`,
      );
    });
  }

  async finalizar(id: string, dto: FinalizarOSDto, usuarioId?: string): Promise<void> {
    const os = await this.buscarPorId(id);

    if (os.status !== StatusOS.EM_EXECUCAO && os.status !== StatusOS.PAUSADA) {
      throw new ConflictException('Apenas OS em execução ou pausadas podem ser finalizadas');
    }

    const dataHoraFim = dto.data_hora_fim_real ? new Date(dto.data_hora_fim_real) : new Date();

    // Calcular tempo real de execução
    const tempoRealExecucao = this.calcularTempoExecucao(
      os.data_hora_inicio_real ? new Date(os.data_hora_inicio_real) : null,
      dataHoraFim
    );

    // Calcular custo real
    const custoReal = await this.calcularCustoReal(id, dto);

    await this.prisma.$transaction(async (prisma) => {
      // Atualizar OS
      await prisma.ordens_servico.update({
        where: { id },
        data: {
          status: StatusOS.FINALIZADA,
          data_hora_fim_real: dataHoraFim,
          custo_real: custoReal,
          resultado_servico: dto.resultado_servico,
          problemas_encontrados: dto.problemas_encontrados,
          recomendacoes: dto.recomendacoes,
          proxima_manutencao: dto.proxima_manutencao,
          avaliacao_qualidade: dto.avaliacao_qualidade,
          observacoes_qualidade: dto.observacoes_qualidade,
          // Novos campos adicionados
          atividades_realizadas: dto.atividades_realizadas,
          checklist_concluido: dto.checklist_concluido,
          procedimentos_seguidos: dto.procedimentos_seguidos,
          equipamentos_seguranca: dto.equipamentos_seguranca,
          incidentes_seguranca: dto.incidentes_seguranca,
          medidas_seguranca_adicionais: dto.medidas_seguranca_adicionais,
          custos_adicionais: dto.custos_adicionais,
          finalizado_por_id: usuarioId,
        },
      });

      // Atualizar materiais consumidos finais
      if (dto.materiais_consumidos && dto.materiais_consumidos.length > 0) {
        for (const material of dto.materiais_consumidos) {
          await prisma.materiais_os.update({
            where: { id: material.id },
            data: {
              quantidade_consumida: material.quantidade_consumida,
              observacoes: material.observacoes,
            },
          });
        }
      }

      // Atualizar ferramentas utilizadas finais
      if (dto.ferramentas_utilizadas && dto.ferramentas_utilizadas.length > 0) {
        for (const ferramenta of dto.ferramentas_utilizadas) {
          await prisma.ferramentas_os.update({
            where: { id: ferramenta.id },
            data: {
              condicao_depois: ferramenta.condicao_depois,
              observacoes: ferramenta.observacoes,
              utilizada: true,
            },
          });
        }
      }

      // ✅ Finalizar reserva de veículo se existir
      if (os.reserva_id) {
        const reservaId = os.reserva_id.trim();
        const reserva = await prisma.reserva_veiculo.findUnique({
          where: { id: reservaId },
        });

        if (reserva && reserva.status === 'ativa') {
          await prisma.reserva_veiculo.update({
            where: { id: reservaId },
            data: {
              status: 'finalizada',
              km_final: dto.km_final,
              observacoes_finalizacao: dto.observacoes_veiculo,
              data_finalizacao: dataHoraFim,
              finalizado_por_id: usuarioId,
            },
          });
        }
      }

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        id,
        'FINALIZACAO',
        'Sistema',
        usuarioId,
        `OS finalizada. Qualidade: ${dto.avaliacao_qualidade}/5. ${dto.resultado_servico}`,
        os.status,
        StatusOS.FINALIZADA,
      );

      // ✅ NOVO: Atualizar status da anomalia para RESOLVIDA
      if (os.anomalia_id) {
        try {
          const observacoes = `OS ${os.numero_os} finalizada com sucesso. ` +
            `Resultado: ${dto.resultado_servico}. ` +
            `Qualidade: ${dto.avaliacao_qualidade}/5`;

          await this.anomaliasService.resolver(
            os.anomalia_id,
            observacoes,
            usuarioId
          );
          this.logger.log(`Anomalia ${os.anomalia_id} marcada como RESOLVIDA após finalização da OS`);
        } catch (error) {
          this.logger.warn(`Erro ao atualizar status da anomalia: ${error.message}`);
          // Não interromper o fluxo se houver erro
        }
      }
    });
  }

  async cancelar(id: string, dto: CancelarOSDto, usuarioId?: string): Promise<void> {
    const os = await this.buscarPorId(id);

    if (os.status === StatusOS.FINALIZADA) {
      throw new ConflictException('OS finalizada não pode ser cancelada');
    }

    const statusAnterior = os.status;

    await this.prisma.$transaction(async (prisma) => {
      // Atualizar OS
      await prisma.ordens_servico.update({
        where: { id },
        data: {
          status: StatusOS.CANCELADA,
          motivo_cancelamento: dto.motivo_cancelamento,
        },
      });

      // ✅ Cancelar reserva de veículo se existir
      if (os.reserva_id) {
        const reservaId = os.reserva_id.trim();
        const reserva = await prisma.reserva_veiculo.findUnique({
          where: { id: reservaId },
        });

        if (reserva && reserva.status === 'ativa') {
          await prisma.reserva_veiculo.update({
            where: { id: reservaId },
            data: {
              status: 'cancelada',
              motivo_cancelamento: dto.motivo_cancelamento,
              data_cancelamento: new Date(),
              cancelado_por_id: usuarioId,
            },
          });
        }
      }

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        id,
        'CANCELAMENTO',
        'Sistema',
        usuarioId,
        `${dto.motivo_cancelamento}. ${dto.observacoes || ''}`,
        statusAnterior,
        StatusOS.CANCELADA,
      );

      // ✅ NOVO: Se tiver anomalia vinculada, retornar para AGUARDANDO
      if (os.anomalia_id) {
        try {
          await this.anomaliasService.update(
            os.anomalia_id,
            { status: StatusAnomalia.AGUARDANDO },
            usuarioId
          );
          this.logger.log(`Anomalia ${os.anomalia_id} retornada para AGUARDANDO após cancelamento da OS`);
        } catch (error) {
          this.logger.warn(`Erro ao atualizar status da anomalia: ${error.message}`);
          // Não interromper o fluxo se houver erro
        }
      }
    });
  }

  // Métodos auxiliares privados

  private async gerarChecklistPadrao(prisma: any, osId: string): Promise<void> {
    const checklistExistente = await prisma.checklist_atividades_os.count({
      where: { os_id: osId },
    });

    if (checklistExistente === 0) {
      const atividadesPadrao = [
        { atividade: 'Verificar equipamentos de segurança', ordem: 1, obrigatoria: true },
        { atividade: 'Conferir materiais e ferramentas', ordem: 2, obrigatoria: true },
        { atividade: 'Executar tarefas conforme planejado', ordem: 3, obrigatoria: true },
        { atividade: 'Testar funcionamento após execução', ordem: 4, obrigatoria: true },
        { atividade: 'Limpar área de trabalho', ordem: 5, obrigatoria: false },
        { atividade: 'Documentar resultados', ordem: 6, obrigatoria: true },
      ];

      const dados = atividadesPadrao.map(ativ => ({
        os_id: osId,
        ...ativ,
      }));

      await prisma.checklist_atividades_os.createMany({ data: dados });
    }
  }

  private calcularTempoExecucao(
    dataHoraInicio?: Date | null,
    dataHoraFim?: Date,
  ): number | null {
    if (!dataHoraInicio || !dataHoraFim) {
      return null;
    }

    return Math.round((dataHoraFim.getTime() - dataHoraInicio.getTime()) / (1000 * 60)); // em minutos
  }

  private async calcularCustoReal(osId: string, dto: FinalizarOSDto): Promise<number> {
    // Buscar materiais consumidos
    const materiais = await this.prisma.materiais_os.findMany({
      where: { os_id: osId },
    });

    // Buscar técnicos
    const tecnicos = await this.prisma.tecnicos_os.findMany({
      where: { os_id: osId },
    });

    let custoTotal = 0;

    // Calcular custo dos materiais realmente consumidos
    materiais.forEach(material => {
      if (material.custo_unitario && material.quantidade_consumida) {
        custoTotal += Number(material.custo_unitario) * Number(material.quantidade_consumida);
      }
    });

    // Calcular custo dos técnicos (usar horas trabalhadas se disponível)
    tecnicos.forEach(tecnico => {
      if (tecnico.custo_hora) {
        const horas = tecnico.horas_trabalhadas || tecnico.horas_estimadas;
        custoTotal += Number(tecnico.custo_hora) * Number(horas);
      }
    });

    return custoTotal;
  }

  private async registrarHistorico(
    prisma: any,
    osId: string,
    acao: string,
    usuario: string,
    usuarioId?: string,
    observacoes?: string,
    statusAnterior?: StatusOS,
    statusNovo?: StatusOS,
  ): Promise<void> {
    await prisma.historico_os.create({
      data: {
        os_id: osId,
        acao,
        usuario,
        usuario_id: usuarioId,
        observacoes,
        status_anterior: statusAnterior,
        status_novo: statusNovo,
      },
    });
  }

  private async obterEstatisticas(): Promise<any> {
    const stats = await this.prisma.ordens_servico.groupBy({
      by: ['status'],
      where: { deletado_em: null },
      _count: true,
    });

    const resultado = {
      planejadas: 0,
      programadas: 0,
      em_execucao: 0,
      pausadas: 0,
      finalizadas: 0,
      canceladas: 0,
    };

    stats.forEach(stat => {
      switch (stat.status) {
        case StatusOS.PLANEJADA:
          resultado.planejadas = stat._count;
          break;
        case StatusOS.PROGRAMADA:
          resultado.programadas = stat._count;
          break;
        case StatusOS.EM_EXECUCAO:
          resultado.em_execucao = stat._count;
          break;
        case StatusOS.PAUSADA:
          resultado.pausadas = stat._count;
          break;
        case StatusOS.FINALIZADA:
          resultado.finalizadas = stat._count;
          break;
        case StatusOS.CANCELADA:
          resultado.canceladas = stat._count;
          break;
      }
    });

    return resultado;
  }

  private mapearParaResponse(os: any): OrdemServicoResponseDto {
    return {
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
      equipe_presente: os.equipe_presente,
      orcamento_previsto: os.orcamento_previsto ? Number(os.orcamento_previsto) : null,
      custo_real: os.custo_real ? Number(os.custo_real) : null,
      observacoes: os.observacoes,
      observacoes_programacao: os.observacoes_programacao,
      observacoes_execucao: os.observacoes_execucao,
      motivo_cancelamento: os.motivo_cancelamento,
      resultado_servico: os.resultado_servico,
      problemas_encontrados: os.problemas_encontrados,
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
      tarefas_os: os.tarefas_os?.filter((to: any) => to.tarefa).map((to: any) => ({
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
        tarefa: {
          id: to.tarefa.id,
          nome: to.tarefa.nome,
          categoria: to.tarefa.categoria,
          tipo_manutencao: to.tarefa.tipo_manutencao,
        },
      })) || [],
      materiais: os.materiais?.map((m: any) => ({
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
      ferramentas: os.ferramentas?.map((f: any) => ({
        id: f.id,
        os_id: f.os_id,
        descricao: f.descricao,
        quantidade: f.quantidade,
        confirmada: f.confirmada,
        disponivel: f.disponivel,
        utilizada: f.utilizada,
        condicao_antes: f.condicao_antes,
        condicao_depois: f.condicao_depois,
        observacoes: f.observacoes,
        created_at: f.created_at,
        updated_at: f.updated_at,
      })) || [],
      tecnicos: os.tecnicos?.map((t: any) => ({
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
      aprovado_por: os.aprovado_por,
      aprovado_por_id: os.aprovado_por_id,
      data_aprovacao: os.data_aprovacao,
      // Relacionamentos expandidos
      programacao: os.programacao,
      anomalia: os.anomalia,
      plano_manutencao: os.plano_manutencao,
      reserva_veiculo: os.reserva_veiculo,
    };
  }

  private mapearParaDetalhes(os: any): OrdemServicoDetalhesResponseDto {
    const base = this.mapearParaResponse(os);

    return {
      ...base,
      programacao_origem: os.programacao,
      materiais: os.materiais?.map((m: any) => ({
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
      ferramentas: os.ferramentas?.map((f: any) => ({
        id: f.id,
        os_id: f.os_id,
        descricao: f.descricao,
        quantidade: f.quantidade,
        confirmada: f.confirmada,
        disponivel: f.disponivel,
        utilizada: f.utilizada,
        condicao_antes: f.condicao_antes,
        condicao_depois: f.condicao_depois,
        observacoes: f.observacoes,
        created_at: f.created_at,
        updated_at: f.updated_at,
      })) || [],
      tecnicos: os.tecnicos?.map((t: any) => ({
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
      checklist: os.checklist_atividades?.map((c: any) => ({
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
        created_at: c.created_at,
        updated_at: c.updated_at,
      })) || [],
      anexos: os.anexos?.map((a: any) => ({
        id: a.id,
        os_id: a.os_id,
        nome: a.nome,
        nome_original: a.nome_original,
        tipo: a.tipo,
        mime_type: a.mime_type,
        tamanho: Number(a.tamanho),
        descricao: a.descricao,
        caminho_s3: a.caminho_s3,
        url_download: a.url_download,
        fase_execucao: a.fase_execucao,
        uploaded_at: a.uploaded_at,
        uploaded_by: a.uploaded_by,
        uploaded_by_id: a.uploaded_by_id,
        deletado_em: a.deletado_em,
      })) || [],
      registros_tempo: os.registros_tempo?.map((r: any) => ({
        id: r.id,
        os_id: r.os_id,
        tecnico_id: r.tecnico_id,
        tecnico_nome: r.tecnico_nome,
        data_inicio: r.data_inicio,
        hora_inicio: r.hora_inicio,
        data_fim: r.data_fim,
        hora_fim: r.hora_fim,
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
      historico: os.historico?.map((h: any) => ({
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