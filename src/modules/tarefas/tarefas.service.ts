// src/modules/tarefas/tarefas.service.ts
import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService, PermissionScopeService, ScopedUser } from '@/core';
import {
  CreateTarefaDto,
  UpdateTarefaDto,
  QueryTarefasDto,
  ReordenarTarefaDto,
  TarefaResponseDto,
} from './dto';
import { StatusTarefa, Prisma } from '@/core';
import { PropagacaoPlanosService } from '../planos-manutencao/propagacao-planos.service';

@Injectable()
export class TarefasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: PermissionScopeService,
    private readonly propagacaoService: PropagacaoPlanosService,
  ) {}

  /**
   * Enfileira a propagacao quando a tarefa mexida pertence a um TEMPLATE.
   *
   * O gatilho anterior ficava so no save do plano, mas adicionar, editar ou
   * remover tarefa nao toca no registro do plano — entao a alteracao mais
   * comum de todas nao chegava nas copias.
   */
  private async propagarSePertenceATemplate(planoId?: string | null): Promise<void> {
    if (!planoId) return;

    const plano = await this.prisma.planos_manutencao.findFirst({
      where: { id: planoId.trim(), deleted_at: null },
      select: { id: true, plano_origem_id: true },
    });

    if (!plano || plano.plano_origem_id) return;

    await this.propagacaoService.enfileirar(plano.id);
  }

  /** Retorna fragmento `where` para tarefas restringindo ao escopo de plantas. */
  private async scopeFragment(user?: ScopedUser): Promise<Prisma.tarefasWhereInput | undefined> {
    const scope = await this.scopeService.getScope(user);
    if (!this.scopeService.isScoped(scope)) return undefined;
    if (scope.length === 0) return { id: '__NEVER__' };
    return {
      OR: [
        { planta_id: { in: scope } },
        { equipamento: { unidade: { planta_id: { in: scope } } } },
      ],
    };
  }

  async criar(createDto: CreateTarefaDto): Promise<TarefaResponseDto> {
    let plano = null;
    let equipamento_id = null;
    let planta_id = null;

    // O conteudo da tarefa vem da instrucao; a tarefa guarda so o vinculo,
    // a periodicidade e a criticidade daquele plano.
    const instrucao = await this.verificarInstrucaoExiste(createDto.instrucao_id);

    // Se tem plano, verificar se existe e está ativo
    if (createDto.plano_manutencao_id) {
      plano = await this.verificarPlanoExiste(createDto.plano_manutencao_id);
      equipamento_id = plano.equipamento_id;
      planta_id = plano.equipamento?.unidade?.planta_id ?? null;

      if (createDto.ordem === undefined || createDto.ordem === null) {
        createDto.ordem = await this.proximaOrdem(createDto.plano_manutencao_id);
      } else {
        await this.verificarOrdemDisponivel(createDto.plano_manutencao_id, createDto.ordem);
      }
    } else {
      // Tarefa independente - ordem não é obrigatória
      createDto.ordem = null;
    }

    // Se não foi fornecida TAG, gerar automaticamente
    if (!createDto.tag) {
      createDto.tag = await this.gerarTagUnica(createDto.plano_manutencao_id);
    } else {
      // Verificar se TAG já existe
      await this.verificarTagUnica(createDto.tag);
    }

    // Validar frequência personalizada apenas se frequência foi fornecida
    if (createDto.frequencia) {
      this.validarFrequenciaPersonalizada(createDto.frequencia, createDto.frequencia_personalizada);
    }

    // Transação para criar tarefa com sub-estruturas
    const tarefa = await this.prisma.$transaction(async (tx) => {
      // Criar tarefa principal
      const novaTarefa = await tx.tarefas.create({
        data: {
          plano_manutencao_id: createDto.plano_manutencao_id || null,
          equipamento_id: equipamento_id,
          planta_id: planta_id,
          tag: createDto.tag,
          nome: createDto.nome,
          instrucao_id: instrucao.id,
          frequencia: createDto.frequencia,
          frequencia_personalizada: createDto.frequencia_personalizada,
          criticidade: createDto.criticidade,
          ordem: createDto.ordem,
          // Tarefa nasce sempre PROPRIA: no template ela e original, e na copia
          // foi criada direto naquele equipamento. Propagacao nunca mexe nela.
          origem_status: 'PROPRIA',
          // A ancora so faz sentido na copia, que e quem gera OS
          data_ancora: equipamento_id ? new Date() : null,
          ativo: true,
          criado_por: createDto.criado_por
        }
      });

      return novaTarefa;
    });

    await this.propagarSePertenceATemplate(createDto.plano_manutencao_id);

    // Retornar tarefa completa com relacionamentos
    return this.buscarPorId(tarefa.id);
  }

  async listar(queryDto: QueryTarefasDto, user?: ScopedUser): Promise<{
    data: TarefaResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page, limit, search, sort_by, sort_order, status_atrasada, ...filters } = queryDto;
    const skip = (page - 1) * limit;

    // Log para debug
    console.log('🔍 [TAREFAS] Filtro status_atrasada recebido:', status_atrasada, 'tipo:', typeof status_atrasada);

    // Construir filtros
    const scopeFragment = await this.scopeFragment(user);
    const where: Prisma.tarefasWhereInput = {
      deleted_at: null,
      ...this.construirFiltros(filters, search),
      ...(scopeFragment && { AND: [scopeFragment] }),
    };

    // Construir ordenação
    const orderBy = this.construirOrdenacao(sort_by, sort_order);

    // Se filtrar por tarefas atrasadas, precisamos buscar todas e filtrar depois
    if (status_atrasada === true) {
      const todasTarefas = await this.prisma.tarefas.findMany({
        where,
        include: this.includeRelacionamentosLista(),
        orderBy
      });

      // Filtrar tarefas atrasadas
      const dataAtual = new Date();
      const tarefasAtrasadas = todasTarefas.filter(tarefa => {
        if (!tarefa.data_ultima_execucao) {
          return false; // Se nunca foi executada, não está atrasada
        }

        const proximaExecucao = this.calcularProximaExecucao(
          tarefa.data_ultima_execucao,
          tarefa.frequencia,
          tarefa.frequencia_personalizada
        );

        return proximaExecucao < dataAtual;
      });

      // Aplicar paginação manual
      const tarefasPaginadas = tarefasAtrasadas.slice(skip, skip + limit);

      return {
        data: tarefasPaginadas.map(tarefa => this.mapearParaResponse(tarefa)),
        total: tarefasAtrasadas.length,
        page,
        limit,
        totalPages: Math.ceil(tarefasAtrasadas.length / limit)
      };
    }

    // Fluxo normal sem filtro de atrasadas
    const [tarefas, total] = await Promise.all([
      this.prisma.tarefas.findMany({
        where,
        include: this.includeRelacionamentosLista(),
        orderBy,
        skip,
        take: limit
      }),
      this.prisma.tarefas.count({ where })
    ]);

    return {
      data: tarefas.map(tarefa => this.mapearParaResponse(tarefa)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async buscarPorId(id: string, user?: ScopedUser): Promise<TarefaResponseDto> {
    if (user) await this.scopeService.assertEntityInScope('tarefa', id, user);
    const inicio = Date.now();

    const tarefa = await this.prisma.tarefas.findFirst({
      where: {
        id,
        deleted_at: null
      },
      include: {
        plano_manutencao: {
          select: {
            id: true,
            nome: true,
            versao: true
          }
        },
        planta: {
          select: {
            id: true,
            nome: true,
            localizacao: true
          }
        },
        equipamento: {
          select: {
            id: true,
            nome: true,
            tipo_equipamento: true,
            classificacao: true
          }
        },
        instrucao: {
          select: {
            id: true,
            tag: true,
            nome: true,
            categoria: true,
            tipo_manutencao: true,
            descricao: true,
            // As telas de OS leem as etapas daqui: a tarefa nao guarda mais
            // sub-etapas proprias.
            sub_instrucoes: {
              orderBy: { ordem: 'asc' as const },
              select: { id: true, descricao: true, obrigatoria: true, ordem: true, tempo_estimado: true }
            }
          }
        }
      }
    });

    const tempoQuery = Date.now() - inicio;
    console.log(`⏱️ [BACKEND] buscarPorId levou ${tempoQuery}ms`);

    if (!tarefa) {
      throw new NotFoundException('Tarefa não encontrada');
    }

    return this.mapearParaResponse({
      ...tarefa,
      usuario_criador: null,
      usuario_atualizador: null
    });
  }

  async listarPorPlano(planoId: string, queryDto?: Partial<QueryTarefasDto>, user?: ScopedUser): Promise<TarefaResponseDto[]> {
    // Verificar se plano existe
    await this.verificarPlanoExiste(planoId);

    const scopeFragment = await this.scopeFragment(user);
    const where: Prisma.tarefasWhereInput = {
      plano_manutencao_id: planoId,
      deleted_at: null,
      ...(scopeFragment && { AND: [scopeFragment] }),
      ...(queryDto && this.construirFiltros(queryDto))
    };

    const tarefas = await this.prisma.tarefas.findMany({
      where,
      include: this.includeRelacionamentosLista(),
      orderBy: { ordem: 'asc' }
    });

    return tarefas.map(tarefa => this.mapearParaResponse(tarefa));
  }

  async listarPorEquipamento(equipamentoId: string, queryDto?: Partial<QueryTarefasDto>, user?: ScopedUser): Promise<TarefaResponseDto[]> {
    if (user) await this.scopeService.assertEntityInScope('equipamento', equipamentoId, user);
    const scopeFragment = await this.scopeFragment(user);
    const where: Prisma.tarefasWhereInput = {
      equipamento_id: equipamentoId,
      deleted_at: null,
      ...(queryDto && this.construirFiltros(queryDto)),
      ...(scopeFragment && { AND: [scopeFragment] }),
    };

    const tarefas = await this.prisma.tarefas.findMany({
      where,
      include: this.includeRelacionamentosLista(),
      orderBy: [{ ordem: 'asc' }, { created_at: 'desc' }]
    });

    return tarefas.map(tarefa => this.mapearParaResponse(tarefa));
  }

  async atualizar(id: string, updateDto: UpdateTarefaDto, user?: ScopedUser): Promise<TarefaResponseDto> {
    if (user) await this.scopeService.assertEntityInScope('tarefa', id, user);
    const tarefaExistente = await this.verificarTarefaExiste(id);

    // Se mudou TAG, verificar unicidade
    if (updateDto.tag && updateDto.tag !== tarefaExistente.tag) {
      await this.verificarTagUnica(updateDto.tag, id);
    }

    const dadosAtualizacao: any = { ...updateDto };

    if (updateDto.instrucao_id && updateDto.instrucao_id !== tarefaExistente.instrucao_id) {
      await this.verificarInstrucaoExiste(updateDto.instrucao_id);
    }

    // Se mudou plano, verificar se existe e ajustar dados
    if (updateDto.plano_manutencao_id && updateDto.plano_manutencao_id !== tarefaExistente.plano_manutencao_id) {
      const novoPlano = await this.verificarPlanoExiste(updateDto.plano_manutencao_id);
      dadosAtualizacao.equipamento_id = novoPlano.equipamento_id;
    }

    // Editar uma tarefa HERDADA marca a divergencia: a partir daqui ela deixa
    // de acompanhar o template. Sem isso, a proxima propagacao sobrescreveria
    // silenciosamente o ajuste que o usuario acabou de fazer.
    if (tarefaExistente.origem_status === 'HERDADA' && this.alteraDefinicao(updateDto, tarefaExistente)) {
      dadosAtualizacao.origem_status = 'CUSTOMIZADA';
    }

    // Validar frequência personalizada se alterada e se frequência existe
    if ((updateDto.frequencia || tarefaExistente.frequencia) && updateDto.frequencia_personalizada !== undefined) {
      const frequencia = updateDto.frequencia || tarefaExistente.frequencia;
      if (frequencia) {
        this.validarFrequenciaPersonalizada(frequencia, updateDto.frequencia_personalizada);
      }
    }

    // Se mudou ordem, verificar disponibilidade
    if (updateDto.ordem && updateDto.ordem !== tarefaExistente.ordem) {
      const planoId = updateDto.plano_manutencao_id || tarefaExistente.plano_manutencao_id;
      await this.verificarOrdemDisponivel(planoId, updateDto.ordem, id);
    }

    const tarefa = await this.prisma.tarefas.update({
      where: { id },
      data: {
        ...dadosAtualizacao,
        updated_at: new Date()
      }
    });

    await this.propagarSePertenceATemplate(
      updateDto.plano_manutencao_id || tarefaExistente.plano_manutencao_id,
    );

    // Retornar tarefa completa com relacionamentos
    return this.buscarPorId(tarefa.id);
  }

  /** Os quatro campos de definicao. Mudanca de ordem ou tag nao customiza. */
  private alteraDefinicao(updateDto: UpdateTarefaDto, atual: any): boolean {
    const campos: Array<keyof UpdateTarefaDto> = [
      'nome',
      'instrucao_id',
      'frequencia',
      'frequencia_personalizada',
      'criticidade',
    ];

    return campos.some(
      (campo) => updateDto[campo] !== undefined && updateDto[campo] !== atual[campo],
    );
  }

  async reordenar(id: string, reordenarDto: ReordenarTarefaDto, user?: ScopedUser): Promise<TarefaResponseDto> {
    if (user) await this.scopeService.assertEntityInScope('tarefa', id, user);
    const tarefa = await this.verificarTarefaExiste(id);

    // Verificar se nova ordem está disponível
    await this.verificarOrdemDisponivel(tarefa.plano_manutencao_id, reordenarDto.nova_ordem, id);

    const tarefaAtualizada = await this.prisma.tarefas.update({
      where: { id },
      data: {
        ordem: reordenarDto.nova_ordem,
        updated_at: new Date()
      }
    });

    return this.buscarPorId(tarefaAtualizada.id);
  }

  async remover(id: string, user?: ScopedUser): Promise<void> {
    if (user) await this.scopeService.assertEntityInScope('tarefa', id, user);
    const tarefa = await this.verificarTarefaExiste(id);

    // Tarefa HERDADA removida na copia vira REMOVIDA, nao some.
    //
    // Se apagasse de vez, a proxima edicao do template a traria de volta — o
    // usuario removeria, o template propagaria, e assim para sempre. O estado
    // REMOVIDA e o que diz a propagacao "aqui nao".
    const virarRemovida = tarefa.origem_status === 'HERDADA';

    await this.prisma.tarefas.update({
      where: { id },
      data: {
        deleted_at: new Date(),
        ...(virarRemovida && { origem_status: 'REMOVIDA' })
      }
    });

    await this.propagarSePertenceATemplate(tarefa.plano_manutencao_id);
  }

  private async verificarInstrucaoExiste(instrucaoId: string) {
    const instrucao = await this.prisma.instrucoes.findFirst({
      where: { id: instrucaoId.trim(), deleted_at: null }
    });

    if (!instrucao) {
      throw new NotFoundException('Instrução não encontrada');
    }

    return instrucao;
  }

  /**
   * Colunas que a tarefa ainda carrega no banco mas que sao conteudo da
   * instrucao. Preenchidas na criacao porque sao NOT NULL; o drop delas e a
   * ultima etapa da migracao, quando ninguem mais as ler.
   */
  private async proximaOrdem(planoId: string): Promise<number> {
    const ultima = await this.prisma.tarefas.findFirst({
      where: { plano_manutencao_id: planoId, deleted_at: null },
      orderBy: { ordem: 'desc' },
      select: { ordem: true }
    });

    return (ultima?.ordem ?? 0) + 1;
  }

  private async verificarPlanoExiste(planoId: string) {
    const plano = await this.prisma.planos_manutencao.findFirst({
      where: {
        id: planoId,
        deleted_at: null
      },
      include: {
        equipamento: {
          select: {
            id: true,
            unidade: {
              select: {
                planta_id: true
              }
            }
          }
        }
      }
    });

    if (!plano) {
      throw new NotFoundException('Plano de manutenção não encontrado');
    }

    return plano;
  }

  private async verificarTarefaExiste(id: string) {
    const tarefa = await this.prisma.tarefas.findFirst({
      where: {
        id,
        deleted_at: null
      }
    });

    if (!tarefa) {
      throw new NotFoundException('Tarefa não encontrada');
    }

    return tarefa;
  }

  private async verificarTagUnica(tag: string, excludeId?: string) {
    const where: Prisma.tarefasWhereInput = {
      tag,
      deleted_at: null
    };

    if (excludeId) {
      where.id = { not: excludeId };
    }

    const tarefaExistente = await this.prisma.tarefas.findFirst({
      where
    });

    if (tarefaExistente) {
      throw new ConflictException(`A TAG "${tag}" já está sendo utilizada por outra tarefa`);
    }
  }

  private async verificarOrdemDisponivel(planoId: string, ordem: number, excludeId?: string) {
    const where: Prisma.tarefasWhereInput = {
      plano_manutencao_id: planoId,
      ordem,
      deleted_at: null
    };

    if (excludeId) {
      where.id = { not: excludeId };
    }

    const tarefaExistente = await this.prisma.tarefas.findFirst({
      where
    });

    if (tarefaExistente) {
      throw new ConflictException(`A ordem ${ordem} já está sendo utilizada por outra tarefa neste plano`);
    }
  }

  private validarFrequenciaPersonalizada(frequencia: any, frequenciaPersonalizada?: number) {
    if (frequencia === 'PERSONALIZADA') {
      if (!frequenciaPersonalizada || frequenciaPersonalizada < 1) {
        throw new BadRequestException('Frequência personalizada deve ser informada e maior que zero quando a frequência é PERSONALIZADA');
      }
    } else if (frequenciaPersonalizada) {
      throw new BadRequestException('Frequência personalizada só pode ser informada quando a frequência é PERSONALIZADA');
    }
  }

  private async gerarTagUnica(planoId: string): Promise<string> {
    // Buscar o próximo número sequencial para o plano
    const ultimaTarefa = await this.prisma.tarefas.findFirst({
      where: { plano_manutencao_id: planoId },
      orderBy: { created_at: 'desc' },
      select: { tag: true }
    });

    let proximoNumero = 1;

    if (ultimaTarefa?.tag) {
      // Extrair número da tag (ex: TRF-001 -> 001)
      const match = ultimaTarefa.tag.match(/TRF-(\d+)/);
      if (match) {
        proximoNumero = parseInt(match[1]) + 1;
      }
    }

    // Formatar com zeros à esquerda (ex: TRF-001)
    const tag = `TRF-${proximoNumero.toString().padStart(3, '0')}`;

    // Verificar se a tag já existe (precaução extra)
    const tagExiste = await this.prisma.tarefas.findFirst({
      where: { tag }
    });

    if (tagExiste) {
      // Se existir, usar timestamp como fallback
      return `TRF-${Date.now()}`;
    }

    return tag;
  }

  private includeRelacionamentosLista(): Prisma.tarefasInclude {
    return {
      plano_manutencao: {
        select: {
          id: true,
          nome: true,
          versao: true
        }
      },
      planta: {
        select: {
          id: true,
          nome: true,
          localizacao: true
        }
      },
      equipamento: {
        select: {
          id: true,
          nome: true,
          tipo_equipamento: true,
          classificacao: true
        }
      },
      instrucao: {
        select: {
          id: true,
          tag: true,
          nome: true,
          categoria: true,
          tipo_manutencao: true,
          descricao: true,
          // As telas de OS leem as etapas daqui: a tarefa nao guarda mais
          // sub-etapas proprias.
          sub_instrucoes: {
            orderBy: { ordem: 'asc' as const },
            select: { id: true, descricao: true, obrigatoria: true, ordem: true, tempo_estimado: true }
          }
        }
      }
    };
  }

  private includeRelacionamentosCompletos(): Prisma.tarefasInclude {
    return {
      plano_manutencao: {
        select: {
          id: true,
          nome: true,
          versao: true
        }
      },
      planta: {
        select: {
          id: true,
          nome: true,
          localizacao: true
        }
      },
      equipamento: {
        select: {
          id: true,
          nome: true,
          tipo_equipamento: true,
          classificacao: true
        }
      },
      instrucao: {
        select: {
          id: true,
          tag: true,
          nome: true,
          categoria: true,
          tipo_manutencao: true,
          descricao: true,
          // As telas de OS leem as etapas daqui: a tarefa nao guarda mais
          // sub-etapas proprias.
          sub_instrucoes: {
            orderBy: { ordem: 'asc' as const },
            select: { id: true, descricao: true, obrigatoria: true, ordem: true, tempo_estimado: true }
          }
        }
      },
      usuario_criador: {
        select: {
          id: true,
          nome: true,
          email: true
        }
      },
      usuario_atualizador: {
        select: {
          id: true,
          nome: true,
          email: true
        }
      }
    };
  }

  private construirFiltros(filters: Partial<QueryTarefasDto>, search?: string): Prisma.tarefasWhereInput {
    const where: Prisma.tarefasWhereInput = {};

    if (filters.plano_id) {
      where.plano_manutencao_id = filters.plano_id;
    }

    if (filters.equipamento_id) {
      where.equipamento_id = filters.equipamento_id;
    }

    if (filters.planta_id) {
      where.planta_id = filters.planta_id;
    }

    if (filters.unidade_id) {
      // Filtrar por unidade através do equipamento
      where.equipamento = {
        unidade_id: filters.unidade_id
      };
    }

    if (filters.instrucao_id) {
      where.instrucao_id = filters.instrucao_id;
    }

    if (filters.ativo !== undefined) {
      where.ativo = filters.ativo;
    }


    if (filters.frequencia) {
      where.frequencia = filters.frequencia;
    }

    if (filters.criticidade) {
      where.criticidade = filters.criticidade;
    }

    if (search) {
      where.OR = [
        { tag: { contains: search, mode: 'insensitive' } },
        { nome: { contains: search, mode: 'insensitive' } }
      ];
    }

    return where;
  }

  private construirOrdenacao(sortBy?: string, sortOrder?: 'asc' | 'desc') {
    const orderBy: Prisma.tarefasOrderByWithRelationInput = {};

    switch (sortBy) {
      case 'tag':
        orderBy.tag = sortOrder;
        break;
      case 'nome':
        orderBy.nome = sortOrder;
        break;
      case 'criticidade':
        orderBy.criticidade = sortOrder;
        break;
      case 'ordem':
        orderBy.ordem = sortOrder;
        break;
      case 'updated_at':
        orderBy.updated_at = sortOrder;
        break;
      default:
        orderBy.created_at = sortOrder || 'desc';
    }

    return orderBy;
  }

  private mapearParaResponse(tarefa: any): TarefaResponseDto {
    return {
      id: tarefa.id?.trim() || tarefa.id, // ✅ TRIM para remover espaços extras
      plano_manutencao_id: tarefa.plano_manutencao_id?.trim() || tarefa.plano_manutencao_id, // ✅ TRIM
      tag: tarefa.tag,
      nome: tarefa.nome,
      descricao: tarefa.descricao,
      categoria: tarefa.categoria,
      tipo_manutencao: tarefa.tipo_manutencao,
      frequencia: tarefa.frequencia,
      frequencia_personalizada: tarefa.frequencia_personalizada,
      condicao_ativo: tarefa.condicao_ativo,
      criticidade: tarefa.criticidade,
      duracao_estimada: Number(tarefa.duracao_estimada),
      tempo_estimado: tarefa.tempo_estimado,
      ordem: tarefa.ordem,
      planta_id: tarefa.planta_id?.trim() || tarefa.planta_id, // ✅ TRIM
      equipamento_id: tarefa.equipamento_id?.trim() || tarefa.equipamento_id, // ✅ TRIM
      instrucao_id: tarefa.instrucao_id?.trim() || tarefa.instrucao_id,
      planejador: tarefa.planejador,
      responsavel: tarefa.responsavel,
      observacoes: tarefa.observacoes,
      status: tarefa.status,
      ativo: tarefa.ativo,
      data_ultima_execucao: tarefa.data_ultima_execucao,
      numero_execucoes: tarefa.numero_execucoes,
      created_at: tarefa.created_at,
      updated_at: tarefa.updated_at,
      criado_por: tarefa.criado_por,
      atualizado_por: tarefa.atualizado_por,
      plano_manutencao: tarefa.plano_manutencao,
      planta: tarefa.planta,
      equipamento: tarefa.equipamento,
      instrucao: tarefa.instrucao,
      usuario_criador: tarefa.usuario_criador,
      usuario_atualizador: tarefa.usuario_atualizador
    };
  }

  // Métodos auxiliares para dashboard
  private contarPorStatus(stats: any[], status: StatusTarefa): number {
    return stats.find(s => s.status === status)?._count || 0;
  }

  private contarPorCriticidade(stats: any[], criticidade: number): number {
    return stats.find(s => s.criticidade === criticidade)?._count || 0;
  }

  private contarPorTipo(stats: any[], tipo: string): number {
    return stats.find(s => s.tipo_manutencao === tipo)?._count || 0;
  }

  private contarPorCategoria(stats: any[], categoria: string): number {
    return stats.find(s => s.categoria === categoria)?._count || 0;
  }

  private calcularProximaExecucao(
    dataUltimaExecucao: Date,
    frequencia: any,
    frequenciaPersonalizada?: number
  ): Date {
    const proximaExecucao = new Date(dataUltimaExecucao);

    switch (frequencia) {
      case 'DIARIA':
        proximaExecucao.setDate(proximaExecucao.getDate() + 1);
        break;
      case 'SEMANAL':
        proximaExecucao.setDate(proximaExecucao.getDate() + 7);
        break;
      case 'QUINZENAL':
        proximaExecucao.setDate(proximaExecucao.getDate() + 15);
        break;
      case 'MENSAL':
        proximaExecucao.setMonth(proximaExecucao.getMonth() + 1);
        break;
      case 'BIMESTRAL':
        proximaExecucao.setMonth(proximaExecucao.getMonth() + 2);
        break;
      case 'TRIMESTRAL':
        proximaExecucao.setMonth(proximaExecucao.getMonth() + 3);
        break;
      case 'SEMESTRAL':
        proximaExecucao.setMonth(proximaExecucao.getMonth() + 6);
        break;
      case 'ANUAL':
        proximaExecucao.setFullYear(proximaExecucao.getFullYear() + 1);
        break;
      case 'PERSONALIZADA':
        if (frequenciaPersonalizada && frequenciaPersonalizada > 0) {
          proximaExecucao.setDate(proximaExecucao.getDate() + frequenciaPersonalizada);
        }
        break;
      default:
        // Se frequência não for reconhecida, considerar como 30 dias
        proximaExecucao.setDate(proximaExecucao.getDate() + 30);
    }

    return proximaExecucao;
  }
}