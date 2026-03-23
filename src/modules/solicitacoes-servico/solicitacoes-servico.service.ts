import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  CreateSolicitacaoDto,
  UpdateSolicitacaoDto,
  SolicitacaoFiltersDto,
  SolicitacaoResponseDto,
  ListarSolicitacoesResponseDto,
  SolicitacaoStatsDto,
  AnalisarSolicitacaoDto,
  AprovarSolicitacaoDto,
  RejeitarSolicitacaoDto,
  CancelarSolicitacaoDto,
  AdicionarComentarioDto,
} from './dto';
import { Prisma } from '@prisma/client';

// Import the enum from Prisma
import { StatusSolicitacaoServico } from '@prisma/client';

@Injectable()
export class SolicitacoesServicoService {
  private readonly logger = new Logger(SolicitacoesServicoService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mapear solicitação do Prisma para DTO
   */
  private mapToResponseDto(solicitacao: any): SolicitacaoResponseDto {
    return {
      ...solicitacao,
      tempo_estimado: solicitacao.tempo_estimado ? Number(solicitacao.tempo_estimado) : null,
      custo_estimado: solicitacao.custo_estimado ? Number(solicitacao.custo_estimado) : null,
    } as SolicitacaoResponseDto;
  }

  /**
   * Gera um número único para a solicitação
   */
  private async gerarNumeroSolicitacao(): Promise<string> {
    const ano = new Date().getFullYear();

    // Busca a última solicitação do ano
    const ultimaSolicitacao = await this.prisma.solicitacoes_servico.findFirst({
      where: {
        numero: {
          startsWith: `SSV-${ano}-`,
        },
      },
      orderBy: {
        numero: 'desc',
      },
    });

    let sequencial = 1;
    if (ultimaSolicitacao) {
      const partes = ultimaSolicitacao.numero.split('-');
      sequencial = parseInt(partes[2]) + 1;
    }

    return `SSV-${ano}-${sequencial.toString().padStart(4, '0')}`;
  }

  /**
   * Registra histórico de ações
   */
  private async registrarHistorico(
    prisma: any,
    solicitacao_id: string,
    acao: string,
    usuario_nome: string,
    usuario_id?: string,
    observacoes?: string,
    status_anterior?: StatusSolicitacaoServico,
    status_novo?: StatusSolicitacaoServico,
    dados_extras?: any,
  ) {
    await prisma.historico_solicitacao_servico.create({
      data: {
        solicitacao_id,
        acao,
        usuario_nome,
        usuario_id,
        observacoes,
        status_anterior,
        status_novo,
        dados_extras,
      },
    });
  }

  /**
   * Criar nova solicitação
   */
  async create(
    createDto: CreateSolicitacaoDto,
    usuarioId?: string,
  ): Promise<SolicitacaoResponseDto> {
    return await this.prisma.$transaction(async (prisma) => {
      // Gerar número único
      const numero = await this.gerarNumeroSolicitacao();

      // Se temos o usuarioId, buscar o nome do usuário
      let solicitante_nome = 'Sistema';
      if (usuarioId) {
        const usuario = await prisma.usuarios.findUnique({
          where: { id: usuarioId },
          select: { nome: true },
        });
        if (usuario) {
          solicitante_nome = usuario.nome;
        }
      }

      // Determinar o planta_id
      let planta_id = createDto.planta_id?.trim(); // Adicionar trim() para remover espaços

      // Se não foi fornecido planta_id mas foi fornecido unidade_id, buscar da unidade
      if (!planta_id && createDto.unidade_id) {
        const unidade = await prisma.unidades.findUnique({
          where: { id: createDto.unidade_id.trim() }, // Adicionar trim() aqui também
          select: { planta_id: true },
        });

        if (!unidade) {
          throw new NotFoundException(`Unidade com ID ${createDto.unidade_id} não encontrada`);
        }

        planta_id = unidade.planta_id?.trim(); // Adicionar trim() ao resultado também
      }

      // Validar se planta_id foi definido
      if (!planta_id) {
        throw new BadRequestException('É necessário informar planta_id ou unidade_id');
      }

      // Verificar se a planta existe e não está deletada
      const plantaExiste = await prisma.plantas.findFirst({
        where: {
          id: planta_id.trim(), // Garantir que o ID está sem espaços
          deleted_at: null  // Garantir que a planta não está deletada
        },
        select: { id: true },
      });

      if (!plantaExiste) {
        throw new NotFoundException(`Planta com ID ${planta_id} não encontrada ou foi deletada`);
      }

      // Criar solicitação com solicitante_id e solicitante_nome preenchidos
      // Removido o include da planta para evitar erro com soft delete
      const solicitacao = await prisma.solicitacoes_servico.create({
        data: {
          ...createDto,
          planta_id, // Usar o planta_id determinado
          numero,
          status: createDto.status || StatusSolicitacaoServico.RASCUNHO,
          solicitante_id: usuarioId || null,
          solicitante_nome: solicitante_nome,
        } as Prisma.solicitacoes_servicoUncheckedCreateInput,
        include: {
          // Removido planta do include pois pode estar com deleted_at
          equipamento: true,
          unidade: true, // Incluir unidade
          proprietario: true, // Incluir proprietário
          solicitante: true,
        },
      });

      // Buscar a planta manualmente apenas se não estiver deletada
      const planta = await prisma.plantas.findFirst({
        where: {
          id: planta_id.trim(), // Garantir que o ID está sem espaços
          deleted_at: null
        },
      });

      // Associar tarefas se fornecidas
      if (createDto.tarefas_ids && createDto.tarefas_ids.length > 0) {
        await this.associarTarefas(prisma, solicitacao.id, createDto.tarefas_ids);
      }

      // Adicionar a planta ao objeto de resposta
      const solicitacaoCompleta = {
        ...solicitacao,
        planta: planta,
      };

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        solicitacao.id,
        'CRIACAO',
        solicitante_nome,
        usuarioId,
        'Solicitação criada',
        null,
        solicitacao.status,
      );

      this.logger.log(`Solicitação ${numero} criada com sucesso`);
      return this.mapToResponseDto(solicitacaoCompleta);
    });
  }

