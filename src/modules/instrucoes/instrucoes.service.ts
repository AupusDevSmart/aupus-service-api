// src/modules/instrucoes/instrucoes.service.ts
import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  CreateInstrucaoDto,
  UpdateInstrucaoDto,
  QueryInstrucoesDto,
  UpdateStatusInstrucaoDto,
  InstrucaoResponseDto,
  DashboardInstrucoesDto,
  AdicionarAoPlanoDto
} from './dto';
import { StatusTarefa, Prisma } from '@prisma/client';

@Injectable()
export class InstrucoesService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(createDto: CreateInstrucaoDto): Promise<InstrucaoResponseDto> {
    // Se não foi fornecida TAG, gerar automaticamente
    if (!createDto.tag) {
      createDto.tag = await this.gerarTagUnica();
    } else {
      await this.verificarTagUnica(createDto.tag);
    }

    // Transação para criar instrução com sub-estruturas
    const instrucao = await this.prisma.$transaction(async (tx) => {
      const novaInstrucao = await tx.instrucoes.create({
        data: {
          tag: createDto.tag,
          nome: createDto.nome,
          descricao: createDto.descricao,
          categoria: createDto.categoria,
          tipo_manutencao: createDto.tipo_manutencao,
          condicao_ativo: createDto.condicao_ativo,
          criticidade: createDto.criticidade,
          duracao_estimada: createDto.duracao_estimada,
          tempo_estimado: createDto.tempo_estimado,
          observacoes: createDto.observacoes,
          status: createDto.status || StatusTarefa.ATIVA,
          ativo: createDto.ativo !== undefined ? createDto.ativo : true,
          criado_por: createDto.criado_por
        }
      });

      // Criar sub-instruções se fornecidas
      if (createDto.sub_instrucoes && createDto.sub_instrucoes.length > 0) {
        await tx.sub_instrucoes.createMany({
          data: createDto.sub_instrucoes.map((sub, index) => ({
            instrucao_id: novaInstrucao.id,
            descricao: sub.descricao,
            obrigatoria: sub.obrigatoria || false,
            tempo_estimado: sub.tempo_estimado,
            ordem: sub.ordem ?? index + 1
          }))
        });
      }

      // Criar recursos se fornecidos
      if (createDto.recursos && createDto.recursos.length > 0) {
        await tx.recursos_instrucao.createMany({
          data: createDto.recursos.map(recurso => ({
            instrucao_id: novaInstrucao.id,
            tipo: recurso.tipo,
            descricao: recurso.descricao,
            quantidade: recurso.quantidade,
            unidade: recurso.unidade,
            obrigatorio: recurso.obrigatorio || false
          }))
        });
      }

      return novaInstrucao;
    });

