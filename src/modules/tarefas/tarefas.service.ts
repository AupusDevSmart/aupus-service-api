// src/modules/tarefas/tarefas.service.ts
import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { 
  CreateTarefaDto, 
  UpdateTarefaDto, 
  QueryTarefasDto, 
  ReordenarTarefaDto,
  UpdateStatusTarefaDto,
  TarefaResponseDto,
  DashboardTarefasDto
} from './dto';
import { StatusTarefa, Prisma } from '@prisma/client';

@Injectable()
export class TarefasService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(createDto: CreateTarefaDto): Promise<TarefaResponseDto> {
    // Verificar se plano existe e está ativo
    const plano = await this.verificarPlanoExiste(createDto.plano_manutencao_id);
    
    // Se não foi fornecida TAG, gerar automaticamente
    if (!createDto.tag) {
      createDto.tag = await this.gerarTagUnica(createDto.plano_manutencao_id);
    } else {
      // Verificar se TAG já existe
      await this.verificarTagUnica(createDto.tag);
    }

    // Validar frequência personalizada
    this.validarFrequenciaPersonalizada(createDto.frequencia, createDto.frequencia_personalizada);

    // Verificar se ordem já existe no plano
    await this.verificarOrdemDisponivel(createDto.plano_manutencao_id, createDto.ordem);

    // Transação para criar tarefa com sub-estruturas
    const tarefa = await this.prisma.$transaction(async (tx) => {
      // Criar tarefa principal
      const novaTarefa = await tx.tarefas.create({
        data: {
          plano_manutencao_id: createDto.plano_manutencao_id,
          equipamento_id: plano.equipamento_id,
          planta_id: plano.equipamento.unidade?.planta_id,
          tag: createDto.tag,
          nome: createDto.nome,
          descricao: createDto.descricao,
          categoria: createDto.categoria,
          tipo_manutencao: createDto.tipo_manutencao,
          frequencia: createDto.frequencia,
          frequencia_personalizada: createDto.frequencia_personalizada,
          condicao_ativo: createDto.condicao_ativo,
          criticidade: createDto.criticidade,
          duracao_estimada: createDto.duracao_estimada,
          tempo_estimado: createDto.tempo_estimado,
          ordem: createDto.ordem,
          planejador: createDto.planejador,
          responsavel: createDto.responsavel,
          observacoes: createDto.observacoes,
          status: createDto.status || StatusTarefa.ATIVA,
          ativo: createDto.ativo !== undefined ? createDto.ativo : true,
          data_ultima_execucao: createDto.data_ultima_execucao,
          numero_execucoes: createDto.numero_execucoes || 0,
          criado_por: createDto.criado_por
        }
      });

      // Criar sub-tarefas se fornecidas
      if (createDto.sub_tarefas && createDto.sub_tarefas.length > 0) {
        await tx.sub_tarefas.createMany({
          data: createDto.sub_tarefas.map(subTarefa => ({
            tarefa_id: novaTarefa.id,
            descricao: subTarefa.descricao,
            obrigatoria: subTarefa.obrigatoria || false,
            tempo_estimado: subTarefa.tempo_estimado,
            ordem: subTarefa.ordem
          }))
        });
      }

      // Criar recursos se fornecidos
      if (createDto.recursos && createDto.recursos.length > 0) {
        await tx.recursos_tarefa.createMany({
          data: createDto.recursos.map(recurso => ({
            tarefa_id: novaTarefa.id,
            tipo: recurso.tipo,
            descricao: recurso.descricao,
            quantidade: recurso.quantidade,
            unidade: recurso.unidade,
            obrigatorio: recurso.obrigatorio || false
          }))
        });
      }

      return novaTarefa;
    });

