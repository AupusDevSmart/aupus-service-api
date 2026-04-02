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

      // Extrair campos que não são colunas da tabela antes de criar
      const { instrucoes_ids, tarefas_ids, ...createData } = createDto as any;

      // Criar solicitação com solicitante_id e solicitante_nome preenchidos
      // Removido o include da planta para evitar erro com soft delete
      const solicitacao = await prisma.solicitacoes_servico.create({
        data: {
          ...createData,
          planta_id, // Usar o planta_id determinado
          numero,
          status: StatusSolicitacaoServico.REGISTRADA,
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
      if (tarefas_ids && tarefas_ids.length > 0) {
        await this.associarTarefas(prisma, solicitacao.id, tarefas_ids);
      }

      // Associar instruções se fornecidas
      if (instrucoes_ids && instrucoes_ids.length > 0) {
        await this.associarInstrucoes(prisma, solicitacao.id, instrucoes_ids);
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
        },
        solicitacoes_instrucoes: {
          include: {
            instrucao: {
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

    // Mapear instruções associadas
    const instrucoes = (solicitacao as any).solicitacoes_instrucoes?.map((si: any) => ({
      ...si.instrucao,
      ordem: si.ordem,
      observacoes: si.observacoes
    })) || [];

    const solicitacaoCompleta = {
      ...solicitacao,
      planta: planta,
      unidade: unidade,
      tarefas: tarefas,
      instrucoes: instrucoes
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
    if (solicitacao.status !== 'REGISTRADA') {
      throw new ConflictException(
        'Apenas solicitações registradas podem ser editadas',
      );
    }

    // Extrair instrucoes_ids antes de passar para o Prisma (não é coluna da tabela)
    const { instrucoes_ids, ...prismaData } = updateDto as any;

    return await this.prisma.$transaction(async (prisma) => {
      const solicitacaoAtualizada = await prisma.solicitacoes_servico.update({
        where: { id },
        data: prismaData as Prisma.solicitacoes_servicoUncheckedUpdateInput,
        include: {
          // Removido planta do include para evitar erro com soft delete
          equipamento: true,
          unidade: true, // Incluir unidade
          proprietario: true, // Incluir proprietário
        },
      });

      // Atualizar instruções vinculadas se fornecidas
      if (instrucoes_ids !== undefined) {
        // Remover associações existentes
        await prisma.solicitacoes_instrucoes.deleteMany({
          where: { solicitacao_id: id },
        });
        // Criar novas associações
        if (instrucoes_ids && instrucoes_ids.length > 0) {
          await this.associarInstrucoes(prisma, id, instrucoes_ids);
        }
      }

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
   * Remover solicitação (soft delete)
   */
  async remove(id: string, usuarioId?: string): Promise<void> {
    const solicitacao = await this.findOne(id);

    if (solicitacao.status !== StatusSolicitacaoServico.REGISTRADA) {
      throw new ConflictException('Apenas solicitações registradas podem ser excluídas');
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
      registradas,
      programadas,
      finalizadas,
      porPrioridade,
      porTipo,
    ] = await Promise.all([
      this.prisma.solicitacoes_servico.count({
        where: { deleted_at: null },
      }),
      this.prisma.solicitacoes_servico.count({
        where: { status: StatusSolicitacaoServico.REGISTRADA, deleted_at: null },
      }),
      this.prisma.solicitacoes_servico.count({
        where: { status: StatusSolicitacaoServico.PROGRAMADA, deleted_at: null },
      }),
      this.prisma.solicitacoes_servico.count({
        where: { status: StatusSolicitacaoServico.FINALIZADA, deleted_at: null },
      }),
      this.prisma.solicitacoes_servico.groupBy({
        by: ['prioridade'],
        where: { deleted_at: null },
        _count: true,
      }),
      this.prisma.solicitacoes_servico.groupBy({
        by: ['tipo'],
        where: { deleted_at: null },
        _count: true,
      }),
    ]);

    const prioridadeMap = { baixa: 0, media: 0, alta: 0, urgente: 0 };
    porPrioridade.forEach((item) => {
      prioridadeMap[item.prioridade.toLowerCase()] = item._count;
    });

    const tipoMap: Record<string, number> = {};
    porTipo.forEach((item) => {
      tipoMap[item.tipo] = item._count;
    });

    return {
      total,
      registradas,
      programadas,
      finalizadas,
      porPrioridade: prioridadeMap,
      porTipo: tipoMap,
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
   * Marcar solicitação como programada
   */
  async marcarComoProgramada(
    id: string,
    programacao_os_id: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (prisma) => {
      await prisma.solicitacoes_servico.update({
        where: { id },
        data: {
          status: StatusSolicitacaoServico.PROGRAMADA,
          programacao_os_id,
        },
      });

      await this.registrarHistorico(
        prisma,
        id,
        'PROGRAMACAO',
        'Sistema',
        null,
        `Programação OS gerada: ${programacao_os_id}`,
        StatusSolicitacaoServico.REGISTRADA,
        StatusSolicitacaoServico.PROGRAMADA,
      );
    });
  }

  /**
   * Marcar solicitação como finalizada
   */
  async marcarComoFinalizada(
    id: string,
    ordem_servico_id?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (prisma) => {
      const updateData: any = {
        status: StatusSolicitacaoServico.FINALIZADA,
      };
      if (ordem_servico_id) {
        updateData.ordem_servico_id = ordem_servico_id;
      }

      await prisma.solicitacoes_servico.update({
        where: { id },
        data: updateData,
      });

      await this.registrarHistorico(
        prisma,
        id,
        'FINALIZACAO',
        'Sistema',
        null,
        ordem_servico_id ? `OS finalizada: ${ordem_servico_id}` : 'Solicitação finalizada',
        StatusSolicitacaoServico.PROGRAMADA,
        StatusSolicitacaoServico.FINALIZADA,
      );
    });
  }

  /**
   * Voltar solicitação para registrada (quando programação OS é rejeitada)
   */
  async voltarParaRegistrada(
    id: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (prisma) => {
      await prisma.solicitacoes_servico.update({
        where: { id },
        data: {
          status: StatusSolicitacaoServico.REGISTRADA,
          programacao_os_id: null,
        },
      });

      await this.registrarHistorico(
        prisma,
        id,
        'RETORNO_REGISTRADA',
        'Sistema',
        null,
        'Programação OS rejeitada - solicitação retornou para registrada',
        StatusSolicitacaoServico.PROGRAMADA,
        StatusSolicitacaoServico.REGISTRADA,
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

  private async associarInstrucoes(
    prisma: any,
    solicitacaoId: string,
    instrucoesIds: string[]
  ) {
    // Verificar se todas as instruções existem
    const instrucoes = await prisma.instrucoes.findMany({
      where: {
        id: { in: instrucoesIds },
        deleted_at: null
      }
    });

    if (instrucoes.length !== instrucoesIds.length) {
      throw new BadRequestException('Algumas instruções não foram encontradas');
    }

    const associacoes = instrucoesIds.map((instrucaoId, index) => ({
      id: this.generateId(),
      instrucao_id: instrucaoId,
      solicitacao_id: solicitacaoId,
      ordem: index + 1
    }));

    await prisma.solicitacoes_instrucoes.createMany({
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