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

      // Criar solicitação
      const solicitacao = await prisma.solicitacoes_servico.create({
        data: {
          ...createDto,
          numero,
          status: createDto.status || StatusSolicitacaoServico.RASCUNHO,
          solicitante_id: createDto.solicitante_id || usuarioId,
        } as Prisma.solicitacoes_servicoUncheckedCreateInput,
        include: {
          planta: true,
          equipamento: true,
        },
      });

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        solicitacao.id,
        'CRIACAO',
        createDto.solicitante_nome,
        usuarioId,
        'Solicitação criada',
        null,
        solicitacao.status,
      );

      this.logger.log(`Solicitação ${numero} criada com sucesso`);
      return this.mapToResponseDto(solicitacao);
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

    // Buscar dados
    const solicitacoes = await this.prisma.solicitacoes_servico.findMany({
      where,
      include: {
        planta: {
          select: {
            id: true,
            nome: true,
            cidade: true,
            uf: true,
          },
        },
        equipamento: {
          select: {
            id: true,
            nome: true,
            tag: true,
            tipo_equipamento: true,
          },
        },
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

    return {
      data: solicitacoes.map(s => this.mapToResponseDto(s)),
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
        planta: true,
        equipamento: true,
        anexos: true,
        historico: {
          orderBy: { data: 'desc' },
        },
        comentarios: {
          orderBy: { created_at: 'desc' },
        },
        },
    });

    if (!solicitacao || solicitacao.deleted_at) {
      throw new NotFoundException('Solicitação não encontrada');
    }

    return this.mapToResponseDto(solicitacao);
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
    if (!['RASCUNHO', 'AGUARDANDO'].includes(solicitacao.status)) {
      throw new ConflictException(
        'Apenas solicitações em rascunho ou aguardando podem ser editadas',
      );
    }

    return await this.prisma.$transaction(async (prisma) => {
      const solicitacaoAtualizada = await prisma.solicitacoes_servico.update({
        where: { id },
        data: updateDto as Prisma.solicitacoes_servicoUncheckedUpdateInput,
        include: {
          planta: true,
          equipamento: true,
        },
      });

      // Registrar histórico
      await this.registrarHistorico(
        prisma,
        id,
        'ATUALIZACAO',
        'Sistema',
        usuarioId,
        'Solicitação atualizada',
      );

      return this.mapToResponseDto(solicitacaoAtualizada);
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
          status: StatusSolicitacaoServico.AGUARDANDO,
        },
        include: {
          planta: true,
          equipamento: true,
        },
      });

      await this.registrarHistorico(
        prisma,
        id,
        'ENVIO_ANALISE',
        'Sistema',
        usuarioId,
        'Solicitação enviada para análise',
        StatusSolicitacaoServico.RASCUNHO,
        StatusSolicitacaoServico.AGUARDANDO,
      );

      this.logger.log(`Solicitação ${solicitacao.numero} enviada para análise`);
      return this.mapToResponseDto(solicitacaoAtualizada);
    });
  }

  /**
   * Iniciar análise da solicitação
   */
  async analisar(
    id: string,
    dto: AnalisarSolicitacaoDto,
    analisadorNome: string,
    analisadorId?: string,
  ): Promise<SolicitacaoResponseDto> {
    const solicitacao = await this.findOne(id);

    if (solicitacao.status !== StatusSolicitacaoServico.AGUARDANDO) {
      throw new ConflictException('Apenas solicitações aguardando podem ser analisadas');
    }

    return await this.prisma.$transaction(async (prisma) => {
      const solicitacaoAtualizada = await prisma.solicitacoes_servico.update({
        where: { id },
        data: {
          status: StatusSolicitacaoServico.EM_ANALISE,
          analisado_por_nome: analisadorNome,
          analisado_por_id: analisadorId,
          data_analise: new Date(),
          ...dto,
        },
        include: {
          planta: true,
          equipamento: true,
        },
      });

      await this.registrarHistorico(
        prisma,
        id,
        'INICIO_ANALISE',
        analisadorNome,
        analisadorId,
        dto.observacoes_analise,
        StatusSolicitacaoServico.AGUARDANDO,
        StatusSolicitacaoServico.EM_ANALISE,
      );

      this.logger.log(`Análise iniciada para solicitação ${solicitacao.numero}`);
      return this.mapToResponseDto(solicitacaoAtualizada);
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
          planta: true,
          equipamento: true,
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

      this.logger.log(`Solicitação ${solicitacao.numero} aprovada`);
      return this.mapToResponseDto(solicitacaoAtualizada);
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
          planta: true,
          equipamento: true,
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

      this.logger.log(`Solicitação ${solicitacao.numero} rejeitada`);
      return this.mapToResponseDto(solicitacaoAtualizada);
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
          planta: true,
          equipamento: true,
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

      this.logger.log(`Solicitação ${solicitacao.numero} cancelada`);
      return this.mapToResponseDto(solicitacaoAtualizada);
    });
  }

  /**
   * Remover solicitação (soft delete)
   */
  async remove(id: string, usuarioId?: string): Promise<void> {
    const solicitacao = await this.findOne(id);

    if (solicitacao.status !== StatusSolicitacaoServico.RASCUNHO) {
      throw new ConflictException('Apenas rascunhos podem ser excluídos');
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
      aguardando,
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
        where: { status: StatusSolicitacaoServico.AGUARDANDO, deleted_at: null },
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
      aguardando,
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
}