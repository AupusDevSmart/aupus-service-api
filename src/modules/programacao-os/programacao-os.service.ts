import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, StatusProgramacaoOS } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AnomaliasService } from '../anomalias/anomalias.service';
import {
  AdicionarTarefasDto,
  AprovarProgramacaoDto,
  AtualizarTarefasDto,
  CancelarProgramacaoDto,
  FinalizarProgramacaoDto,
  CreateProgramacaoAnomaliaDto,
  CreateProgramacaoDto,
  CreateProgramacaoTarefasDto,
  ListarProgramacoesResponseDto,
  ProgramacaoDetalhesResponseDto,
  ProgramacaoFiltersDto,
  ProgramacaoResponseDto,
  UpdateProgramacaoDto,
} from './dto';

@Injectable()
export class ProgramacaoOSService {
  private readonly logger = new Logger(ProgramacaoOSService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anomaliasService: AnomaliasService,
  ) { }

  async listar(filters: ProgramacaoFiltersDto): Promise<ListarProgramacoesResponseDto> {

    const {
      page = 1,
      limit = 10,
      search,
      status,
      tipo,
      prioridade,
      origem,
      planta_id,
      unidade_id,
      data_inicio,
      data_fim,
      criado_por_id,
    } = filters;

    // Construir filtros
    const where: Prisma.programacoes_osWhereInput = {
      deletado_em: null,
    };

    if (search) {
      where.OR = [
        { descricao: { contains: search, mode: 'insensitive' } },
        { codigo: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status && status !== 'all') {
      where.status = status as StatusProgramacaoOS;
    }

    if (tipo && tipo !== 'all') {
      where.tipo = tipo;
    }

    if (prioridade && prioridade !== 'all') {
      where.prioridade = prioridade;
    }

    if (origem && origem !== 'all') {
      where.origem = origem;
    }

    if (planta_id) {
      where.planta_id = planta_id;
    }

    if (unidade_id) {
      where.equipamento = {
        unidade_id: unidade_id
      };
    }

    if (criado_por_id) {
      where.criado_por_id = criado_por_id;
    }

    if (data_inicio || data_fim) {
      where.criado_em = {};
      if (data_inicio) {
        where.criado_em.gte = new Date(data_inicio);
      }
      if (data_fim) {
        where.criado_em.lte = new Date(data_fim + 'T23:59:59.999Z');
      }
    }

    // Contar total
    const total = await this.prisma.programacoes_os.count({ where });

    // Buscar dados
    const programacoes = await this.prisma.programacoes_os.findMany({
      where,
      include: {
        tarefas_programacao: {
          include: {
            tarefa: {
              select: {
                id: true,
                nome: true,
                categoria: true,
                tipo_manutencao: true,
                tempo_estimado: true,
                duracao_estimada: true,
              },
            },
          },
        },
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
      orderBy: { criado_em: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Buscar estatísticas
    const stats = await this.obterEstatisticas();

    return {
      data: programacoes.map(programacao => this.mapearParaResponse(programacao)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats,
    };
  }

  async buscarPorId(id: string): Promise<ProgramacaoDetalhesResponseDto> {
    const programacao = await this.prisma.programacoes_os.findFirst({
      where: {
        id,
        deletado_em: null,
      },
      include: {
        tarefas_programacao: {
          include: {
            tarefa: {
              select: {
                id: true,
                nome: true,
                categoria: true,
                tipo_manutencao: true,
                tempo_estimado: true,
                duracao_estimada: true,
              },
            },
          },
        },
        materiais: true,
        ferramentas: true,
        tecnicos: true,
        itens_orcamento: true,
        historico: {
          orderBy: { data: 'desc' },
        },
        ordem_servico: true,
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
    });

    if (!programacao) {
      throw new NotFoundException('Programação não encontrada');
    }

    // Buscar reserva manualmente com trim no reserva_id
    let reserva = null;
    if (programacao.reserva_id) {
      const reservaIdLimpo = programacao.reserva_id.trim();

      reserva = await this.prisma.reserva_veiculo.findUnique({
        where: { id: reservaIdLimpo },
        include: {
          veiculo: true,
        },
      });
    }

    return this.mapearParaDetalhes(programacao, reserva);
  }

  async buscarPorUnidade(unidadeId: string, filters?: Partial<ProgramacaoFiltersDto>): Promise<ListarProgramacoesResponseDto> {
    // Verificar se unidade existe
    await this.verificarUnidadeExiste(unidadeId);

    // Construir filtros com unidade_id
    const filtersComUnidade: ProgramacaoFiltersDto = {
      ...filters,
      unidade_id: unidadeId,
      page: filters?.page || 1,
      limit: filters?.limit || 10,
    };

    return this.listar(filtersComUnidade);
  }

  async criar(createDto: CreateProgramacaoDto, usuarioId?: string): Promise<ProgramacaoResponseDto> {
    // Limpar IDs (remover espaços em branco)
    if (createDto.veiculo_id) {
      createDto.veiculo_id = createDto.veiculo_id.trim();
    }

    // Validar relacionamentos
    await this.validarRelacionamentos(createDto);

    // Gerar código único
    const codigo = await this.gerarCodigo();

    // Calcular custo total dos materiais e técnicos
    const orcamento_previsto = this.calcularOrcamentoPrevisto(createDto);

    // Buscar nome do usuário criador
    let nomeCriador: string | null = null;
    if (usuarioId) {
      try {
        const usuario = await this.prisma.usuarios.findUnique({ where: { id: usuarioId }, select: { nome: true } });
        if (usuario) nomeCriador = usuario.nome;
      } catch {}
    }

    return await this.prisma.$transaction(async (prisma) => {
      // Criar programação
      const programacao = await prisma.programacoes_os.create({
        data: {
          codigo,
          descricao: createDto.descricao,
          local: createDto.local || null,
          ativo: createDto.ativo || null,
          condicoes: createDto.condicoes,
          tipo: createDto.tipo,
          prioridade: createDto.prioridade,
          origem: createDto.origem,
          planta_id: createDto.planta_id?.trim() || null,
          equipamento_id: createDto.equipamento_id?.trim() || null,
          anomalia_id: createDto.anomalia_id?.trim() || null,
          plano_manutencao_id: createDto.plano_manutencao_id?.trim() || null,
          solicitacao_servico_id: createDto.solicitacao_servico_id?.trim()
            || (createDto.dados_origem as any)?.solicitacaoServicoId?.trim()
            || null,
          dados_origem: createDto.dados_origem,
          tempo_estimado: createDto.tempo_estimado || 2, // Padrão: 2 horas
          duracao_estimada: createDto.duracao_estimada || (createDto.tempo_estimado ? createDto.tempo_estimado * 1.5 : 3), // Padrão: 3h ou 1.5x tempo
          data_previsao_inicio: createDto.data_previsao_inicio ? new Date(createDto.data_previsao_inicio) : null,
          data_previsao_fim: createDto.data_previsao_fim ? new Date(createDto.data_previsao_fim) : null,
          necessita_veiculo: createDto.necessita_veiculo || false,
          veiculo_id: createDto.veiculo_id,
          reserva_data_inicio: createDto.reserva_data_inicio ? new Date(createDto.reserva_data_inicio) : null,
          reserva_data_fim: createDto.reserva_data_fim ? new Date(createDto.reserva_data_fim) : null,
          reserva_hora_inicio: createDto.reserva_hora_inicio,
          reserva_hora_fim: createDto.reserva_hora_fim,
          reserva_finalidade: createDto.reserva_finalidade,
          assentos_necessarios: createDto.assentos_necessarios,
          carga_necessaria: createDto.carga_necessaria,
          observacoes_veiculo: createDto.observacoes_veiculo,
          data_hora_programada: createDto.data_hora_programada ? new Date(createDto.data_hora_programada) : null,
          responsavel: createDto.responsavel,
          responsavel_id: createDto.responsavel_id,
          time_equipe: createDto.time_equipe,
          orcamento_previsto: createDto.orcamento_previsto || orcamento_previsto,
          observacoes: createDto.observacoes,
          observacoes_programacao: createDto.observacoes_programacao,
          justificativa: createDto.justificativa,
          criado_por: nomeCriador,
          criado_por_id: usuarioId,
        },
        include: {
          tarefas_programacao: {
            include: {
              tarefa: {
                select: {
                  id: true,
                  nome: true,
                  categoria: true,
                  tipo_manutencao: true,
                  tempo_estimado: true,
                  duracao_estimada: true,
                },
              },
            },
          },
        },
      });

      // Criar tarefas associadas
      if (createDto.tarefas_ids && createDto.tarefas_ids.length > 0) {
        await this.adicionarTarefas(prisma, programacao.id, createDto.tarefas_ids);
      }

      // Criar materiais
      if (createDto.materiais && createDto.materiais.length > 0) {
        await this.criarMateriais(prisma, programacao.id, createDto.materiais);
      }

      // Criar ferramentas
      if (createDto.ferramentas && createDto.ferramentas.length > 0) {
        await this.criarFerramentas(prisma, programacao.id, createDto.ferramentas);
      }

      // Criar técnicos
      if (createDto.tecnicos && createDto.tecnicos.length > 0) {
        await this.criarTecnicos(prisma, programacao.id, createDto.tecnicos);
      }

      // Criar itens de orçamento
      if (createDto.itens_orcamento && createDto.itens_orcamento.length > 0) {
        await this.criarItensOrcamento(prisma, programacao.id, createDto.itens_orcamento);
      }

      // Criar reserva de veículo imediatamente (vinculada à programação)
      if (createDto.necessita_veiculo && createDto.veiculo_id) {
        await this.criarReservaVeiculoProgramacao(prisma, programacao, usuarioId);
      }

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        programacao.id,
        'CRIACAO',
        'Sistema',
        usuarioId,
        'Programação criada',
        null,
        StatusProgramacaoOS.PENDENTE,
      );

      // Marcar anomalia como PROGRAMADA
      if (programacao.anomalia_id) {
        try {
          await this.anomaliasService.marcarComoProgramada(programacao.anomalia_id, programacao.id);
          this.logger.log(`Anomalia ${programacao.anomalia_id} marcada como PROGRAMADA`);
        } catch (error) {
          this.logger.warn(`Erro ao atualizar status da anomalia: ${error.message}`);
        }
      }

      // Nota: Solicitação é atualizada em criarDeSolicitacao() com programacao_os_id e histórico

      return this.mapearParaResponse(programacao);
    }, {
      timeout: 15000, // 15 seconds timeout
    });
  }

  async atualizar(id: string, updateDto: UpdateProgramacaoDto, usuarioId?: string): Promise<ProgramacaoResponseDto> {
    const programacao = await this.buscarPorId(id);

    // Verificar se pode ser editada
    if (programacao.status !== StatusProgramacaoOS.PENDENTE) {
      throw new ConflictException('Apenas programações pendentes podem ser editadas');
    }

    // Limpar IDs (remover espaços em branco)
    if (updateDto.veiculo_id) {
      updateDto.veiculo_id = updateDto.veiculo_id.trim();
    }

    // Validar relacionamentos se alterados
    if (updateDto.equipamento_id || updateDto.anomalia_id || updateDto.plano_manutencao_id || updateDto.veiculo_id) {
      await this.validarRelacionamentos(updateDto);
    }

    // Prepare data without undefined fields to avoid Prisma issues
    // ✅ Separar campos de relacionamentos (materiais, ferramentas, tecnicos)
    const { materiais, ferramentas, tecnicos, itens_orcamento, tarefas_ids, ...restDto } = updateDto as any;
    const updateData: any = {};

    Object.keys(restDto).forEach(key => {
      const value = restDto[key as keyof typeof restDto];
      if (value !== undefined) {
        // Converter campos de data para Date object
        if (key === 'data_previsao_inicio' || key === 'data_previsao_fim' || key === 'data_hora_programada' ||
            key === 'reserva_data_inicio' || key === 'reserva_data_fim') {
          updateData[key] = new Date(value as string);
        } else {
          updateData[key] = value;
        }
      }
    });

    return await this.prisma.$transaction(async (prisma) => {
      const programacaoAtualizada = await prisma.programacoes_os.update({
        where: { id },
        data: updateData,
        include: {
          tarefas_programacao: {
            include: {
              tarefa: {
                select: {
                  id: true,
                  nome: true,
                  categoria: true,
                  tipo_manutencao: true,
                  tempo_estimado: true,
                  duracao_estimada: true,
                },
              },
            },
          },
          ordem_servico: true,
        },
      });

      // Atualizar recursos (delete + recreate)
      if (materiais !== undefined) {
        await prisma.materiais_programacao_os.deleteMany({ where: { programacao_id: id } });
        if (materiais.length > 0) {
          await this.criarMateriais(prisma, id, materiais);
        }
      }

      if (ferramentas !== undefined) {
        await prisma.ferramentas_programacao_os.deleteMany({ where: { programacao_id: id } });
        if (ferramentas.length > 0) {
          await this.criarFerramentas(prisma, id, ferramentas);
        }
      }

      if (tecnicos !== undefined) {
        await prisma.tecnicos_programacao_os.deleteMany({ where: { programacao_id: id } });
        if (tecnicos.length > 0) {
          await this.criarTecnicos(prisma, id, tecnicos);
        }
      }

      if (itens_orcamento !== undefined) {
        await prisma.itens_orcamento_programacao_os.deleteMany({ where: { programacao_id: id } });
        if (itens_orcamento.length > 0) {
          await this.criarItensOrcamento(prisma, id, itens_orcamento);
        }
      }

      // Recalcular orcamento_previsto se recursos foram alterados
      if (materiais !== undefined || tecnicos !== undefined || itens_orcamento !== undefined) {
        const orcamento = this.calcularOrcamentoPrevisto({
          materiais: materiais || programacao.materiais || [],
          tecnicos: tecnicos || programacao.tecnicos || [],
          itens_orcamento: itens_orcamento || programacao.itens_orcamento || [],
        } as any);

        if (orcamento > 0) {
          await prisma.programacoes_os.update({
            where: { id },
            data: { orcamento_previsto: orcamento },
          });
        }
      }

      // Criar/atualizar/cancelar reserva de veículo vinculada à programação
      // ✅ CORREÇÃO: Só criar/atualizar reserva se necessita_veiculo for true E houver veiculo_id
      if (programacaoAtualizada.necessita_veiculo && programacaoAtualizada.veiculo_id) {
        await this.criarReservaVeiculoProgramacao(prisma, programacaoAtualizada, usuarioId);
      } else if (!programacaoAtualizada.necessita_veiculo && programacao.reserva_id) {
        // Se desmarcou necessita_veiculo, cancelar reserva existente
        try {
          const reservaIdLimpo = programacao.reserva_id.trim();
          await prisma.reserva_veiculo.update({
            where: { id: reservaIdLimpo },
            data: {
              status: 'cancelada',
              motivo_cancelamento: 'Programação não necessita mais de veículo',
              data_cancelamento: new Date(),
              cancelado_por: 'Sistema',
            },
          });

          // Remover reserva_id da programação
          await prisma.programacoes_os.update({
            where: { id },
            data: { reserva_id: null },
          });

          this.logger.log(`Reserva ${reservaIdLimpo} cancelada automaticamente`);
        } catch (error) {
          this.logger.error(`Erro ao cancelar reserva: ${error.message}`);
        }
      }

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        id,
        'ATUALIZACAO',
        'Sistema',
        usuarioId,
        'Programação atualizada',
      );

      return this.mapearParaResponse(programacaoAtualizada);
    }, {
      timeout: 15000,
    });
  }

  async aprovar(id: string, dto: AprovarProgramacaoDto, usuarioId?: string): Promise<void> {
    const programacao = await this.buscarPorId(id);

    if (programacao.status !== StatusProgramacaoOS.PENDENTE) {
      throw new ConflictException('Apenas programações pendentes podem ser aprovadas');
    }

    // Buscar nome do usuário aprovador
    let nomeAprovador: string | null = null;
    if (usuarioId) {
      try {
        const usuario = await this.prisma.usuarios.findUnique({ where: { id: usuarioId }, select: { nome: true } });
        if (usuario) nomeAprovador = usuario.nome;
      } catch {}
    }

    await this.prisma.$transaction(async (prisma) => {
      await prisma.programacoes_os.update({
        where: { id },
        data: {
          status: StatusProgramacaoOS.APROVADA,
          aprovado_por: nomeAprovador,
          aprovado_por_id: usuarioId || null,
          data_aprovacao: new Date(),
          observacoes_aprovacao: dto.observacoes || null,
          ajustes_orcamento: dto.ajustes_orcamento || null,
          data_programada_sugerida: dto.data_programada_sugerida ? new Date(dto.data_programada_sugerida) : null,
          hora_programada_sugerida: dto.hora_programada_sugerida || null,
          orcamento_previsto: dto.ajustes_orcamento || programacao.orcamento_previsto,
          data_hora_programada: dto.data_programada_sugerida && dto.hora_programada_sugerida
            ? new Date(`${dto.data_programada_sugerida}T${dto.hora_programada_sugerida}:00Z`)
            : programacao.data_hora_programada,
        },
      });

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        id,
        'APROVACAO',
        'Sistema',
        usuarioId,
        dto.observacoes,
        StatusProgramacaoOS.PENDENTE,
        StatusProgramacaoOS.APROVADA,
      );

      // Gerar OS automaticamente com status PENDENTE
      const osId = await this.gerarOrdemServico(prisma, id);

      // Propagar status para origem: anomalia → PROGRAMADA
      if (programacao.anomalia_id) {
        try {
          await this.anomaliasService.marcarComoProgramada(programacao.anomalia_id, id);
          this.logger.log(`Anomalia ${programacao.anomalia_id} marcada como PROGRAMADA`);
        } catch (error) {
          this.logger.warn(`Erro ao atualizar status da anomalia: ${error.message}`);
        }
      }

      // Propagar status para origem: solicitação → PROGRAMADA
      const solIdAprovar = programacao.solicitacao_servico_id?.trim()
        || (programacao.dados_origem as any)?.solicitacaoServicoId?.trim();
      if (solIdAprovar) {
        try {
          await prisma.solicitacoes_servico.update({
            where: { id: solIdAprovar },
            data: { status: 'PROGRAMADA' },
          });
          this.logger.log(`Solicitação ${solIdAprovar} marcada como PROGRAMADA`);
        } catch (error) {
          this.logger.warn(`Erro ao atualizar status da solicitação: ${error.message}`);
        }
      }

      // Vincular reserva de veículo à OS
      if (programacao.reserva_id) {
        const reservaId = programacao.reserva_id.trim();
        const reservaProgramacao = await prisma.reserva_veiculo.findUnique({
          where: { id: reservaId },
        });

        if (reservaProgramacao) {
          await prisma.reserva_veiculo.update({
            where: { id: reservaProgramacao.id },
            data: {
              solicitante_id: osId,
              tipo_solicitante: 'ordem_servico',
              finalidade: `Execução de OS: ${programacao.descricao}`,
            },
          });

          await prisma.ordens_servico.update({
            where: { id: osId },
            data: { reserva_id: reservaProgramacao.id },
          });

          this.logger.log(`Reserva ${reservaProgramacao.id} vinculada à OS ${osId}`);
        }
      } else if (programacao.necessita_veiculo && programacao.veiculo_id) {
        const novaReservaId = await this.criarReservaVeiculo(prisma, programacao, osId, usuarioId);

        if (novaReservaId) {
          await prisma.ordens_servico.update({
            where: { id: osId },
            data: { reserva_id: novaReservaId },
          });
        }
      }
    }, {
      timeout: 15000,
    });
  }

  async finalizar(id: string, dto: FinalizarProgramacaoDto, usuarioId?: string): Promise<void> {
    const programacao = await this.buscarPorId(id);

    if (programacao.status !== StatusProgramacaoOS.APROVADA) {
      throw new ConflictException('Apenas programações aprovadas podem ser finalizadas');
    }

    // Buscar nome do usuário se disponível
    let nomeUsuario = 'Sistema';
    if (usuarioId) {
      try {
        const usuario = await this.prisma.usuarios.findUnique({ where: { id: usuarioId }, select: { nome: true } });
        if (usuario) nomeUsuario = usuario.nome;
      } catch {}
    }

    await this.prisma.programacoes_os.update({
      where: { id },
      data: {
        status: StatusProgramacaoOS.FINALIZADA,
        observacoes_finalizacao: dto.observacoes || null,
        finalizado_por: nomeUsuario,
        finalizado_por_id: usuarioId || null,
        data_finalizacao: new Date(),
      },
    });

    await this.registrarHistorico(
      this.prisma,
      id,
      'FINALIZACAO',
      nomeUsuario,
      usuarioId,
      dto.observacoes,
      StatusProgramacaoOS.APROVADA,
      StatusProgramacaoOS.FINALIZADA,
    );

    // Propagar status para anomalia → FINALIZADA
    if (programacao.anomalia_id) {
      try {
        await this.anomaliasService.marcarComoFinalizada(programacao.anomalia_id);
        this.logger.log(`Anomalia ${programacao.anomalia_id} marcada como FINALIZADA`);
      } catch (error) {
        this.logger.warn(`Erro ao atualizar status da anomalia: ${error.message}`);
      }
    }

    // Propagar status para solicitação → FINALIZADA
    const solIdFinalizar = programacao.solicitacao_servico_id?.trim()
      || (programacao.dados_origem as any)?.solicitacaoServicoId?.trim();
    if (solIdFinalizar) {
      try {
        await this.prisma.solicitacoes_servico.update({
          where: { id: solIdFinalizar },
          data: { status: 'FINALIZADA' },
        });
        this.logger.log(`Solicitação ${solIdFinalizar} marcada como FINALIZADA`);
      } catch (error) {
        this.logger.warn(`Erro ao atualizar status da solicitação: ${error.message}`);
      }
    }
  }

  async cancelar(id: string, dto: CancelarProgramacaoDto, usuarioId?: string): Promise<void> {
    const programacao = await this.buscarPorId(id);

    if (programacao.status === StatusProgramacaoOS.CANCELADA || programacao.status === StatusProgramacaoOS.FINALIZADA) {
      throw new ConflictException('Programação não pode ser cancelada neste status');
    }

    const statusAnterior = programacao.status;

    await this.prisma.programacoes_os.update({
      where: { id },
      data: {
        status: StatusProgramacaoOS.CANCELADA,
        motivo_cancelamento: dto.motivo_cancelamento,
      },
    });

    await this.registrarHistorico(
      this.prisma,
      id,
      'CANCELAMENTO',
      'Sistema',
      usuarioId,
      dto.motivo_cancelamento,
      statusAnterior as StatusProgramacaoOS,
      StatusProgramacaoOS.CANCELADA,
    );

    // Cancelar reserva de veículo vinculada
    if (programacao.reserva_id) {
      try {
        const reservaId = programacao.reserva_id.trim();
        const reserva = await this.prisma.reserva_veiculo.findUnique({
          where: { id: reservaId },
        });
        if (reserva && reserva.status === 'ativa') {
          await this.prisma.reserva_veiculo.update({
            where: { id: reservaId },
            data: {
              status: 'cancelada',
              motivo_cancelamento: `Programação ${id} foi cancelada: ${dto.motivo_cancelamento}`,
              data_cancelamento: new Date(),
            },
          });
          this.logger.log(`Reserva ${reservaId} cancelada após cancelamento da programação`);
        }
      } catch (error) {
        this.logger.warn(`Erro ao cancelar reserva da programação: ${error.message}`);
      }
    }

    // Retornar anomalia vinculada para REGISTRADA
    if (programacao.anomalia_id) {
      try {
        await this.anomaliasService.voltarParaRegistrada(programacao.anomalia_id);
        this.logger.log(`Anomalia ${programacao.anomalia_id} retornada para REGISTRADA após cancelamento`);
      } catch (error) {
        this.logger.warn(`Erro ao atualizar status da anomalia: ${error.message}`);
      }
    }

    // Retornar solicitação vinculada para REGISTRADA
    const solIdCancelar = programacao.solicitacao_servico_id?.trim()
      || (programacao.dados_origem as any)?.solicitacaoServicoId?.trim();
    if (solIdCancelar) {
      try {
        await this.prisma.solicitacoes_servico.update({
          where: { id: solIdCancelar },
          data: { status: 'REGISTRADA' },
        });
        this.logger.log(`Solicitação ${solIdCancelar} retornada para REGISTRADA após cancelamento`);
      } catch (error) {
        this.logger.warn(`Erro ao atualizar status da solicitação: ${error.message}`);
      }
    }
  }

  async criarDeAnomalia(anomaliaId: string, dto: CreateProgramacaoAnomaliaDto, usuarioId?: string): Promise<ProgramacaoResponseDto> {
    // Buscar anomalia
    const anomalia = await this.prisma.anomalias.findFirst({
      where: { id: anomaliaId, deleted_at: null },
      include: {
        equipamento: true,
        planta: true,
      },
    });

    if (!anomalia) {
      throw new NotFoundException('Anomalia não encontrada');
    }

    const createDto: CreateProgramacaoDto = {
      descricao: dto.ajustes?.descricao || `Correção de anomalia: ${anomalia.descricao}`,
      local: anomalia.local,
      ativo: anomalia.ativo,
      condicoes: anomalia.condicao === 'FUNCIONANDO' ? 'FUNCIONANDO' : 'PARADO',
      tipo: 'CORRETIVA',
      prioridade: dto.ajustes?.prioridade as any || anomalia.prioridade,
      origem: 'ANOMALIA',
      equipamento_id: anomalia.equipamento_id,
      anomalia_id: anomalia.id,
      tempo_estimado: dto.ajustes?.tempo_estimado || 2,
      duracao_estimada: dto.ajustes?.tempo_estimado ? dto.ajustes.tempo_estimado * 1.5 : 3,
      dados_origem: {
        anomalia_descricao: anomalia.descricao,
        anomalia_data: anomalia.data,
        anomalia_prioridade: anomalia.prioridade,
      },
    };

    const programacao = await this.criar(createDto, usuarioId);

    // ✅ NOVO: Atualizar status da anomalia para EM_ANALISE
    // (Não precisa do try-catch aqui pois o método criar() já faz isso)

    return programacao;
  }

  async criarDeSolicitacao(
    solicitacaoId: string,
    dto: any,
    usuarioId?: string
  ): Promise<ProgramacaoResponseDto> {
    // Buscar solicitação do serviço de solicitações
    // Por enquanto vamos simular a busca
    const solicitacao = await this.prisma.solicitacoes_servico.findUnique({
      where: { id: solicitacaoId },
      include: {
        equipamento: true,
      },
    });

    if (!solicitacao) {
      throw new NotFoundException('Solicitação de serviço não encontrada');
    }

    if (solicitacao.status !== 'REGISTRADA') {
      throw new ConflictException('Apenas solicitações registradas podem gerar programação');
    }

    // Mapear tipo de solicitação para tipo de OS
    const mapTipoSolicitacaoToTipoOS = (tipo: string): string => {
      const mapeamento: Record<string, string> = {
        INSTALACAO: 'CORRETIVA',
        MANUTENCAO_PREVENTIVA: 'PREVENTIVA',
        MANUTENCAO_CORRETIVA: 'CORRETIVA',
        INSPECAO: 'INSPECAO',
        CALIBRACAO: 'INSPECAO',
        MODIFICACAO: 'CORRETIVA',
        REMOCAO: 'CORRETIVA',
        CONSULTORIA: 'VISITA_TECNICA',
        TREINAMENTO: 'VISITA_TECNICA',
        OUTRO: 'CORRETIVA',
      };
      return mapeamento[tipo] || 'CORRETIVA';
    };

    // Criar programação baseada na solicitação
    const createDto: CreateProgramacaoDto = {
      descricao: solicitacao.titulo,
      local: solicitacao.local,
      ativo: solicitacao.equipamento?.nome || 'N/A',
      condicoes: 'FUNCIONANDO',
      tipo: mapTipoSolicitacaoToTipoOS(solicitacao.tipo) as any,
      prioridade: solicitacao.prioridade as any,
      origem: 'SOLICITACAO_SERVICO' as any,
      planta_id: solicitacao.planta_id,
      equipamento_id: solicitacao.equipamento_id,
      solicitacao_servico_id: solicitacao.id,
      tempo_estimado: solicitacao.tempo_estimado ? Number(solicitacao.tempo_estimado) : 2,
      duracao_estimada: solicitacao.tempo_estimado ? Number(solicitacao.tempo_estimado) * 1.5 : 3,
      observacoes: solicitacao.descricao,
      justificativa: solicitacao.justificativa,
      responsavel: dto?.responsavel || solicitacao.solicitante_nome,
      dados_origem: {
        solicitacao_id: solicitacao.id,
        numero: solicitacao.numero,
        tipo: solicitacao.tipo,
        solicitante: solicitacao.solicitante_nome,
      },
      ...dto, // Permitir sobrescrever campos via DTO
    };

    // Criar a programação
    const programacao = await this.criar(createDto, usuarioId);

    // Atualizar status da solicitação e vincular programação
    await this.prisma.$transaction(async (prisma) => {
      await prisma.solicitacoes_servico.update({
        where: { id: solicitacaoId },
        data: {
          status: 'PROGRAMADA',
          programacao_os_id: programacao.id,
        },
      });

      // Registrar no histórico da solicitação
      await prisma.historico_solicitacao_servico.create({
        data: {
          solicitacao_id: solicitacaoId,
          acao: 'PROGRAMACAO',
          usuario_nome: 'Sistema',
          usuario_id: usuarioId,
          observacoes: `Programação OS ${programacao.codigo} gerada`,
          status_anterior: 'REGISTRADA',
          status_novo: 'PROGRAMADA',
        },
      });
    });

    this.logger.log(`Programação ${programacao.codigo} criada a partir da solicitação ${solicitacao.numero}`);
    return programacao;
  }

  async criarDeTarefas(dto: CreateProgramacaoTarefasDto, usuarioId?: string): Promise<ProgramacaoResponseDto> {
    // Buscar tarefas
    const tarefas = await this.prisma.tarefas.findMany({
      where: {
        id: { in: dto.tarefas_ids },
        deleted_at: null,
      },
      include: {
        equipamento: {
          include: {
            unidade: {
              include: {
                planta: true
              }
            }
          }
        },
      },
    });

    if (tarefas.length !== dto.tarefas_ids.length) {
      throw new NotFoundException('Uma ou mais tarefas não foram encontradas');
    }

    // Calcular tempo total
    const tempoTotal = tarefas.reduce((acc, tarefa) => acc + Number(tarefa.tempo_estimado), 0);
    const duracaoTotal = tarefas.reduce((acc, tarefa) => acc + Number(tarefa.duracao_estimada), 0);

    // Determinar planta e equipamento principal
    const plantas = [...new Set(tarefas.map(t => t.equipamento?.unidade?.planta?.id).filter(Boolean))];
    const equipamentos = [...new Set(tarefas.map(t => t.equipamento_id).filter(Boolean))];

    const createDto: CreateProgramacaoDto = {
      descricao: dto.descricao || `Execução de ${tarefas.length} tarefa(s) de manutenção`,
      local: dto.agrupar_por === 'planta' && plantas.length === 1
        ? tarefas[0].equipamento?.unidade?.planta?.nome || 'Local não definido'
        : 'Múltiplos locais',
      ativo: equipamentos.length === 1
        ? tarefas[0].equipamento?.nome || 'Equipamento não definido'
        : 'Múltiplos equipamentos',
      condicoes: 'FUNCIONANDO',
      tipo: tarefas[0].tipo_manutencao as any || 'PREVENTIVA',
      prioridade: dto.prioridade as any || 'MEDIA',
      origem: 'TAREFA',
      equipamento_id: equipamentos.length === 1 ? equipamentos[0] : null,
      tempo_estimado: tempoTotal,
      duracao_estimada: duracaoTotal,
      data_hora_programada: dto.data_hora_programada
        ? dto.data_hora_programada
        : null,
      responsavel: dto.responsavel,
      observacoes: dto.observacoes,
      tarefas_ids: dto.tarefas_ids,
      dados_origem: {
        tarefas_count: tarefas.length,
        agrupamento: dto.agrupar_por,
        tarefas_nomes: tarefas.map(t => t.nome),
      },
    };

    return this.criar(createDto, usuarioId);
  }

  async adicionarTarefasProgramacao(id: string, dto: AdicionarTarefasDto, usuarioId?: string): Promise<void> {
    await this.buscarPorId(id); // Verificar se existe

    await this.prisma.$transaction(async (prisma) => {
      await this.adicionarTarefas(prisma, id, dto.tarefas_ids);

      await this.registrarHistorico(
        prisma,
        id,
        'ADICAO_TAREFAS',
        'Sistema',
        usuarioId,
        `Adicionadas ${dto.tarefas_ids.length} tarefa(s). ${dto.observacoes || ''}`,
      );
    }, {
      timeout: 8000, // 8 seconds timeout for adding tasks
    });
  }

  async atualizarTarefasProgramacao(id: string, dto: AtualizarTarefasDto, usuarioId?: string): Promise<void> {
    await this.buscarPorId(id); // Verificar se existe

    await this.prisma.$transaction(async (prisma) => {
      for (const tarefa of dto.tarefas) {
        await prisma.tarefas_programacao_os.updateMany({
          where: {
            programacao_id: id,
            tarefa_id: tarefa.tarefa_id,
          },
          data: {
            ordem: tarefa.ordem,
            status: tarefa.status,
            observacoes: tarefa.observacoes,
          },
        });
      }

      await this.registrarHistorico(
        prisma,
        id,
        'ATUALIZACAO_TAREFAS',
        'Sistema',
        usuarioId,
        `Atualizadas ${dto.tarefas.length} tarefa(s)`,
      );
    }, {
      timeout: 8000, // 8 seconds timeout for updating tasks
    });
  }

  async removerTarefaProgramacao(id: string, tarefaId: string, usuarioId?: string): Promise<void> {
    await this.buscarPorId(id); // Verificar se existe

    const tarefaRemovida = await this.prisma.tarefas_programacao_os.findFirst({
      where: {
        programacao_id: id,
        tarefa_id: tarefaId,
      },
      include: { tarefa: true },
    });

    if (!tarefaRemovida) {
      throw new NotFoundException('Tarefa não encontrada na programação');
    }

    await this.prisma.$transaction(async (prisma) => {
      await prisma.tarefas_programacao_os.delete({
        where: { id: tarefaRemovida.id },
      });

      await this.registrarHistorico(
        prisma,
        id,
        'REMOCAO_TAREFA',
        'Sistema',
        usuarioId,
        `Removida tarefa: ${tarefaRemovida.tarefa.nome}`,
      );
    }, {
      timeout: 5000, // 5 seconds timeout for removing task
    });
  }

  async deletar(id: string, usuarioId?: string): Promise<void> {
    const programacao = await this.buscarPorId(id);

    if (programacao.status === StatusProgramacaoOS.APROVADA) {
      throw new ConflictException('Programações aprovadas não podem ser deletadas');
    }

    await this.prisma.programacoes_os.update({
      where: { id },
      data: { deletado_em: new Date() },
    });

    await this.registrarHistorico(
      this.prisma,
      id,
      'EXCLUSAO',
      'Sistema',
      usuarioId,
      'Programação excluída',
    );
  }

  // Métodos auxiliares privados

  private async verificarUnidadeExiste(unidadeId: string): Promise<void> {
    const unidade = await this.prisma.unidades.findFirst({
      where: {
        id: unidadeId,
        deleted_at: null
      }
    });

    if (!unidade) {
      throw new NotFoundException('Unidade não encontrada');
    }
  }

  private async validarRelacionamentos(dto: Partial<CreateProgramacaoDto>): Promise<void> {
    if (dto.equipamento_id) {
      const equipamento = await this.prisma.equipamentos.findFirst({
        where: { id: dto.equipamento_id, deleted_at: null },
      });
      if (!equipamento) {
        throw new NotFoundException('Equipamento não encontrado');
      }
    }

    if (dto.anomalia_id) {
      const anomalia = await this.prisma.anomalias.findFirst({
        where: { id: dto.anomalia_id, deleted_at: null },
      });
      if (!anomalia) {
        throw new NotFoundException('Anomalia não encontrada');
      }
    }

    if (dto.plano_manutencao_id) {
      const plano = await this.prisma.planos_manutencao.findFirst({
        where: { id: dto.plano_manutencao_id, deleted_at: null },
      });
      if (!plano) {
        throw new NotFoundException('Plano de manutenção não encontrado');
      }
    }

    if (dto.veiculo_id) {
      const veiculo = await this.prisma.veiculo.findFirst({
        where: { id: dto.veiculo_id, ativo: true },
      });
      if (!veiculo) {
        throw new NotFoundException('Veículo não encontrado');
      }
    }
  }

  private async gerarCodigo(): Promise<string> {
    const ano = new Date().getFullYear();
    const count = await this.prisma.programacoes_os.count({
      where: {
        codigo: { startsWith: `PRG-${ano}-` },
      },
    });

    return `PRG-${ano}-${String(count + 1).padStart(3, '0')}`;
  }

  private calcularOrcamentoPrevisto(dto: CreateProgramacaoDto): number {
    let total = 0;

    if (dto.materiais) {
      total += dto.materiais.reduce((acc, material) => {
        const custo = (material.custo_unitario || 0) * material.quantidade_planejada;
        return acc + custo;
      }, 0);
    }

    if (dto.tecnicos) {
      total += dto.tecnicos.reduce((acc, tecnico) => {
        const custo = (tecnico.custo_hora || 0) * tecnico.horas_estimadas;
        return acc + custo;
      }, 0);
    }

    if (dto.itens_orcamento) {
      total += dto.itens_orcamento.reduce((acc, item) => {
        return acc + (item.valor || 0);
      }, 0);
    }

    return total;
  }

  private async adicionarTarefas(prisma: any, programacaoId: string, tarefasIds: string[]): Promise<void> {
    // Verificar se as tarefas existem
    const tarefas = await prisma.tarefas.findMany({
      where: {
        id: { in: tarefasIds },
        deleted_at: null,
      },
    });

    if (tarefas.length !== tarefasIds.length) {
      throw new NotFoundException('Uma ou mais tarefas não foram encontradas');
    }

    // Verificar duplicatas
    const existentes = await prisma.tarefas_programacao_os.findMany({
      where: {
        programacao_id: programacaoId,
        tarefa_id: { in: tarefasIds },
      },
    });

    if (existentes.length > 0) {
      throw new ConflictException('Uma ou mais tarefas já estão associadas à programação');
    }

    // Adicionar tarefas
    const dados = tarefasIds.map((tarefaId, index) => ({
      programacao_id: programacaoId,
      tarefa_id: tarefaId,
      ordem: index + 1,
    }));

    await prisma.tarefas_programacao_os.createMany({ data: dados });
  }

  private async criarMateriais(prisma: any, programacaoId: string, materiais: any[]): Promise<void> {
    const dados = materiais.map(material => ({
      programacao_id: programacaoId,
      descricao: material.descricao,
      quantidade_planejada: material.quantidade_planejada,
      unidade: material.unidade,
      custo_unitario: material.custo_unitario,
      custo_total: material.custo_unitario ? material.custo_unitario * material.quantidade_planejada : null,
    }));

    await prisma.materiais_programacao_os.createMany({ data: dados });
  }

  private async criarFerramentas(prisma: any, programacaoId: string, ferramentas: any[]): Promise<void> {
    const dados = ferramentas.map(ferramenta => ({
      programacao_id: programacaoId,
      descricao: ferramenta.descricao,
      quantidade: ferramenta.quantidade,
    }));

    await prisma.ferramentas_programacao_os.createMany({ data: dados });
  }

  private async criarTecnicos(prisma: any, programacaoId: string, tecnicos: any[]): Promise<void> {
    const dados = tecnicos.map(tecnico => ({
      programacao_id: programacaoId,
      nome: tecnico.nome,
      especialidade: tecnico.especialidade,
      horas_estimadas: tecnico.horas_estimadas,
      custo_hora: tecnico.custo_hora,
      custo_total: tecnico.custo_hora ? tecnico.custo_hora * tecnico.horas_estimadas : null,
      tecnico_id: tecnico.tecnico_id,
    }));

    await prisma.tecnicos_programacao_os.createMany({ data: dados });
  }

  private async criarItensOrcamento(prisma: any, programacaoId: string, itensOrcamento: any[]): Promise<void> {
    const dados = itensOrcamento.map(item => ({
      programacao_id: programacaoId,
      descricao: item.descricao,
      valor: item.valor,
    }));

    await prisma.itens_orcamento_programacao_os.createMany({ data: dados });
  }

  private async registrarHistorico(
    prismaOrTransaction: any,
    programacaoId: string,
    acao: string,
    usuario: string,
    usuarioId?: string,
    observacoes?: string,
    statusAnterior?: StatusProgramacaoOS,
    statusNovo?: StatusProgramacaoOS,
  ): Promise<void> {
    // Use a instância fornecida (pode ser this.prisma ou uma transação)
    const prismaClient = prismaOrTransaction || this.prisma;

    await prismaClient.historico_programacao_os.create({
      data: {
        programacao_id: programacaoId,
        acao,
        usuario,
        usuario_id: usuarioId,
        observacoes,
        status_anterior: statusAnterior,
        status_novo: statusNovo,
      },
    });
  }

  private async gerarOrdemServico(prisma: any, programacaoId: string): Promise<string> {
    const programacao = await prisma.programacoes_os.findUnique({
      where: { id: programacaoId },
      include: {
        tarefas_programacao: true,
        materiais: true,
        ferramentas: true,
        tecnicos: true,
        itens_orcamento: true,
        historico: {
          orderBy: { data: 'asc' },
        },
      },
    });

    // Gerar número da OS
    const ano = new Date().getFullYear();
    const count = await prisma.ordens_servico.count({
      where: {
        numero_os: { startsWith: `OS-${ano}-` },
      },
    });
    const numeroOS = `OS-${ano}-${String(count + 1).padStart(3, '0')}`;

    // Criar OS com status PENDENTE
    const os = await prisma.ordens_servico.create({
      data: {
        programacao_id: programacaoId,
        numero_os: numeroOS,
        descricao: programacao.descricao,
        local: programacao.local || null,
        ativo: programacao.ativo || null,
        condicoes: programacao.condicoes,
        status: 'PENDENTE',
        tipo: programacao.tipo,
        prioridade: programacao.prioridade,
        origem: programacao.origem,
        // Relacionamentos
        planta_id: programacao.planta_id?.trim() || null,
        equipamento_id: programacao.equipamento_id?.trim() || null,
        anomalia_id: programacao.anomalia_id?.trim() || null,
        plano_manutencao_id: programacao.plano_manutencao_id?.trim() || null,
        dados_origem: programacao.dados_origem,
        // Planejamento
        tempo_estimado: programacao.tempo_estimado,
        duracao_estimada: programacao.duracao_estimada,
        data_hora_programada: programacao.data_hora_programada || new Date(),
        responsavel: programacao.responsavel || null,
        responsavel_id: programacao.responsavel_id,
        time_equipe: programacao.time_equipe,
        orcamento_previsto: programacao.orcamento_previsto,
        // Observações
        observacoes: programacao.observacoes,
        observacoes_programacao: programacao.observacoes_programacao,
        // ✅ NOVO: Campos de auditoria da programação
        criado_por: programacao.criado_por,
        criado_por_id: programacao.criado_por_id,
        programado_por: programacao.aprovado_por, // Quem aprovou a programação = quem programou a OS
        programado_por_id: programacao.aprovado_por_id,
        aprovado_por: programacao.aprovado_por,
        aprovado_por_id: programacao.aprovado_por_id,
        data_aprovacao: programacao.data_aprovacao,
      },
    });

    // Copiar tarefas para a OS
    if (programacao.tarefas_programacao.length > 0) {
      const tarefasOS = programacao.tarefas_programacao.map(tp => ({
        os_id: os.id,
        tarefa_id: tp.tarefa_id,
        ordem: tp.ordem,
      }));
      await prisma.tarefas_os.createMany({ data: tarefasOS });
    }

    // Copiar materiais para a OS
    if (programacao.materiais.length > 0) {
      const materiaisOS = programacao.materiais.map(m => ({
        os_id: os.id,
        descricao: m.descricao,
        quantidade_planejada: m.quantidade_planejada,
        unidade: m.unidade,
        custo_unitario: m.custo_unitario,
        custo_total: m.custo_total,
        confirmado: m.confirmado,
        disponivel: m.disponivel,
        observacoes: m.observacoes,
      }));
      await prisma.materiais_os.createMany({ data: materiaisOS });
    }

    // Copiar ferramentas para a OS
    if (programacao.ferramentas.length > 0) {
      const ferramentasOS = programacao.ferramentas.map(f => ({
        os_id: os.id,
        descricao: f.descricao,
        quantidade: f.quantidade,
        confirmada: f.confirmada,
        disponivel: f.disponivel,
        observacoes: f.observacoes,
      }));
      await prisma.ferramentas_os.createMany({ data: ferramentasOS });
    }

    // Copiar técnicos para a OS
    if (programacao.tecnicos.length > 0) {
      const tecnicosOS = programacao.tecnicos.map(t => ({
        os_id: os.id,
        nome: t.nome,
        especialidade: t.especialidade,
        horas_estimadas: t.horas_estimadas,
        custo_hora: t.custo_hora,
        custo_total: t.custo_total,
        disponivel: t.disponivel,
        tecnico_id: t.tecnico_id,
      }));
      await prisma.tecnicos_os.createMany({ data: tecnicosOS });
    }

    // Copiar itens de orçamento para a OS
    if (programacao.itens_orcamento.length > 0) {
      const itensOrcamentoOS = programacao.itens_orcamento.map(i => ({
        os_id: os.id,
        descricao: i.descricao,
        valor: i.valor,
      }));
      await prisma.itens_orcamento_os.createMany({ data: itensOrcamentoOS });
    }

    // ✅ NOVO: Copiar histórico da programação para o histórico da OS
    if (programacao.historico && programacao.historico.length > 0) {
      const historicoOS = programacao.historico.map(h => ({
        os_id: os.id,
        acao: `[PROGRAMAÇÃO] ${h.acao}`,
        usuario: h.usuario,
        usuario_id: h.usuario_id,
        data: h.data,
        observacoes: h.observacoes,
        dados_extras: {
          origem: 'programacao',
          programacao_id: programacaoId,
          status_anterior_programacao: h.status_anterior,
          status_novo_programacao: h.status_novo,
          dados_extras_originais: h.dados_extras,
        },
      }));
      await prisma.historico_os.createMany({ data: historicoOS });
    }

    // ✅ NOVO: Registrar criação da OS no histórico
    await prisma.historico_os.create({
      data: {
        os_id: os.id,
        acao: 'CRIACAO_AUTO',
        usuario: 'Sistema',
        usuario_id: programacao.aprovado_por_id,
        observacoes: `OS gerada automaticamente a partir da programação ${programacao.codigo}`,
        status_novo: 'PENDENTE',
        dados_extras: {
          programacao_id: programacaoId,
          programacao_codigo: programacao.codigo,
        },
      },
    });

    return os.id;
  }

  /**
   * Cria uma reserva de veículo para a ordem de serviço
   */
  private async criarReservaVeiculo(
    prisma: any,
    programacao: any,
    osId: string,
    usuarioId?: string
  ): Promise<string | null> {
    try {
      // Validar se o veículo existe
      if (!programacao.veiculo_id) {
        this.logger.warn('Tentativa de criar reserva sem veiculo_id');
        return null;
      }

      // ✅ CORRIGIR: Remover espaços em branco do ID
      const veiculoId = programacao.veiculo_id.trim();

      const veiculo = await prisma.veiculo.findFirst({
        where: {
          id: veiculoId,
          ativo: true,
        },
      });

      if (!veiculo) {
        this.logger.warn(`Veículo ${veiculoId} não encontrado. Reserva não será criada.`);
        return null;
      }

      // Determinar datas da reserva
      const dataInicio = programacao.reserva_data_inicio
        ? new Date(programacao.reserva_data_inicio)
        : programacao.data_hora_programada || new Date();

      const dataFim = programacao.reserva_data_fim
        ? new Date(programacao.reserva_data_fim)
        : programacao.data_hora_programada || new Date();

      const horaInicio = programacao.reserva_hora_inicio || '08:00';
      const horaFim = programacao.reserva_hora_fim || '18:00';

      const finalidade = programacao.reserva_finalidade
        || `Execução de OS: ${programacao.descricao}`;

      const reserva = await prisma.reserva_veiculo.create({
        data: {
          veiculo_id: veiculoId,
          solicitante_id: osId,
          tipo_solicitante: 'ordem_servico',
          data_inicio: dataInicio,
          data_fim: dataFim,
          hora_inicio: horaInicio,
          hora_fim: horaFim,
          responsavel: programacao.responsavel || 'Sistema',
          responsavel_id: programacao.responsavel_id,
          finalidade,
          observacoes: programacao.observacoes_veiculo,
          status: 'ativa',
          criado_por: 'Sistema',
          criado_por_id: usuarioId,
        },
      });

      this.logger.log(`Reserva de veículo criada para OS ${osId}`);
      return reserva.id;
    } catch (error) {
      this.logger.error(`Erro ao criar reserva de veículo: ${error.message}`, error.stack);
      // Não lançar erro para não interromper a aprovação
      return null;
    }
  }

  /**
   * Atualiza uma reserva de veículo existente
   */
  private async atualizarReservaVeiculo(
    prisma: any,
    reservaId: string,
    programacao: any,
    usuarioId?: string
  ): Promise<void> {
    try {
      // ✅ CORRIGIR: Remover espaços em branco do ID
      const veiculoId = programacao.veiculo_id ? programacao.veiculo_id.trim() : null;

      // Determinar datas da reserva
      const dataInicio = programacao.reserva_data_inicio
        ? new Date(programacao.reserva_data_inicio)
        : programacao.data_hora_programada || new Date();

      const dataFim = programacao.reserva_data_fim
        ? new Date(programacao.reserva_data_fim)
        : programacao.data_hora_programada || new Date();

      const horaInicio = programacao.reserva_hora_inicio || '08:00';
      const horaFim = programacao.reserva_hora_fim || '18:00';

      const finalidade = programacao.reserva_finalidade
        || `Execução de OS: ${programacao.descricao}`;

      await prisma.reserva_veiculo.update({
        where: { id: reservaId },
        data: {
          veiculo_id: veiculoId,
          data_inicio: dataInicio,
          data_fim: dataFim,
          hora_inicio: horaInicio,
          hora_fim: horaFim,
          responsavel: programacao.responsavel || 'Sistema',
          responsavel_id: programacao.responsavel_id,
          finalidade,
          observacoes: programacao.observacoes_veiculo,
          atualizado_por: 'Sistema',
          atualizado_por_id: usuarioId,
        },
      });

      this.logger.log(`Reserva de veículo ${reservaId} atualizada`);
    } catch (error) {
      this.logger.error(`Erro ao atualizar reserva de veículo: ${error.message}`, error.stack);
      // Não lançar erro para não interromper a atualização
    }
  }

  /**
   * Cria uma reserva de veículo vinculada à programação (antes da aprovação)
   */
  private async criarReservaVeiculoProgramacao(
    prisma: any,
    programacao: any,
    usuarioId?: string
  ): Promise<void> {
    try {
      this.logger.log(`[RESERVA] Iniciando criação de reserva para programação ${programacao.id}`);
      this.logger.log(`[RESERVA] Veiculo ID: ${programacao.veiculo_id}`);
      this.logger.log(`[RESERVA] Necessita veículo: ${programacao.necessita_veiculo}`);

      // Validar se o veículo existe
      if (!programacao.veiculo_id) {
        this.logger.warn('[RESERVA] Tentativa de criar reserva sem veiculo_id');
        return;
      }

      // ✅ CORRIGIR: Remover espaços em branco do ID
      const veiculoId = programacao.veiculo_id.trim();
      this.logger.log(`[RESERVA] Veiculo ID (limpo): ${veiculoId}`);

      const veiculo = await prisma.veiculo.findFirst({
        where: {
          id: veiculoId,
          ativo: true,
        },
      });

      if (!veiculo) {
        this.logger.warn(`[RESERVA] Veículo ${veiculoId} não encontrado. Reserva não será criada.`);
        return;
      }

      this.logger.log(`[RESERVA] Veículo encontrado: ${veiculo.marca} ${veiculo.modelo} (${veiculo.placa})`);

      // Determinar datas da reserva
      const dataInicio = programacao.reserva_data_inicio
        ? new Date(programacao.reserva_data_inicio)
        : programacao.data_hora_programada || new Date();

      const dataFim = programacao.reserva_data_fim
        ? new Date(programacao.reserva_data_fim)
        : programacao.data_hora_programada || new Date();

      const horaInicio = programacao.reserva_hora_inicio || '08:00';
      const horaFim = programacao.reserva_hora_fim || '18:00';

      const finalidade = programacao.reserva_finalidade
        || `Programação de OS: ${programacao.descricao}`;

      // Verificar se já existe uma reserva para esta programação
      const reservaExistente = await prisma.reserva_veiculo.findFirst({
        where: {
          solicitante_id: programacao.id,
          tipo_solicitante: 'programacao_os',
        },
      });

      if (reservaExistente) {
        this.logger.log(`[RESERVA] Reserva existente encontrada: ${reservaExistente.id}, atualizando...`);

        // Atualizar reserva existente usando Prisma
        await prisma.reserva_veiculo.update({
          where: { id: reservaExistente.id },
          data: {
            veiculo_id: veiculoId,
            data_inicio: dataInicio,
            data_fim: dataFim,
            hora_inicio: horaInicio,
            hora_fim: horaFim,
            responsavel: programacao.responsavel || 'Sistema',
            responsavel_id: programacao.responsavel_id,
            finalidade,
            observacoes: programacao.observacoes_veiculo,
            status: 'ativa',
          },
        });

        // ✅ Atualizar programacao com reserva_id
        await prisma.programacoes_os.update({
          where: { id: programacao.id },
          data: { reserva_id: reservaExistente.id },
        });

        this.logger.log(`[RESERVA] ✅ Reserva de veículo atualizada: ${reservaExistente.id}`);
      } else {
        this.logger.log(`[RESERVA] Nenhuma reserva existente, criando nova...`);

        // Criar nova reserva usando Prisma (gerará CUID automaticamente)
        const novaReserva = await prisma.reserva_veiculo.create({
          data: {
            veiculo_id: veiculoId,
            solicitante_id: programacao.id,
            tipo_solicitante: 'programacao_os',
            data_inicio: dataInicio,
            data_fim: dataFim,
            hora_inicio: horaInicio,
            hora_fim: horaFim,
            responsavel: programacao.responsavel || 'Sistema',
            responsavel_id: programacao.responsavel_id,
            finalidade,
            observacoes: programacao.observacoes_veiculo,
            status: 'ativa',
            criado_por: 'Sistema',
            criado_por_id: usuarioId,
          },
        });

        // ✅ Atualizar programacao com reserva_id
        await prisma.programacoes_os.update({
          where: { id: programacao.id },
          data: { reserva_id: novaReserva.id },
        });

        this.logger.log(`[RESERVA] ✅ Reserva de veículo criada: ${novaReserva.id}`);
      }
    } catch (error) {
      this.logger.error(`[RESERVA] ❌ Erro ao criar/atualizar reserva de veículo: ${error.message}`, error.stack);
      // Não lançar erro para não interromper a criação/edição
    }
  }

  private async obterEstatisticas(): Promise<any> {
    const stats = await this.prisma.programacoes_os.groupBy({
      by: ['status'],
      where: { deletado_em: null },
      _count: true,
    });

    const resultado = {
      pendentes: 0,
      aprovadas: 0,
      finalizadas: 0,
      canceladas: 0,
    };

    stats.forEach(stat => {
      switch (stat.status) {
        case StatusProgramacaoOS.PENDENTE:
          resultado.pendentes = stat._count;
          break;
        case StatusProgramacaoOS.APROVADA:
          resultado.aprovadas = stat._count;
          break;
        case StatusProgramacaoOS.FINALIZADA:
          resultado.finalizadas = stat._count;
          break;
        case StatusProgramacaoOS.CANCELADA:
          resultado.canceladas = stat._count;
          break;
      }
    });

    return resultado;
  }

  private mapearParaResponse(programacao: any): ProgramacaoResponseDto {
    return {
      id: programacao.id,
      criado_em: programacao.criado_em,
      atualizado_em: programacao.atualizado_em,
      deletado_em: programacao.deletado_em,
      codigo: programacao.codigo,
      descricao: programacao.descricao,
      local: programacao.local,
      ativo: programacao.ativo,
      condicoes: programacao.condicoes,
      status: programacao.status,
      tipo: programacao.tipo,
      prioridade: programacao.prioridade,
      origem: programacao.origem,
      planta_id: programacao.planta_id,
      equipamento_id: programacao.equipamento_id,
      anomalia_id: programacao.anomalia_id,
      plano_manutencao_id: programacao.plano_manutencao_id,
      solicitacao_servico_id: programacao.solicitacao_servico_id,
      dados_origem: programacao.dados_origem,
      data_previsao_inicio: programacao.data_previsao_inicio,
      data_previsao_fim: programacao.data_previsao_fim,
      tempo_estimado: Number(programacao.tempo_estimado),
      duracao_estimada: Number(programacao.duracao_estimada),
      necessita_veiculo: programacao.necessita_veiculo,
      veiculo_id: programacao.veiculo_id,
      reserva_data_inicio: programacao.reserva_data_inicio,
      reserva_data_fim: programacao.reserva_data_fim,
      reserva_hora_inicio: programacao.reserva_hora_inicio,
      reserva_hora_fim: programacao.reserva_hora_fim,
      reserva_finalidade: programacao.reserva_finalidade,
      assentos_necessarios: programacao.assentos_necessarios,
      carga_necessaria: programacao.carga_necessaria ? Number(programacao.carga_necessaria) : null,
      observacoes_veiculo: programacao.observacoes_veiculo,
      reserva_id: programacao.reserva_id,
      data_hora_programada: programacao.data_hora_programada,
      responsavel: programacao.responsavel,
      responsavel_id: programacao.responsavel_id,
      time_equipe: programacao.time_equipe,
      orcamento_previsto: programacao.orcamento_previsto ? Number(programacao.orcamento_previsto) : null,
      observacoes: programacao.observacoes,
      observacoes_programacao: programacao.observacoes_programacao,
      justificativa: programacao.justificativa,
      motivo_rejeicao: programacao.motivo_rejeicao,
      sugestoes_melhoria: programacao.sugestoes_melhoria,
      motivo_cancelamento: programacao.motivo_cancelamento,
      tarefas_programacao: programacao.tarefas_programacao?.map((tp: any) => ({
        id: tp.id,
        programacao_id: tp.programacao_id,
        tarefa_id: tp.tarefa_id,
        ordem: tp.ordem,
        status: tp.status,
        observacoes: tp.observacoes,
        created_at: tp.created_at,
        updated_at: tp.updated_at,
        tarefa: tp.tarefa ? {
          id: tp.tarefa.id,
          nome: tp.tarefa.nome,
          categoria: tp.tarefa.categoria,
          tipo_manutencao: tp.tarefa.tipo_manutencao,
          tempo_estimado: Number(tp.tarefa.tempo_estimado),
          duracao_estimada: Number(tp.tarefa.duracao_estimada),
        } : null,
      })) || [],
      criado_por: programacao.criado_por,
      criado_por_id: programacao.criado_por_id,
      analisado_por: programacao.analisado_por,
      analisado_por_id: programacao.analisado_por_id,
      data_analise: programacao.data_analise,
      observacoes_analise: programacao.observacoes_analise,
      aprovado_por: programacao.aprovado_por,
      aprovado_por_id: programacao.aprovado_por_id,
      data_aprovacao: programacao.data_aprovacao,
      observacoes_aprovacao: programacao.observacoes_aprovacao,
      ajustes_orcamento: programacao.ajustes_orcamento ? Number(programacao.ajustes_orcamento) : null,
      data_programada_sugerida: programacao.data_programada_sugerida,
      hora_programada_sugerida: programacao.hora_programada_sugerida,
      finalizado_por: programacao.finalizado_por,
      finalizado_por_id: programacao.finalizado_por_id,
      data_finalizacao: programacao.data_finalizacao,
      observacoes_finalizacao: programacao.observacoes_finalizacao,
    };
  }

  private mapearParaDetalhes(programacao: any, reserva?: any): ProgramacaoDetalhesResponseDto {
    const base = this.mapearParaResponse(programacao);

    return {
      ...base,
      materiais: programacao.materiais?.map((m: any) => ({
        id: m.id,
        programacao_id: m.programacao_id,
        descricao: m.descricao,
        quantidade_planejada: Number(m.quantidade_planejada),
        unidade: m.unidade,
        custo_unitario: m.custo_unitario ? Number(m.custo_unitario) : null,
        custo_total: m.custo_total ? Number(m.custo_total) : null,
        confirmado: m.confirmado,
        disponivel: m.disponivel,
        observacoes: m.observacoes,
        created_at: m.created_at,
        updated_at: m.updated_at,
      })) || [],
      ferramentas: programacao.ferramentas?.map((f: any) => ({
        id: f.id,
        programacao_id: f.programacao_id,
        descricao: f.descricao,
        quantidade: f.quantidade,
        confirmada: f.confirmada,
        disponivel: f.disponivel,
        observacoes: f.observacoes,
        created_at: f.created_at,
        updated_at: f.updated_at,
      })) || [],
      tecnicos: programacao.tecnicos?.map((t: any) => ({
        id: t.id,
        programacao_id: t.programacao_id,
        nome: t.nome,
        especialidade: t.especialidade,
        horas_estimadas: Number(t.horas_estimadas),
        custo_hora: t.custo_hora ? Number(t.custo_hora) : null,
        custo_total: t.custo_total ? Number(t.custo_total) : null,
        disponivel: t.disponivel,
        tecnico_id: t.tecnico_id,
        created_at: t.created_at,
        updated_at: t.updated_at,
      })) || [],
      itens_orcamento: programacao.itens_orcamento?.map((i: any) => ({
        id: i.id,
        programacao_id: i.programacao_id,
        descricao: i.descricao,
        valor: Number(i.valor),
        created_at: i.created_at,
        updated_at: i.updated_at,
      })) || [],
      historico: programacao.historico?.map((h: any) => ({
        id: h.id,
        programacao_id: h.programacao_id,
        acao: h.acao,
        usuario: h.usuario,
        usuario_id: h.usuario_id,
        data: h.data,
        observacoes: h.observacoes,
        status_anterior: h.status_anterior,
        status_novo: h.status_novo,
        dados_extras: h.dados_extras,
      })) || [],
      ordem_servico: programacao.ordem_servico,
      solicitacao_servico: programacao.solicitacao_servico ? {
        id: programacao.solicitacao_servico.id,
        numero: programacao.solicitacao_servico.numero,
        titulo: programacao.solicitacao_servico.titulo,
        descricao: programacao.solicitacao_servico.descricao,
        tipo: programacao.solicitacao_servico.tipo,
        prioridade: programacao.solicitacao_servico.prioridade,
        status: programacao.solicitacao_servico.status,
        local: programacao.solicitacao_servico.local,
        solicitante_nome: programacao.solicitacao_servico.solicitante_nome,
        data_solicitacao: programacao.solicitacao_servico.data_solicitacao,
      } : null,
      reserva_veiculo: reserva ? {
        id: reserva.id,
        veiculo_id: reserva.veiculo_id,
        data_inicio: reserva.data_inicio,
        data_fim: reserva.data_fim,
        hora_inicio: reserva.hora_inicio,
        hora_fim: reserva.hora_fim,
        responsavel: reserva.responsavel,
        finalidade: reserva.finalidade,
        status: reserva.status,
        veiculo: reserva.veiculo,
      } : null,
    };
  }
}