    // Retornar tarefa completa com relacionamentos
    return this.buscarPorId(tarefa.id);
  }

  async listar(queryDto: QueryTarefasDto): Promise<{
    data: TarefaResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page, limit, search, sort_by, sort_order, ...filters } = queryDto;
    const skip = (page - 1) * limit;

    // Construir filtros
    const where: Prisma.tarefasWhereInput = {
      deleted_at: null,
      ...this.construirFiltros(filters, search)
    };

    // Construir ordenação
    const orderBy = this.construirOrdenacao(sort_by, sort_order);

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

  async buscarPorId(id: string): Promise<TarefaResponseDto> {
    const tarefa = await this.prisma.tarefas.findFirst({
      where: {
        id,
        deleted_at: null
      },
      include: this.includeRelacionamentosCompletos()
    });

    if (!tarefa) {
      throw new NotFoundException('Tarefa não encontrada');
    }

    return this.mapearParaResponse(tarefa);
  }

  async listarPorPlano(planoId: string, queryDto?: Partial<QueryTarefasDto>): Promise<TarefaResponseDto[]> {
    // Verificar se plano existe
    await this.verificarPlanoExiste(planoId);

    const where: Prisma.tarefasWhereInput = {
      plano_manutencao_id: planoId,
      deleted_at: null,
      ...(queryDto && this.construirFiltros(queryDto))
    };

    const tarefas = await this.prisma.tarefas.findMany({
      where,
      include: this.includeRelacionamentosLista(),
      orderBy: { ordem: 'asc' }
    });

    return tarefas.map(tarefa => this.mapearParaResponse(tarefa));
  }

  async listarPorEquipamento(equipamentoId: string, queryDto?: Partial<QueryTarefasDto>): Promise<TarefaResponseDto[]> {
    const where: Prisma.tarefasWhereInput = {
      equipamento_id: equipamentoId,
      deleted_at: null,
      ...(queryDto && this.construirFiltros(queryDto))
    };

    const tarefas = await this.prisma.tarefas.findMany({
      where,
      include: this.includeRelacionamentosLista(),
      orderBy: [{ ordem: 'asc' }, { created_at: 'desc' }]
    });

    return tarefas.map(tarefa => this.mapearParaResponse(tarefa));
  }

  async atualizar(id: string, updateDto: UpdateTarefaDto): Promise<TarefaResponseDto> {
    const tarefaExistente = await this.verificarTarefaExiste(id);

    // Se mudou TAG, verificar unicidade
    if (updateDto.tag && updateDto.tag !== tarefaExistente.tag) {
      await this.verificarTagUnica(updateDto.tag, id);
    }

    // Preparar dados para atualização - remover campos que não existem no schema
    const { sub_tarefas, recursos, ...dadosAtualizacao } = updateDto;

    // Se mudou plano, verificar se existe e ajustar dados
    if (updateDto.plano_manutencao_id && updateDto.plano_manutencao_id !== tarefaExistente.plano_manutencao_id) {
      const novoPlano = await this.verificarPlanoExiste(updateDto.plano_manutencao_id);
      dadosAtualizacao.equipamento_id = novoPlano.equipamento_id;
    }

    // Validar frequência personalizada se alterada
    if (updateDto.frequencia || updateDto.frequencia_personalizada !== undefined) {
      const frequencia = updateDto.frequencia || tarefaExistente.frequencia;
      this.validarFrequenciaPersonalizada(frequencia, updateDto.frequencia_personalizada);
    }

    // Se mudou ordem, verificar disponibilidade
    if (updateDto.ordem && updateDto.ordem !== tarefaExistente.ordem) {
      const planoId = updateDto.plano_manutencao_id || tarefaExistente.plano_manutencao_id;
      await this.verificarOrdemDisponivel(planoId, updateDto.ordem, id);
    }

    // Transação para atualizar tarefa com sub-estruturas
    const tarefa = await this.prisma.$transaction(async (tx) => {
      // Atualizar tarefa principal
      const tarefaAtualizada = await tx.tarefas.update({
        where: { id },
        data: {
          ...dadosAtualizacao,
          updated_at: new Date()
        }
      });

      // Se fornecidas sub-tarefas, substituir todas
      if (updateDto.sub_tarefas) {
        // Remover sub-tarefas existentes
        await tx.sub_tarefas.deleteMany({
          where: { tarefa_id: id }
        });

        // Criar novas sub-tarefas
        if (updateDto.sub_tarefas.length > 0) {
          await tx.sub_tarefas.createMany({
            data: updateDto.sub_tarefas.map(subTarefa => ({
              tarefa_id: id,
              descricao: subTarefa.descricao,
              obrigatoria: subTarefa.obrigatoria || false,
              tempo_estimado: subTarefa.tempo_estimado,
              ordem: subTarefa.ordem
            }))
          });
        }
      }

      // Se fornecidos recursos, substituir todos
      if (updateDto.recursos) {
        // Remover recursos existentes
        await tx.recursos_tarefa.deleteMany({
          where: { tarefa_id: id }
        });

        // Criar novos recursos
        if (updateDto.recursos.length > 0) {
          await tx.recursos_tarefa.createMany({
            data: updateDto.recursos.map(recurso => ({
              tarefa_id: id,
              tipo: recurso.tipo,
              descricao: recurso.descricao,
              quantidade: recurso.quantidade,
              unidade: recurso.unidade,
              obrigatorio: recurso.obrigatorio || false
            }))
          });
        }
      }

      return tarefaAtualizada;
    });

    // Retornar tarefa completa com relacionamentos
    return this.buscarPorId(tarefa.id);
  }

  async atualizarStatus(id: string, updateStatusDto: UpdateStatusTarefaDto): Promise<TarefaResponseDto> {
    await this.verificarTarefaExiste(id);

    const tarefa = await this.prisma.tarefas.update({
      where: { id },
      data: {
        status: updateStatusDto.status,
        ativo: updateStatusDto.status === StatusTarefa.ATIVA,
        atualizado_por: updateStatusDto.atualizado_por,
        updated_at: new Date()
      }
    });

    return this.buscarPorId(tarefa.id);
  }

  async reordenar(id: string, reordenarDto: ReordenarTarefaDto): Promise<TarefaResponseDto> {
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

  async remover(id: string): Promise<void> {
    await this.verificarTarefaExiste(id);

    // Soft delete
    await this.prisma.tarefas.update({
      where: { id },
      data: { deleted_at: new Date() }
    });
  }

  async obterDashboard(): Promise<DashboardTarefasDto> {
    const [statusStats, criticidadeStats, tipoStats, categoriaStats, gerais] = await Promise.all([
      // Stats por status
      this.prisma.tarefas.groupBy({
        by: ['status'],
        where: { deleted_at: null },
        _count: true
      }),

      // Stats por criticidade
      this.prisma.tarefas.groupBy({
        by: ['criticidade'],
        where: { deleted_at: null, ativo: true },
        _count: true
      }),

      // Stats por tipo
      this.prisma.tarefas.groupBy({
        by: ['tipo_manutencao'],
        where: { deleted_at: null, ativo: true },
        _count: true
      }),

      // Stats por categoria
      this.prisma.tarefas.groupBy({
        by: ['categoria'],
        where: { deleted_at: null, ativo: true },
        _count: true
      }),

      // Stats gerais
      this.prisma.tarefas.aggregate({
        where: { deleted_at: null, ativo: true },
        _count: true,
        _sum: { tempo_estimado: true },
        _avg: { 
          tempo_estimado: true,
          criticidade: true 
        }
      })
    ]);

    const [totalSubTarefas, totalRecursos] = await Promise.all([
      this.prisma.sub_tarefas.count({
        where: {
          tarefa: {
            deleted_at: null,
            ativo: true
          }
        }
      }),
      this.prisma.recursos_tarefa.count({
        where: {
          tarefa: {
            deleted_at: null,
            ativo: true
          }
        }
      })
    ]);

    const totalTarefas = statusStats.reduce((acc, stat) => acc + stat._count, 0);

    return {
      total_tarefas: totalTarefas,
      tarefas_ativas: this.contarPorStatus(statusStats, StatusTarefa.ATIVA),
      tarefas_inativas: this.contarPorStatus(statusStats, StatusTarefa.INATIVA),
      tarefas_em_revisao: this.contarPorStatus(statusStats, StatusTarefa.EM_REVISAO),
      tarefas_arquivadas: this.contarPorStatus(statusStats, StatusTarefa.ARQUIVADA),

      // Por criticidade
      criticidade_muito_alta: this.contarPorCriticidade(criticidadeStats, 5),
      criticidade_alta: this.contarPorCriticidade(criticidadeStats, 4),
      criticidade_media: this.contarPorCriticidade(criticidadeStats, 3),
      criticidade_baixa: this.contarPorCriticidade(criticidadeStats, 2),
      criticidade_muito_baixa: this.contarPorCriticidade(criticidadeStats, 1),

      // Por tipo
      distribuicao_tipos: {
        preventiva: this.contarPorTipo(tipoStats, 'PREVENTIVA'),
        preditiva: this.contarPorTipo(tipoStats, 'PREDITIVA'),
        corretiva: this.contarPorTipo(tipoStats, 'CORRETIVA'),
        inspecao: this.contarPorTipo(tipoStats, 'INSPECAO'),
        visita_tecnica: this.contarPorTipo(tipoStats, 'VISITA_TECNICA')
      },

      // Por categoria
      distribuicao_categorias: {
        mecanica: this.contarPorCategoria(categoriaStats, 'MECANICA'),
        eletrica: this.contarPorCategoria(categoriaStats, 'ELETRICA'),
        instrumentacao: this.contarPorCategoria(categoriaStats, 'INSTRUMENTACAO'),
        lubrificacao: this.contarPorCategoria(categoriaStats, 'LUBRIFICACAO'),
        limpeza: this.contarPorCategoria(categoriaStats, 'LIMPEZA'),
        inspecao: this.contarPorCategoria(categoriaStats, 'INSPECAO'),
        calibracao: this.contarPorCategoria(categoriaStats, 'CALIBRACAO'),
        outros: this.contarPorCategoria(categoriaStats, 'OUTROS')
      },

      // Estatísticas gerais
      tempo_total_estimado: gerais._sum.tempo_estimado || 0,
      media_tempo_por_tarefa: Math.round(gerais._avg.tempo_estimado || 0),
      media_criticidade: Math.round((gerais._avg.criticidade || 0) * 10) / 10,
      total_sub_tarefas: totalSubTarefas,
      total_recursos: totalRecursos
    };
  }

  // Métodos privados auxiliares

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

  private includeRelacionamentosLista() {
    return {
      plano_manutencao: {
        select: {
          id: true,
          nome: true,
          versao: true,
          status: true
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
      _count: {
        select: {
          sub_tarefas: true,
          recursos: true,
          anexos: true
        }
      }
    };
  }

  private includeRelacionamentosCompletos() {
    return {
      plano_manutencao: {
        select: {
          id: true,
          nome: true,
          versao: true,
          status: true
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
      },
      sub_tarefas: {
        orderBy: { ordem: 'asc' as const }
      },
      recursos: true,
      anexos: {
        orderBy: { created_at: 'desc' as const }
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

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.ativo !== undefined) {
      where.ativo = filters.ativo;
    }

    if (filters.categoria) {
      where.categoria = filters.categoria;
    }

    if (filters.tipo_manutencao) {
      where.tipo_manutencao = filters.tipo_manutencao;
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
        { nome: { contains: search, mode: 'insensitive' } },
        { descricao: { contains: search, mode: 'insensitive' } },
        { responsavel: { contains: search, mode: 'insensitive' } },
        { planejador: { contains: search, mode: 'insensitive' } }
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
      case 'categoria':
        orderBy.categoria = sortOrder;
        break;
      case 'criticidade':
        orderBy.criticidade = sortOrder;
        break;
      case 'ordem':
        orderBy.ordem = sortOrder;
        break;
      case 'tempo_estimado':
        orderBy.tempo_estimado = sortOrder;
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
      id: tarefa.id,
      plano_manutencao_id: tarefa.plano_manutencao_id,
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
      planta_id: tarefa.planta_id,
      equipamento_id: tarefa.equipamento_id,
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
      usuario_criador: tarefa.usuario_criador,
      usuario_atualizador: tarefa.usuario_atualizador,
      sub_tarefas: tarefa.sub_tarefas,
      recursos: tarefa.recursos,
      anexos: tarefa.anexos,
      total_sub_tarefas: tarefa._count?.sub_tarefas || tarefa.sub_tarefas?.length || 0,
      total_recursos: tarefa._count?.recursos || tarefa.recursos?.length || 0,
      total_anexos: tarefa._count?.anexos || tarefa.anexos?.length || 0
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
}