    return this.buscarPorId(instrucao.id);
  }

  async listar(queryDto: QueryInstrucoesDto): Promise<{
    data: InstrucaoResponseDto[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }> {
    const { page, limit, search, sort_by, sort_order, ...filters } = queryDto;
    const skip = (page - 1) * limit;

    const where: Prisma.instrucoesWhereInput = {
      deleted_at: null,
      ...this.construirFiltros(filters, search)
    };

    const orderBy = this.construirOrdenacao(sort_by, sort_order);

    const [instrucoes, total] = await Promise.all([
      this.prisma.instrucoes.findMany({
        where,
        include: this.includeRelacionamentosLista(),
        orderBy,
        skip,
        take: limit
      }),
      this.prisma.instrucoes.count({ where })
    ]);

    return {
      data: instrucoes.map(inst => this.mapearParaResponse(inst)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  async buscarPorId(id: string): Promise<InstrucaoResponseDto> {
    const [instrucao, sub_instrucoes, recursos, anexos, totalTarefas] = await Promise.all([
      this.prisma.instrucoes.findFirst({
        where: { id, deleted_at: null },
        include: {
          usuario_criador: {
            select: { id: true, nome: true, email: true }
          },
          usuario_atualizador: {
            select: { id: true, nome: true, email: true }
          }
        }
      }),
      this.prisma.sub_instrucoes.findMany({
        where: { instrucao_id: id },
        orderBy: { ordem: 'asc' }
      }),
      this.prisma.recursos_instrucao.findMany({
        where: { instrucao_id: id }
      }),
      this.prisma.anexos_instrucao.findMany({
        where: { instrucao_id: id },
        orderBy: { created_at: 'desc' }
      }),
      this.prisma.tarefas.count({
        where: { instrucao_id: id, deleted_at: null }
      })
    ]);

    if (!instrucao) {
      throw new NotFoundException('Instrução não encontrada');
    }

    const instrucaoCompleta = {
      ...instrucao,
      sub_instrucoes,
      recursos,
      anexos,
      _tarefas_derivadas: totalTarefas
    };

    return this.mapearParaResponse(instrucaoCompleta);
  }

  async atualizar(id: string, updateDto: UpdateInstrucaoDto): Promise<InstrucaoResponseDto> {
    const instrucaoExistente = await this.verificarInstrucaoExiste(id);

    // Se mudou TAG, verificar unicidade
    if (updateDto.tag && updateDto.tag !== instrucaoExistente.tag) {
      await this.verificarTagUnica(updateDto.tag, id);
    }

    const { sub_instrucoes, recursos, ...dadosAtualizacao } = updateDto;

    const instrucao = await this.prisma.$transaction(async (tx) => {
      const instrucaoAtualizada = await tx.instrucoes.update({
        where: { id },
        data: {
          ...dadosAtualizacao,
          updated_at: new Date()
        }
      });

      // Se fornecidas sub-instruções, substituir todas
      if (updateDto.sub_instrucoes) {
        await tx.sub_instrucoes.deleteMany({ where: { instrucao_id: id } });

        if (updateDto.sub_instrucoes.length > 0) {
          await tx.sub_instrucoes.createMany({
            data: updateDto.sub_instrucoes.map((sub, index) => ({
              instrucao_id: id,
              descricao: sub.descricao,
              obrigatoria: sub.obrigatoria || false,
              tempo_estimado: sub.tempo_estimado,
              ordem: sub.ordem ?? index + 1
            }))
          });
        }
      }

      // Se fornecidos recursos, substituir todos
      if (updateDto.recursos) {
        await tx.recursos_instrucao.deleteMany({ where: { instrucao_id: id } });

        if (updateDto.recursos.length > 0) {
          await tx.recursos_instrucao.createMany({
            data: updateDto.recursos.map(recurso => ({
              instrucao_id: id,
              tipo: recurso.tipo,
              descricao: recurso.descricao,
              quantidade: recurso.quantidade,
              unidade: recurso.unidade,
              obrigatorio: recurso.obrigatorio || false
            }))
          });
        }
      }

      return instrucaoAtualizada;
    });

    return this.buscarPorId(instrucao.id);
  }

  async atualizarStatus(id: string, updateStatusDto: UpdateStatusInstrucaoDto): Promise<InstrucaoResponseDto> {
    await this.verificarInstrucaoExiste(id);

    const instrucao = await this.prisma.instrucoes.update({
      where: { id },
      data: {
        status: updateStatusDto.status,
        ativo: updateStatusDto.status === StatusTarefa.ATIVA,
        atualizado_por: updateStatusDto.atualizado_por,
        updated_at: new Date()
      }
    });

    return this.buscarPorId(instrucao.id);
  }

  async remover(id: string): Promise<void> {
    await this.verificarInstrucaoExiste(id);

    await this.prisma.instrucoes.update({
      where: { id },
      data: { deleted_at: new Date() }
    });
  }

  // ==========================================
  // Adicionar instrução ao plano como tarefa
  // ==========================================

  async adicionarAoPlano(id: string, dto: AdicionarAoPlanoDto): Promise<any> {
    const instrucao = await this.verificarInstrucaoExiste(id);

    // Buscar sub-instruções e recursos para copiar
    const [subInstrucoes, recursos] = await Promise.all([
      this.prisma.sub_instrucoes.findMany({
        where: { instrucao_id: id },
        orderBy: { ordem: 'asc' }
      }),
      this.prisma.recursos_instrucao.findMany({
        where: { instrucao_id: id }
      })
    ]);

    // Verificar se o plano existe e obter equipamento_id
    const plano = await this.prisma.planos_manutencao.findFirst({
      where: { id: dto.plano_manutencao_id, deleted_at: null },
      include: {
        equipamento: {
          select: {
            id: true,
            unidade: { select: { planta_id: true } }
          }
        }
      }
    });

    if (!plano) {
      throw new NotFoundException('Plano de manutenção não encontrado');
    }

    // Verificar se ordem já está em uso no plano
    const ordemExistente = await this.prisma.tarefas.findFirst({
      where: {
        plano_manutencao_id: dto.plano_manutencao_id,
        ordem: dto.ordem,
        deleted_at: null
      }
    });

    if (ordemExistente) {
      throw new ConflictException(`A ordem ${dto.ordem} já está sendo utilizada por outra tarefa neste plano`);
    }

    // Validar frequência personalizada
    if (dto.frequencia === 'PERSONALIZADA') {
      if (!dto.frequencia_personalizada || dto.frequencia_personalizada < 1) {
        throw new BadRequestException('Frequência personalizada deve ser informada e maior que zero quando a frequência é PERSONALIZADA');
      }
    }

    // Gerar TAG única para a tarefa
    const tagTarefa = await this.gerarTagTarefa(dto.plano_manutencao_id);

    // Criar tarefa em transação copiando dados da instrução
    const tarefa = await this.prisma.$transaction(async (tx) => {
      const novaTarefa = await tx.tarefas.create({
        data: {
          plano_manutencao_id: dto.plano_manutencao_id,
          instrucao_id: id,
          equipamento_id: plano.equipamento_id,
          planta_id: plano.equipamento?.unidade?.planta_id || null,
          tag: tagTarefa,
          nome: instrucao.nome,
          descricao: instrucao.descricao,
          categoria: instrucao.categoria,
          tipo_manutencao: instrucao.tipo_manutencao,
          frequencia: dto.frequencia,
          frequencia_personalizada: dto.frequencia_personalizada || null,
          condicao_ativo: instrucao.condicao_ativo,
          criticidade: instrucao.criticidade,
          duracao_estimada: instrucao.duracao_estimada,
          tempo_estimado: instrucao.tempo_estimado,
          ordem: dto.ordem,
          observacoes: instrucao.observacoes,
          status: StatusTarefa.ATIVA,
          ativo: true,
          criado_por: dto.criado_por
        }
      });

      // Copiar sub-instruções para sub-tarefas
      if (subInstrucoes.length > 0) {
        await tx.sub_tarefas.createMany({
          data: subInstrucoes.map(sub => ({
            tarefa_id: novaTarefa.id,
            descricao: sub.descricao,
            obrigatoria: sub.obrigatoria,
            tempo_estimado: sub.tempo_estimado,
            ordem: sub.ordem
          }))
        });
      }

      // Copiar recursos
      if (recursos.length > 0) {
        await tx.recursos_tarefa.createMany({
          data: recursos.map(rec => ({
            tarefa_id: novaTarefa.id,
            tipo: rec.tipo,
            descricao: rec.descricao,
            quantidade: rec.quantidade,
            unidade: rec.unidade,
            obrigatorio: rec.obrigatorio
          }))
        });
      }

      return novaTarefa;
    });

    return tarefa;
  }

  // ==========================================
  // Tarefas derivadas
  // ==========================================

  async listarTarefasDerivadas(instrucaoId: string): Promise<any[]> {
    await this.verificarInstrucaoExiste(instrucaoId);

    const tarefas = await this.prisma.tarefas.findMany({
      where: {
        instrucao_id: instrucaoId,
        deleted_at: null
      },
      include: {
        plano_manutencao: {
          select: { id: true, nome: true, versao: true, status: true }
        },
        equipamento: {
          select: { id: true, nome: true, tipo_equipamento: true, classificacao: true }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    return tarefas;
  }

  // ==========================================
  // Associações com anomalias
  // ==========================================

  async associarAnomalia(instrucaoId: string, anomaliaId: string, observacoes?: string, createdBy?: string): Promise<any> {
    await this.verificarInstrucaoExiste(instrucaoId);

    const anomalia = await this.prisma.anomalias.findFirst({
      where: { id: anomaliaId, deleted_at: null }
    });
    if (!anomalia) {
      throw new NotFoundException('Anomalia não encontrada');
    }

    return this.prisma.anomalias_instrucoes.create({
      data: {
        anomalia_id: anomaliaId,
        instrucao_id: instrucaoId,
        observacoes,
        created_by: createdBy
      }
    });
  }

  async listarAnomalias(instrucaoId: string): Promise<any[]> {
    await this.verificarInstrucaoExiste(instrucaoId);

    const associacoes = await this.prisma.anomalias_instrucoes.findMany({
      where: { instrucao_id: instrucaoId },
      include: {
        anomalia: {
          select: {
            id: true,
            descricao: true,
            local: true,
            status: true,
            prioridade: true,
            data: true,
            created_at: true
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    return associacoes;
  }

  async desassociarAnomalia(instrucaoId: string, anomaliaId: string): Promise<void> {
    const associacao = await this.prisma.anomalias_instrucoes.findFirst({
      where: { instrucao_id: instrucaoId, anomalia_id: anomaliaId }
    });

    if (!associacao) {
      throw new NotFoundException('Associação não encontrada');
    }

    await this.prisma.anomalias_instrucoes.delete({
      where: { id: associacao.id }
    });
  }

  // ==========================================
  // Associações com solicitações de serviço
  // ==========================================

  async associarSolicitacao(instrucaoId: string, solicitacaoId: string, observacoes?: string, createdBy?: string): Promise<any> {
    await this.verificarInstrucaoExiste(instrucaoId);

    const solicitacao = await this.prisma.solicitacoes_servico.findFirst({
      where: { id: solicitacaoId, deleted_at: null }
    });
    if (!solicitacao) {
      throw new NotFoundException('Solicitação de serviço não encontrada');
    }

    return this.prisma.solicitacoes_instrucoes.create({
      data: {
        solicitacao_id: solicitacaoId,
        instrucao_id: instrucaoId,
        observacoes,
        created_by: createdBy
      }
    });
  }

  async listarSolicitacoes(instrucaoId: string): Promise<any[]> {
    await this.verificarInstrucaoExiste(instrucaoId);

    const associacoes = await this.prisma.solicitacoes_instrucoes.findMany({
      where: { instrucao_id: instrucaoId },
      include: {
        solicitacao: {
          select: {
            id: true,
            numero: true,
            titulo: true,
            status: true,
            prioridade: true,
            tipo: true,
            created_at: true
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    return associacoes;
  }

  async desassociarSolicitacao(instrucaoId: string, solicitacaoId: string): Promise<void> {
    const associacao = await this.prisma.solicitacoes_instrucoes.findFirst({
      where: { instrucao_id: instrucaoId, solicitacao_id: solicitacaoId }
    });

    if (!associacao) {
      throw new NotFoundException('Associação não encontrada');
    }

    await this.prisma.solicitacoes_instrucoes.delete({
      where: { id: associacao.id }
    });
  }

  // ==========================================
  // Dashboard
  // ==========================================

  async obterDashboard(): Promise<DashboardInstrucoesDto> {
    const [statusStats, criticidadeStats, tipoStats, categoriaStats, gerais] = await Promise.all([
      this.prisma.instrucoes.groupBy({
        by: ['status'],
        where: { deleted_at: null },
        _count: true
      }),
      this.prisma.instrucoes.groupBy({
        by: ['criticidade'],
        where: { deleted_at: null, ativo: true },
        _count: true
      }),
      this.prisma.instrucoes.groupBy({
        by: ['tipo_manutencao'],
        where: { deleted_at: null, ativo: true },
        _count: true
      }),
      this.prisma.instrucoes.groupBy({
        by: ['categoria'],
        where: { deleted_at: null, ativo: true },
        _count: true
      }),
      this.prisma.instrucoes.aggregate({
        where: { deleted_at: null, ativo: true },
        _count: true,
        _sum: { tempo_estimado: true },
        _avg: {
          tempo_estimado: true,
          criticidade: true
        }
      })
    ]);

    const [totalSubInstrucoes, totalRecursos, totalTarefasDerivadas] = await Promise.all([
      this.prisma.sub_instrucoes.count({
        where: { instrucao: { deleted_at: null, ativo: true } }
      }),
      this.prisma.recursos_instrucao.count({
        where: { instrucao: { deleted_at: null, ativo: true } }
      }),
      this.prisma.tarefas.count({
        where: {
          instrucao_id: { not: null },
          deleted_at: null
        }
      })
    ]);

    const totalInstrucoes = statusStats.reduce((acc, stat) => acc + stat._count, 0);

    return {
      total_instrucoes: totalInstrucoes,
      instrucoes_ativas: this.contarPorStatus(statusStats, StatusTarefa.ATIVA),
      instrucoes_inativas: this.contarPorStatus(statusStats, StatusTarefa.INATIVA),
      instrucoes_em_revisao: this.contarPorStatus(statusStats, StatusTarefa.EM_REVISAO),
      instrucoes_arquivadas: this.contarPorStatus(statusStats, StatusTarefa.ARQUIVADA),

      criticidade_muito_alta: this.contarPorCriticidade(criticidadeStats, 5),
      criticidade_alta: this.contarPorCriticidade(criticidadeStats, 4),
      criticidade_media: this.contarPorCriticidade(criticidadeStats, 3),
      criticidade_baixa: this.contarPorCriticidade(criticidadeStats, 2),
      criticidade_muito_baixa: this.contarPorCriticidade(criticidadeStats, 1),

      distribuicao_tipos: {
        preventiva: this.contarPorTipo(tipoStats, 'PREVENTIVA'),
        preditiva: this.contarPorTipo(tipoStats, 'PREDITIVA'),
        corretiva: this.contarPorTipo(tipoStats, 'CORRETIVA'),
        inspecao: this.contarPorTipo(tipoStats, 'INSPECAO'),
        visita_tecnica: this.contarPorTipo(tipoStats, 'VISITA_TECNICA')
      },

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

      tempo_total_estimado: gerais._sum.tempo_estimado || 0,
      media_tempo_por_instrucao: Math.round(gerais._avg.tempo_estimado || 0),
      media_criticidade: Math.round((gerais._avg.criticidade || 0) * 10) / 10,
      total_sub_instrucoes: totalSubInstrucoes,
      total_recursos: totalRecursos,
      total_tarefas_derivadas: totalTarefasDerivadas
    };
  }

  // ==========================================
  // Métodos privados auxiliares
  // ==========================================

  private async verificarInstrucaoExiste(id: string) {
    const instrucao = await this.prisma.instrucoes.findFirst({
      where: { id, deleted_at: null }
    });

    if (!instrucao) {
      throw new NotFoundException('Instrução não encontrada');
    }

    return instrucao;
  }

  private async verificarTagUnica(tag: string, excludeId?: string) {
    const where: Prisma.instrucoesWhereInput = {
      tag,
      deleted_at: null
    };

    if (excludeId) {
      where.id = { not: excludeId };
    }

    const instrucaoExistente = await this.prisma.instrucoes.findFirst({ where });

    if (instrucaoExistente) {
      throw new ConflictException(`A TAG "${tag}" já está sendo utilizada por outra instrução`);
    }
  }

  private async gerarTagUnica(): Promise<string> {
    const ultimaInstrucao = await this.prisma.instrucoes.findFirst({
      orderBy: { created_at: 'desc' },
      select: { tag: true }
    });

    let proximoNumero = 1;

    if (ultimaInstrucao?.tag) {
      const match = ultimaInstrucao.tag.match(/INST-(\d+)/);
      if (match) {
        proximoNumero = parseInt(match[1]) + 1;
      }
    }

    const tag = `INST-${proximoNumero.toString().padStart(3, '0')}`;

    // Verificar se já existe (precaução)
    const tagExiste = await this.prisma.instrucoes.findFirst({ where: { tag } });
    if (tagExiste) {
      return `INST-${Date.now()}`;
    }

    return tag;
  }

  private async gerarTagTarefa(planoId: string): Promise<string> {
    const ultimaTarefa = await this.prisma.tarefas.findFirst({
      where: { plano_manutencao_id: planoId },
      orderBy: { created_at: 'desc' },
      select: { tag: true }
    });

    let proximoNumero = 1;

    if (ultimaTarefa?.tag) {
      const match = ultimaTarefa.tag.match(/TRF-(\d+)/);
      if (match) {
        proximoNumero = parseInt(match[1]) + 1;
      }
    }

    const tag = `TRF-${proximoNumero.toString().padStart(3, '0')}`;

    const tagExiste = await this.prisma.tarefas.findFirst({ where: { tag } });
    if (tagExiste) {
      return `TRF-${Date.now()}`;
    }

    return tag;
  }

  private includeRelacionamentosLista() {
    return {
      _count: {
        select: {
          sub_instrucoes: true,
          recursos: true,
          anexos: true,
          tarefas: true
        }
      }
    };
  }

  private construirFiltros(filters: Partial<QueryInstrucoesDto>, search?: string): Prisma.instrucoesWhereInput {
    const where: Prisma.instrucoesWhereInput = {};

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

    if (filters.criticidade) {
      where.criticidade = filters.criticidade;
    }

    if (search) {
      where.OR = [
        { tag: { contains: search, mode: 'insensitive' } },
        { nome: { contains: search, mode: 'insensitive' } },
        { descricao: { contains: search, mode: 'insensitive' } }
      ];
    }

    return where;
  }

  private construirOrdenacao(sortBy?: string, sortOrder?: 'asc' | 'desc') {
    const orderBy: Prisma.instrucoesOrderByWithRelationInput = {};

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

  private mapearParaResponse(instrucao: any): InstrucaoResponseDto {
    return {
      id: instrucao.id?.trim() || instrucao.id,
      tag: instrucao.tag,
      nome: instrucao.nome,
      descricao: instrucao.descricao,
      categoria: instrucao.categoria,
      tipo_manutencao: instrucao.tipo_manutencao,
      condicao_ativo: instrucao.condicao_ativo,
      criticidade: instrucao.criticidade,
      duracao_estimada: Number(instrucao.duracao_estimada),
      tempo_estimado: instrucao.tempo_estimado,
      observacoes: instrucao.observacoes,
      status: instrucao.status,
      ativo: instrucao.ativo,
      created_at: instrucao.created_at,
      updated_at: instrucao.updated_at,
      criado_por: instrucao.criado_por,
      atualizado_por: instrucao.atualizado_por,
      usuario_criador: instrucao.usuario_criador,
      usuario_atualizador: instrucao.usuario_atualizador,
      sub_instrucoes: instrucao.sub_instrucoes,
      recursos: instrucao.recursos,
      anexos: instrucao.anexos,
      total_sub_instrucoes: instrucao._count?.sub_instrucoes ?? instrucao.sub_instrucoes?.length ?? 0,
      total_recursos: instrucao._count?.recursos ?? instrucao.recursos?.length ?? 0,
      total_anexos: instrucao._count?.anexos ?? instrucao.anexos?.length ?? 0,
      total_tarefas_derivadas: instrucao._count?.tarefas ?? instrucao._tarefas_derivadas ?? 0
    };
  }

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