  /**
   * Listar solicitações com filtros
   */
  async findAll(
    filters: SolicitacaoFiltersDto,
  ): Promise<ListarSolicitacoesResponseDto> {
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
      proprietario_id,
      equipamento_id,
      departamento,
      solicitante_nome,
      data_inicio,
      data_fim,
      sortBy = 'data_solicitacao',
      sortOrder = 'desc',
    } = filters;

    const where: Prisma.solicitacoes_servicoWhereInput = {
      deleted_at: null,
    };

    // Filtro de busca textual
    if (search) {
      where.OR = [
        { titulo: { contains: search, mode: 'insensitive' } },
        { descricao: { contains: search, mode: 'insensitive' } },
        { local: { contains: search, mode: 'insensitive' } },
        { numero: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Filtros específicos
    if (status) where.status = status;
    if (tipo) where.tipo = tipo as any;
    if (prioridade) where.prioridade = prioridade;
    if (origem) where.origem = origem as any;
    if (planta_id) where.planta_id = planta_id;
    if (unidade_id) (where as any).unidade_id = unidade_id;
    if (proprietario_id) (where as any).proprietario_id = proprietario_id;
    if (equipamento_id) where.equipamento_id = equipamento_id;
    if (departamento) where.departamento = { contains: departamento, mode: 'insensitive' };
    if (solicitante_nome) where.solicitante_nome = { contains: solicitante_nome, mode: 'insensitive' };

    // Filtro de datas
    if (data_inicio || data_fim) {
      where.data_solicitacao = {};
      if (data_inicio) where.data_solicitacao.gte = new Date(data_inicio);
      if (data_fim) where.data_solicitacao.lte = new Date(data_fim);
    }

    // Contar total
    const total = await this.prisma.solicitacoes_servico.count({ where });

    // Buscar dados - removendo unidade do include pois pode ter problemas com espaços
    const solicitacoes = await this.prisma.solicitacoes_servico.findMany({
      where,
      include: {
        // Removido planta e unidade do include - serão buscados manualmente
        equipamento: {
          select: {
            id: true,
            nome: true,
            tag: true,
            tipo_equipamento: true,
          },
        },
        proprietario: true, // Incluir proprietário
        anexos: {
          select: {
            id: true,
            nome_arquivo: true,
            tipo_documento: true,
            tamanho: true,
          },
        },
        _count: {
          select: {
            comentarios: true,
            anexos: true,
          },
        },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: {
        [sortBy]: sortOrder,
      },
    });

    // Buscar plantas e unidades manualmente para evitar problemas com soft delete e espaços
    const solicitacoesCompletas = await Promise.all(
      solicitacoes.map(async (solicitacao) => {
        // Buscar planta
        let planta = null;
        if (solicitacao.planta_id) {
          // Usar raw query com TRIM para garantir match mesmo com espaços
          const plantaResult = await this.prisma.$queryRaw`
            SELECT id, nome, cidade, uf
            FROM plantas
            WHERE TRIM(id) = TRIM(${solicitacao.planta_id})
              AND deleted_at IS NULL
            LIMIT 1
          `;
          planta = plantaResult[0] || null;
        }

        // Buscar unidade
        let unidade = null;
        if (solicitacao.unidade_id) {
          // Usar raw query com TRIM para garantir match mesmo com espaços
          const unidadeResult = await this.prisma.$queryRaw`
            SELECT id, nome, tipo, cidade, estado
            FROM unidades
            WHERE TRIM(id) = TRIM(${solicitacao.unidade_id})
              AND deleted_at IS NULL
            LIMIT 1
          `;
          unidade = unidadeResult[0] || null;
        }

        return {
          ...solicitacao,
          planta: planta,
          unidade: unidade
        };
      })
    );

    return {
      data: solicitacoesCompletas.map(s => this.mapToResponseDto(s)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Buscar solicitação por ID
   */
  async findOne(id: string): Promise<SolicitacaoResponseDto> {
    const solicitacao = await this.prisma.solicitacoes_servico.findUnique({
      where: { id },
      include: {
        // Removido planta e unidade do include - serão buscados manualmente
        equipamento: true,
        proprietario: true, // Incluir proprietário
        solicitante: true, // Incluir solicitante
        anexos: true,
        historico: {
          orderBy: { data: 'desc' },
        },
        comentarios: {
          orderBy: { created_at: 'desc' },
        },
        tarefas: {
          include: {
            tarefa: {
              select: {
                id: true,
                tag: true,
                nome: true,
                descricao: true,
                categoria: true,
                criticidade: true,
                tempo_estimado: true,
                tipo_manutencao: true
              }
            }
          },
          orderBy: { ordem: 'asc' }
        }
      },
    });

    if (!solicitacao || solicitacao.deleted_at) {
      throw new NotFoundException('Solicitação não encontrada');
    }

    // Buscar a planta manualmente usando TRIM
    let planta = null;
    if (solicitacao.planta_id) {
      const plantaResult = await this.prisma.$queryRaw`
        SELECT id, nome, cidade, uf, cnpj
        FROM plantas
        WHERE TRIM(id) = TRIM(${solicitacao.planta_id})
          AND deleted_at IS NULL
        LIMIT 1
      `;
      planta = plantaResult[0] || null;
    }

    // Buscar a unidade manualmente usando TRIM
    let unidade = null;
    if (solicitacao.unidade_id) {
      const unidadeResult = await this.prisma.$queryRaw`
        SELECT id, nome, tipo, cidade, estado, potencia, status
        FROM unidades
        WHERE TRIM(id) = TRIM(${solicitacao.unidade_id})
          AND deleted_at IS NULL
        LIMIT 1
      `;
      unidade = unidadeResult[0] || null;
    }

    // Mapear tarefas associadas
    const tarefas = solicitacao.tarefas?.map(ts => ({
      ...ts.tarefa,
      ordem: ts.ordem,
      observacoes: ts.observacoes
    })) || [];

    const solicitacaoCompleta = {
      ...solicitacao,
      planta: planta,
      unidade: unidade,
      tarefas: tarefas
    };

    return this.mapToResponseDto(solicitacaoCompleta);
  }

  /**
   * Atualizar solicitação
   */
  async update(
    id: string,
    updateDto: UpdateSolicitacaoDto,
    usuarioId?: string,
  ): Promise<SolicitacaoResponseDto> {
    const solicitacao = await this.findOne(id);

    // Verificar se pode ser editada
    if (solicitacao.status !== 'RASCUNHO') {
      throw new ConflictException(
        'Apenas solicitações em rascunho podem ser editadas',
      );
    }

    return await this.prisma.$transaction(async (prisma) => {
      const solicitacaoAtualizada = await prisma.solicitacoes_servico.update({
        where: { id },
        data: updateDto as Prisma.solicitacoes_servicoUncheckedUpdateInput,
        include: {
          // Removido planta do include para evitar erro com soft delete
          equipamento: true,
          unidade: true, // Incluir unidade
          proprietario: true, // Incluir proprietário
        },
      });

      // Buscar a planta manualmente se existir e não estiver deletada
      let planta = null;
      if (solicitacaoAtualizada.planta_id) {
        planta = await prisma.plantas.findFirst({
          where: {
            id: solicitacaoAtualizada.planta_id,
            deleted_at: null
          }
        });
      }

      const solicitacaoCompleta = {
        ...solicitacaoAtualizada,
        planta: planta
      };

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        id,
        'ATUALIZACAO',
        'Sistema',
        usuarioId,
        'Solicitação atualizada',
      );

      return this.mapToResponseDto(solicitacaoCompleta);
    });
  }

  /**
   * Enviar solicitação para análise
   */
  async enviar(
    id: string,
    usuarioId?: string,
  ): Promise<SolicitacaoResponseDto> {
    const solicitacao = await this.findOne(id);

    if (solicitacao.status !== StatusSolicitacaoServico.RASCUNHO) {
      throw new ConflictException('Apenas rascunhos podem ser enviados para análise');
    }

    return await this.prisma.$transaction(async (prisma) => {
      const solicitacaoAtualizada = await prisma.solicitacoes_servico.update({
        where: { id },
        data: {
          status: StatusSolicitacaoServico.EM_ANALISE,
        },
        include: {
          // Removido planta do include para evitar erro com soft delete
          equipamento: true,
          unidade: true, // Incluir unidade
          proprietario: true, // Incluir proprietário
        },
      });

      // Buscar a planta manualmente
      let planta = null;
      if (solicitacaoAtualizada.planta_id) {
        planta = await prisma.plantas.findFirst({
          where: {
            id: solicitacaoAtualizada.planta_id,
            deleted_at: null
          }
        });
      }

      const solicitacaoCompleta = {
        ...solicitacaoAtualizada,
        planta: planta
      };

      await this.registrarHistorico(
        prisma,
        id,
        'ENVIO_ANALISE',
        'Sistema',
        usuarioId,
        'Solicitação enviada para análise',
        StatusSolicitacaoServico.RASCUNHO,
        StatusSolicitacaoServico.EM_ANALISE,
      );

      this.logger.log(`Solicitação ${solicitacao.numero} enviada para análise`);
      return this.mapToResponseDto(solicitacaoCompleta);
    });
  }


  /**
   * Aprovar solicitação
   */
  async aprovar(
    id: string,
    dto: AprovarSolicitacaoDto,
    aprovadorNome: string,
    aprovadorId?: string,
  ): Promise<SolicitacaoResponseDto> {
    const solicitacao = await this.findOne(id);

    if (solicitacao.status !== StatusSolicitacaoServico.EM_ANALISE) {
      throw new ConflictException('Apenas solicitações em análise podem ser aprovadas');
    }

    return await this.prisma.$transaction(async (prisma) => {
      const updateData: any = {
        status: StatusSolicitacaoServico.APROVADA,
        aprovado_por_nome: aprovadorNome,
        aprovado_por_id: aprovadorId,
        data_aprovacao: new Date(),
        observacoes_aprovacao: dto.observacoes_aprovacao,
      };

      if (dto.data_prevista_inicio) {
        updateData.data_prevista_inicio = new Date(dto.data_prevista_inicio);
      }
      if (dto.data_prevista_fim) {
        updateData.data_prevista_fim = new Date(dto.data_prevista_fim);
      }

      const solicitacaoAtualizada = await prisma.solicitacoes_servico.update({
        where: { id },
        data: updateData,
        include: {
          // Removido planta do include para evitar erro com soft delete
          equipamento: true,
          unidade: true, // Incluir unidade
          proprietario: true, // Incluir proprietário
        },
      });

      await this.registrarHistorico(
        prisma,
        id,
        'APROVACAO',
        aprovadorNome,
        aprovadorId,
        dto.observacoes_aprovacao,
        StatusSolicitacaoServico.EM_ANALISE,
        StatusSolicitacaoServico.APROVADA,
      );

      // Buscar a planta manualmente
      let planta = null;
      if (solicitacaoAtualizada.planta_id) {
        planta = await prisma.plantas.findFirst({
          where: {
            id: solicitacaoAtualizada.planta_id,
            deleted_at: null
          }
        });
      }

      const solicitacaoCompleta = {
        ...solicitacaoAtualizada,
        planta: planta
      };

      this.logger.log(`Solicitação ${solicitacao.numero} aprovada`);
      return this.mapToResponseDto(solicitacaoCompleta);
    });
  }

  /**
   * Rejeitar solicitação
   */
  async rejeitar(
    id: string,
    dto: RejeitarSolicitacaoDto,
    rejeitadorNome: string,
    rejeitadorId?: string,
  ): Promise<SolicitacaoResponseDto> {
    const solicitacao = await this.findOne(id);

    if (solicitacao.status !== StatusSolicitacaoServico.EM_ANALISE) {
      throw new ConflictException('Apenas solicitações em análise podem ser rejeitadas');
    }

    return await this.prisma.$transaction(async (prisma) => {
      const solicitacaoAtualizada = await prisma.solicitacoes_servico.update({
        where: { id },
        data: {
          status: StatusSolicitacaoServico.REJEITADA,
          motivo_rejeicao: dto.motivo_rejeicao,
          sugestoes_alternativas: dto.sugestoes_alternativas,
        },
        include: {
          // Removido planta do include para evitar erro com soft delete
          equipamento: true,
          unidade: true, // Incluir unidade
          proprietario: true, // Incluir proprietário
        },
      });

      await this.registrarHistorico(
        prisma,
        id,
        'REJEICAO',
        rejeitadorNome,
        rejeitadorId,
        dto.motivo_rejeicao,
        StatusSolicitacaoServico.EM_ANALISE,
        StatusSolicitacaoServico.REJEITADA,
      );

      // Buscar a planta manualmente
      let planta = null;
      if (solicitacaoAtualizada.planta_id) {
        planta = await prisma.plantas.findFirst({
          where: {
            id: solicitacaoAtualizada.planta_id,
            deleted_at: null
          }
        });
      }

      const solicitacaoCompleta = {
        ...solicitacaoAtualizada,
        planta: planta
      };

      this.logger.log(`Solicitação ${solicitacao.numero} rejeitada`);
      return this.mapToResponseDto(solicitacaoCompleta);
    });
  }

  /**
   * Cancelar solicitação
   */
  async cancelar(
    id: string,
    dto: CancelarSolicitacaoDto,
    canceladorNome: string,
    canceladorId?: string,
  ): Promise<SolicitacaoResponseDto> {
    const solicitacao = await this.findOne(id);

    if (
      solicitacao.status === StatusSolicitacaoServico.CONCLUIDA ||
      solicitacao.status === StatusSolicitacaoServico.CANCELADA ||
      solicitacao.status === StatusSolicitacaoServico.REJEITADA
    ) {
      throw new ConflictException('Esta solicitação não pode ser cancelada');
    }

    return await this.prisma.$transaction(async (prisma) => {
      const statusAnterior = solicitacao.status;

      const solicitacaoAtualizada = await prisma.solicitacoes_servico.update({
        where: { id },
        data: {
          status: StatusSolicitacaoServico.CANCELADA,
          motivo_cancelamento: dto.motivo_cancelamento,
          cancelado_por_nome: canceladorNome,
          cancelado_por_id: canceladorId,
          data_cancelamento: new Date(),
        },
        include: {
          // Removido planta do include para evitar erro com soft delete
          equipamento: true,
          unidade: true, // Incluir unidade
          proprietario: true, // Incluir proprietário
        },
      });

      await this.registrarHistorico(
        prisma,
        id,
        'CANCELAMENTO',
        canceladorNome,
        canceladorId,
        dto.motivo_cancelamento,
        statusAnterior,
        StatusSolicitacaoServico.CANCELADA,
      );

      // Buscar a planta manualmente
      let planta = null;
      if (solicitacaoAtualizada.planta_id) {
        planta = await prisma.plantas.findFirst({
          where: {
            id: solicitacaoAtualizada.planta_id,
            deleted_at: null
          }
        });
      }

      const solicitacaoCompleta = {
        ...solicitacaoAtualizada,
        planta: planta
      };

      this.logger.log(`Solicitação ${solicitacao.numero} cancelada`);
      return this.mapToResponseDto(solicitacaoCompleta);
    });
  }

  /**
   * Remover solicitação (soft delete)
   */
  async remove(id: string, usuarioId?: string): Promise<void> {
    const solicitacao = await this.findOne(id);

    // Debug para ver o valor real do status
    this.logger.log(`[DEBUG] Status da solicitação ${id}: ${solicitacao.status}, tipo: ${typeof solicitacao.status}`);
    this.logger.log(`[DEBUG] RASCUNHO value: ${StatusSolicitacaoServico.RASCUNHO}`);
    this.logger.log(`[DEBUG] REJEITADA value: ${StatusSolicitacaoServico.REJEITADA}`);
    this.logger.log(`[DEBUG] CANCELADA value: ${StatusSolicitacaoServico.CANCELADA}`);

    // Permitir exclusão de rascunhos, rejeitadas e canceladas
    // Comparar diretamente com as strings do enum
    if (solicitacao.status !== StatusSolicitacaoServico.RASCUNHO &&
        solicitacao.status !== StatusSolicitacaoServico.REJEITADA &&
        solicitacao.status !== StatusSolicitacaoServico.CANCELADA) {
      throw new ConflictException('Apenas rascunhos, solicitações rejeitadas ou canceladas podem ser excluídas');
    }

    await this.prisma.solicitacoes_servico.update({
      where: { id },
      data: {
        deleted_at: new Date(),
      },
    });

    this.logger.log(`Solicitação ${solicitacao.numero} removida`);
  }

  /**
   * Adicionar comentário
   */
  async adicionarComentario(
    id: string,
    dto: AdicionarComentarioDto,
  ): Promise<any> {
    const solicitacao = await this.findOne(id);

    const comentario = await this.prisma.comentarios_solicitacao_servico.create({
      data: {
        solicitacao_id: id,
        comentario: dto.comentario,
        autor: dto.usuario_nome,
        autor_id: dto.usuario_id,
      },
    });

    this.logger.log(`Comentário adicionado à solicitação ${solicitacao.numero}`);
    return comentario;
  }

  /**
   * Listar comentários
   */
  async listarComentarios(id: string): Promise<any[]> {
    const solicitacao = await this.findOne(id);

    return await this.prisma.comentarios_solicitacao_servico.findMany({
      where: { solicitacao_id: id },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Obter estatísticas
   */
  async getStats(): Promise<SolicitacaoStatsDto> {
    const [
      total,
      rascunhos,
      emAnalise,
      aprovadas,
      osGerada,
      emExecucao,
      concluidas,
      canceladas,
      rejeitadas,
      porPrioridade,
      porTipo,
    ] = await Promise.all([
      this.prisma.solicitacoes_servico.count({
        where: { deleted_at: null },
      }),
      this.prisma.solicitacoes_servico.count({
        where: { status: StatusSolicitacaoServico.RASCUNHO, deleted_at: null },
      }),
      this.prisma.solicitacoes_servico.count({
        where: { status: StatusSolicitacaoServico.EM_ANALISE, deleted_at: null },
      }),
      this.prisma.solicitacoes_servico.count({
        where: { status: StatusSolicitacaoServico.APROVADA, deleted_at: null },
      }),
      this.prisma.solicitacoes_servico.count({
        where: { status: StatusSolicitacaoServico.OS_GERADA, deleted_at: null },
      }),
      this.prisma.solicitacoes_servico.count({
        where: { status: StatusSolicitacaoServico.EM_EXECUCAO, deleted_at: null },
      }),
      this.prisma.solicitacoes_servico.count({
        where: { status: StatusSolicitacaoServico.CONCLUIDA, deleted_at: null },
      }),
      this.prisma.solicitacoes_servico.count({
        where: { status: StatusSolicitacaoServico.CANCELADA, deleted_at: null },
      }),
      this.prisma.solicitacoes_servico.count({
        where: { status: StatusSolicitacaoServico.REJEITADA, deleted_at: null },
      }),
      // Por prioridade
      this.prisma.solicitacoes_servico.groupBy({
        by: ['prioridade'],
        where: { deleted_at: null },
        _count: true,
      }),
      // Por tipo
      this.prisma.solicitacoes_servico.groupBy({
        by: ['tipo'],
        where: { deleted_at: null },
        _count: true,
      }),
    ]);

    // Processar dados de prioridade
    const prioridadeMap = {
      baixa: 0,
      media: 0,
      alta: 0,
      urgente: 0,
    };

    porPrioridade.forEach((item) => {
      prioridadeMap[item.prioridade.toLowerCase()] = item._count;
    });

    // Processar dados de tipo
    const tipoMap: Record<string, number> = {};
    porTipo.forEach((item) => {
      tipoMap[item.tipo] = item._count;
    });

    // Calcular taxa de aprovação
    const totalAnalisadas = aprovadas + rejeitadas;
    const taxaAprovacao = totalAnalisadas > 0
      ? Math.round((aprovadas / totalAnalisadas) * 100)
      : 0;

    // Calcular tempo médio de resposta (simplificado)
    const tempoMedioResposta = 3; // dias (placeholder)

    return {
      total,
      aguardando: rascunhos, // Usando rascunhos no lugar de aguardando já que AGUARDANDO foi removido
      emAnalise,
      aprovadas,
      osGerada,
      emExecucao,
      concluidas,
      canceladas,
      rejeitadas,
      porPrioridade: prioridadeMap,
      porTipo: tipoMap,
      taxaAprovacao,
      tempoMedioResposta,
    };
  }

  /**
   * DEBUG - Check unidade data
   */
  async debugCheckUnidade(): Promise<any> {
    // Get last created solicitacao
    const lastSolicitacao = await this.prisma.solicitacoes_servico.findFirst({
      orderBy: { created_at: 'desc' },
      include: {
        unidade: true,
        planta: true,
        proprietario: true,
      },
    });

    if (!lastSolicitacao) {
      return { message: 'No solicitacoes found' };
    }

    // Also check the raw unidade
    let unidadeData = null;
    if (lastSolicitacao.unidade_id) {
      unidadeData = await this.prisma.unidades.findUnique({
        where: { id: lastSolicitacao.unidade_id },
      });
    }

    return {
      numero: lastSolicitacao.numero,
      unidade_id: lastSolicitacao.unidade_id,
      unidade_included: lastSolicitacao.unidade,
      unidade_raw: unidadeData,
      planta_id: lastSolicitacao.planta_id,
      planta_included: lastSolicitacao.planta,
      proprietario_id: lastSolicitacao.proprietario_id,
      proprietario_included: lastSolicitacao.proprietario,
    };
  }

  /**
   * Atualizar status para OS_GERADA
   */
  async marcarComoOSGerada(
    id: string,
    programacao_os_id: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (prisma) => {
      await prisma.solicitacoes_servico.update({
        where: { id },
        data: {
          status: StatusSolicitacaoServico.OS_GERADA,
          programacao_os_id,
        },
      });

      await this.registrarHistorico(
        prisma,
        id,
        'GERACAO_OS',
        'Sistema',
        null,
        `Programação OS gerada: ${programacao_os_id}`,
        StatusSolicitacaoServico.APROVADA,
        StatusSolicitacaoServico.OS_GERADA,
      );
    });
  }

  /**
   * Associar tarefas independentes à solicitação
   */
  private async associarTarefas(
    prisma: any,
    solicitacaoId: string,
    tarefasIds: string[]
  ) {
    // Verificar se todas as tarefas existem e não têm plano
    const tarefas = await prisma.tarefas.findMany({
      where: {
        id: { in: tarefasIds },
        plano_manutencao_id: null,
        deleted_at: null
      }
    });

    if (tarefas.length !== tarefasIds.length) {
      throw new BadRequestException('Algumas tarefas não existem ou já estão associadas a um plano');
    }

    // Criar associações
    const associacoes = tarefasIds.map((tarefaId, index) => ({
      id: this.generateId(), // Gerar ID único
      tarefa_id: tarefaId,
      solicitacao_id: solicitacaoId,
      ordem: index + 1
    }));

    await prisma.tarefas_solicitacoes.createMany({
      data: associacoes
    });
  }

  /**
   * Gerar ID único (CUID)
   */
  private generateId(): string {
    // Implementação simplificada de CUID
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substr(2, 9);
    return `c${timestamp}${randomStr}`.substr(0, 26);
  }
}