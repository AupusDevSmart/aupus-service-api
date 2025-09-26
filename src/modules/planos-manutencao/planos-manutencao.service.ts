// src/modules/planos-manutencao/planos-manutencao.service.ts
import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  CreatePlanoManutencaoDto,
  UpdatePlanoManutencaoDto,
  QueryPlanosDto,
  QueryPlanosPorPlantaDto,
  DuplicarPlanoDto,
  UpdateStatusPlanoDto,
  PlanoManutencaoResponseDto,
  PlanoResumoDto,
  DashboardPlanosDto
} from './dto';
import { StatusPlano, Prisma } from '@prisma/client';

@Injectable()
export class PlanosManutencaoService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(createDto: CreatePlanoManutencaoDto): Promise<PlanoManutencaoResponseDto> {
    // Verificar se equipamento existe
    await this.verificarEquipamentoExiste(createDto.equipamento_id);
    
    // Verificar se equipamento já tem plano (constraint unique)
    const planoExistente = await this.prisma.planos_manutencao.findFirst({
      where: {
        equipamento_id: createDto.equipamento_id,
        deleted_at: null
      }
    });

    if (planoExistente) {
      throw new ConflictException('Este equipamento já possui um plano de manutenção');
    }

    // Converter datas string para Date objects
    const dados = {
      ...createDto,
      versao: createDto.versao || '1.0',
      status: createDto.status || StatusPlano.ATIVO,
      ativo: createDto.ativo !== undefined ? createDto.ativo : true,
      // Converter datas se existirem
      data_vigencia_inicio: createDto.data_vigencia_inicio ? this.converterStringParaDate(createDto.data_vigencia_inicio) : null,
      data_vigencia_fim: createDto.data_vigencia_fim ? this.converterStringParaDate(createDto.data_vigencia_fim) : null
    };

    const plano = await this.prisma.planos_manutencao.create({
      data: dados,
      include: this.includeRelacionamentos()
    });

    return this.mapearParaResponse(plano);
  }

  async listar(queryDto: QueryPlanosDto): Promise<{
    data: PlanoManutencaoResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page, limit, search, sort_by, sort_order, ...filters } = queryDto;
    const skip = (page - 1) * limit;

    // Construir filtros
    const where: Prisma.planos_manutencaoWhereInput = {
      deleted_at: null,
      ...this.construirFiltros(filters, search)
    };

    // Construir ordenação
    const orderBy = this.construirOrdenacao(sort_by, sort_order);

    const [planos, total] = await Promise.all([
      this.prisma.planos_manutencao.findMany({
        where,
        include: {
          equipamento: {
            select: {
              id: true,
              nome: true,
              tipo_equipamento: true,
              classificacao: true,
              planta: {
                select: {
                  id: true,
                  nome: true,
                  localizacao: true
                }
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
          _count: {
            select: {
              tarefas: {
                where: { deleted_at: null }
              }
            }
          }
        },
        orderBy,
        skip,
        take: limit
      }),
      this.prisma.planos_manutencao.count({ where })
    ]);

    return {
      data: planos.map(plano => this.mapearParaResponse(plano)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async buscarPorId(id: string, incluirTarefas = false): Promise<PlanoManutencaoResponseDto> {
    const includeOptions: any = {
      ...this.includeRelacionamentos(),
      ...(incluirTarefas && {
        tarefas: {
          where: { deleted_at: null },
          include: {
            _count: {
              select: {
                sub_tarefas: true,
                recursos: true,
                anexos: true
              }
            }
          },
          orderBy: { ordem: 'asc' }
        }
      })
    };

    const plano = await this.prisma.planos_manutencao.findFirst({
      where: {
        id,
        deleted_at: null
      },
      include: includeOptions
    });

    if (!plano) {
      throw new NotFoundException('Plano de manutenção não encontrado');
    }

    return this.mapearParaResponse(plano);
  }

  async buscarPorEquipamento(equipamentoId: string): Promise<PlanoManutencaoResponseDto> {
    await this.verificarEquipamentoExiste(equipamentoId);

    const plano = await this.prisma.planos_manutencao.findFirst({
      where: {
        equipamento_id: equipamentoId,
        deleted_at: null
      },
      include: this.includeRelacionamentos()
    });

    if (!plano) {
      throw new NotFoundException('Este equipamento não possui plano de manutenção');
    }

    return this.mapearParaResponse(plano);
  }

  async buscarPorPlanta(plantaId: string, queryDto: QueryPlanosPorPlantaDto): Promise<{
    data: PlanoManutencaoResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    // Verificar se planta existe
    await this.verificarPlantaExiste(plantaId);

    const { page, limit, status, incluir_tarefas } = queryDto;
    const skip = (page - 1) * limit;

    // Construir filtros - JOIN entre planos_manutencao e equipamentos
    const where: Prisma.planos_manutencaoWhereInput = {
      deleted_at: null,
      status: status,
      equipamento: {
        planta_id: plantaId,
        deleted_at: null
      }
    };

    // Construir include com base nos parâmetros
    const includeOptions: any = {
      equipamento: {
        select: {
          id: true,
          nome: true,
          tipo_equipamento: true,
          classificacao: true,
          planta: {
            select: {
              id: true,
              nome: true,
              localizacao: true
            }
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
      _count: {
        select: {
          tarefas: {
            where: { deleted_at: null }
          }
        }
      }
    };

    // Incluir tarefas se solicitado
    if (incluir_tarefas) {
      includeOptions.tarefas = {
        where: { deleted_at: null },
        include: {
          _count: {
            select: {
              sub_tarefas: true,
              recursos: true,
              anexos: true
            }
          }
        },
        orderBy: { ordem: 'asc' }
      };
    }

    const [planos, total] = await Promise.all([
      this.prisma.planos_manutencao.findMany({
        where,
        include: includeOptions,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit
      }),
      this.prisma.planos_manutencao.count({ where })
    ]);

    return {
      data: planos.map(plano => this.mapearParaResponse(plano)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async atualizar(id: string, updateDto: UpdatePlanoManutencaoDto): Promise<PlanoManutencaoResponseDto> {
    await this.verificarPlanoExiste(id);

    // Se mudou equipamento, verificar se novo equipamento já tem plano
    if (updateDto.equipamento_id) {
      await this.verificarEquipamentoExiste(updateDto.equipamento_id);
      
      const planoExistente = await this.prisma.planos_manutencao.findFirst({
        where: {
          equipamento_id: updateDto.equipamento_id,
          id: { not: id },
          deleted_at: null
        }
      });

      if (planoExistente) {
        throw new ConflictException('O equipamento selecionado já possui um plano de manutenção');
      }
    }

    // Preparar dados com conversão de datas
    const dadosAtualizacao: any = {
      ...updateDto,
      updated_at: new Date()
    };

    // Converter datas se existirem no DTO
    if (updateDto.data_vigencia_inicio !== undefined) {
      dadosAtualizacao.data_vigencia_inicio = updateDto.data_vigencia_inicio 
        ? this.converterStringParaDate(updateDto.data_vigencia_inicio)
        : null;
    }

    if (updateDto.data_vigencia_fim !== undefined) {
      dadosAtualizacao.data_vigencia_fim = updateDto.data_vigencia_fim 
        ? this.converterStringParaDate(updateDto.data_vigencia_fim)
        : null;
    }

    const plano = await this.prisma.planos_manutencao.update({
      where: { id },
      data: dadosAtualizacao,
      include: this.includeRelacionamentos()
    });

    return this.mapearParaResponse(plano);
  }

  async atualizarStatus(id: string, updateStatusDto: UpdateStatusPlanoDto): Promise<PlanoManutencaoResponseDto> {
    await this.verificarPlanoExiste(id);

    const plano = await this.prisma.planos_manutencao.update({
      where: { id },
      data: {
        status: updateStatusDto.status,
        ativo: updateStatusDto.status === StatusPlano.ATIVO,
        atualizado_por: updateStatusDto.atualizado_por,
        updated_at: new Date()
      },
      include: this.includeRelacionamentos()
    });

    return this.mapearParaResponse(plano);
  }

  async remover(id: string): Promise<void> {
    await this.verificarPlanoExiste(id);

    // Soft delete - também marca tarefas como removidas
    await this.prisma.$transaction(async (tx) => {
      // Remover tarefas do plano
      await tx.tarefas.updateMany({
        where: { plano_manutencao_id: id },
        data: { deleted_at: new Date() }
      });

      // Remover plano
      await tx.planos_manutencao.update({
        where: { id },
        data: { deleted_at: new Date() }
      });
    });
  }

  async duplicar(id: string, duplicarDto: DuplicarPlanoDto): Promise<PlanoManutencaoResponseDto> {
    // Verificar se plano original existe
    const planoOriginal = await this.prisma.planos_manutencao.findFirst({
      where: {
        id,
        deleted_at: null
      },
      include: {
        tarefas: {
          where: { deleted_at: null },
          include: {
            sub_tarefas: true,
            recursos: true,
            anexos: true
          }
        },
        equipamento: {
          select: { nome: true }
        }
      }
    });

    if (!planoOriginal) {
      throw new NotFoundException('Plano de manutenção original não encontrado');
    }

    // Verificar se equipamento destino existe
    await this.verificarEquipamentoExiste(duplicarDto.equipamento_destino_id);

    // Verificar se equipamento destino já tem plano
    const planoDestino = await this.prisma.planos_manutencao.findFirst({
      where: {
        equipamento_id: duplicarDto.equipamento_destino_id,
        deleted_at: null
      }
    });

    if (planoDestino) {
      throw new ConflictException('O equipamento destino já possui um plano de manutenção');
    }

    // Buscar equipamento destino para gerar nome
    const equipamentoDestino = await this.prisma.equipamentos.findUnique({
      where: { id: duplicarDto.equipamento_destino_id },
      select: { nome: true }
    });

    const novoNome = duplicarDto.novo_nome || 
      `${planoOriginal.nome} - ${equipamentoDestino.nome}`;

    // Duplicar plano com todas as tarefas
    const planoDuplicado = await this.prisma.$transaction(async (tx) => {
      // Criar novo plano - com conversão de datas
      const novoPlano = await tx.planos_manutencao.create({
        data: {
          equipamento_id: duplicarDto.equipamento_destino_id,
          nome: novoNome,
          descricao: planoOriginal.descricao,
          versao: '1.0', // Reset versão
          status: StatusPlano.ATIVO,
          ativo: true,
          data_vigencia_inicio: planoOriginal.data_vigencia_inicio,
          data_vigencia_fim: planoOriginal.data_vigencia_fim,
          observacoes: planoOriginal.observacoes,
          criado_por: duplicarDto.criado_por
        }
      });

      // Duplicar todas as tarefas
      for (const tarefaOriginal of planoOriginal.tarefas) {
        // Gerar nova TAG
        const novaTag = await this.gerarNovaTag(
          duplicarDto.equipamento_destino_id,
          duplicarDto.novo_prefixo_tag || 'TRF'
        );

        // Criar nova tarefa
        const novaTarefa = await tx.tarefas.create({
          data: {
            plano_manutencao_id: novoPlano.id,
            equipamento_id: duplicarDto.equipamento_destino_id,
            tag: novaTag,
            nome: tarefaOriginal.nome,
            descricao: tarefaOriginal.descricao,
            categoria: tarefaOriginal.categoria,
            tipo_manutencao: tarefaOriginal.tipo_manutencao,
            frequencia: tarefaOriginal.frequencia,
            frequencia_personalizada: tarefaOriginal.frequencia_personalizada,
            condicao_ativo: tarefaOriginal.condicao_ativo,
            criticidade: tarefaOriginal.criticidade,
            duracao_estimada: tarefaOriginal.duracao_estimada,
            tempo_estimado: tarefaOriginal.tempo_estimado,
            ordem: tarefaOriginal.ordem,
            planejador: tarefaOriginal.planejador,
            responsavel: tarefaOriginal.responsavel,
            observacoes: tarefaOriginal.observacoes,
            status: tarefaOriginal.status,
            ativo: tarefaOriginal.ativo,
            criado_por: duplicarDto.criado_por
          }
        });

        // Duplicar sub-tarefas
        for (const subTarefa of tarefaOriginal.sub_tarefas) {
          await tx.sub_tarefas.create({
            data: {
              tarefa_id: novaTarefa.id,
              descricao: subTarefa.descricao,
              obrigatoria: subTarefa.obrigatoria,
              tempo_estimado: subTarefa.tempo_estimado,
              ordem: subTarefa.ordem
            }
          });
        }

        // Duplicar recursos
        for (const recurso of tarefaOriginal.recursos) {
          await tx.recursos_tarefa.create({
            data: {
              tarefa_id: novaTarefa.id,
              tipo: recurso.tipo,
              descricao: recurso.descricao,
              quantidade: recurso.quantidade,
              unidade: recurso.unidade,
              obrigatorio: recurso.obrigatorio
            }
          });
        }

        // Anexos não são duplicados (apenas referências)
        // Se quiser duplicar, seria necessário copiar os arquivos físicos
      }

      return novoPlano;
    });

    // Retornar plano criado com relacionamentos
    return this.buscarPorId(planoDuplicado.id, true);
  }

  async obterResumo(id: string): Promise<PlanoResumoDto> {
    const plano = await this.prisma.planos_manutencao.findFirst({
      where: { 
        id,
        deleted_at: null 
      },
      include: {
        equipamento: {
          include: {
            planta: true
          }
        },
        tarefas: {
          where: { deleted_at: null },
          include: {
            _count: {
              select: {
                sub_tarefas: true
              }
            }
          }
        }
      }
    });

    if (!plano) {
      throw new NotFoundException('Plano de manutenção não encontrado');
    }

    // Calcular estatísticas
    const totalTarefas = plano.tarefas.length;
    const tarefasAtivas = plano.tarefas.filter(t => t.ativo).length;
    const tarefasEmRevisao = plano.tarefas.filter(t => !t.ativo).length;

    const tarefasPreventivas = plano.tarefas.filter(t => t.tipo_manutencao === 'PREVENTIVA').length;
    const tarefasPreditivas = plano.tarefas.filter(t => t.tipo_manutencao === 'PREDITIVA').length;
    const tarefasCorretivas = plano.tarefas.filter(t => t.tipo_manutencao === 'CORRETIVA').length;

    const tempoTotalEstimado = plano.tarefas.reduce((total, tarefa) => 
      total + (tarefa.tempo_estimado || 0), 0
    );

    const resumo: PlanoResumoDto = {
      id: plano.id,
      nome: plano.nome,
      versao: plano.versao,
      status: plano.status,
      equipamento_nome: plano.equipamento.nome,
      equipamento_tipo: plano.equipamento.tipo_equipamento,
      planta_nome: plano.equipamento.planta?.nome,
      total_tarefas: totalTarefas,
      tarefas_ativas: tarefasAtivas,
      tarefas_em_revisao: tarefasEmRevisao,
      tempo_total_estimado: tempoTotalEstimado,
      tarefas_preventivas: tarefasPreventivas,
      tarefas_preditivas: tarefasPreditivas,
      tarefas_corretivas: tarefasCorretivas,
      created_at: plano.created_at,
      updated_at: plano.updated_at
    };

    return resumo;
  }

  async obterDashboard(): Promise<DashboardPlanosDto> {
    const [statsPlanos, statsTarefas, distribuicao] = await Promise.all([
      // Stats dos planos
      this.prisma.planos_manutencao.groupBy({
        by: ['status'],
        where: { deleted_at: null },
        _count: true
      }),

      // Stats das tarefas
      this.prisma.tarefas.aggregate({
        where: { deleted_at: null },
        _count: true,
        _avg: { tempo_estimado: true }
      }),

      // Distribuição por tipo
      this.prisma.tarefas.groupBy({
        by: ['tipo_manutencao'],
        where: { 
          deleted_at: null,
          ativo: true
        },
        _count: true
      })
    ]);

    const totalPlanos = statsPlanos.reduce((acc, stat) => acc + stat._count, 0);
    const equipamentosComPlano = await this.prisma.planos_manutencao.groupBy({
      by: ['equipamento_id'],
      where: { deleted_at: null }
    }).then(result => result.length);

    const mediaTempoTotal = await this.prisma.$queryRaw<[{avg: number}]>`
      SELECT AVG(tempo_total) as avg
      FROM (
        SELECT SUM(t.tempo_estimado) as tempo_total
        FROM tarefas t
        WHERE t.deleted_at IS NULL AND t.ativo = true
        GROUP BY t.plano_manutencao_id
      ) subquery
    `;

    return {
      total_planos: totalPlanos,
      planos_ativos: this.contarPorStatus(statsPlanos, StatusPlano.ATIVO),
      planos_inativos: this.contarPorStatus(statsPlanos, StatusPlano.INATIVO),
      planos_em_revisao: this.contarPorStatus(statsPlanos, StatusPlano.EM_REVISAO),
      planos_arquivados: this.contarPorStatus(statsPlanos, StatusPlano.ARQUIVADO),
      equipamentos_com_plano: equipamentosComPlano,
      total_tarefas_todos_planos: statsTarefas._count,
      media_tarefas_por_plano: totalPlanos > 0 ? Math.round(statsTarefas._count / totalPlanos) : 0,
      tempo_total_estimado_geral: Math.round(mediaTempoTotal[0]?.avg || 0),
      distribuicao_tipos: {
        preventiva: this.contarPorTipo(distribuicao, 'PREVENTIVA'),
        preditiva: this.contarPorTipo(distribuicao, 'PREDITIVA'),
        corretiva: this.contarPorTipo(distribuicao, 'CORRETIVA'),
        inspecao: this.contarPorTipo(distribuicao, 'INSPECAO'),
        visita_tecnica: this.contarPorTipo(distribuicao, 'VISITA_TECNICA')
      }
    };
  }

  // Métodos privados auxiliares

  /**
   * Converte string de data para objeto Date
   * Aceita formatos: "2025-09-13" ou "2025-09-13T10:30:00.000Z"
   */
  private converterStringParaDate(dataString: string | Date): Date {
    if (dataString instanceof Date) {
      return dataString;
    }

    if (typeof dataString === 'string') {
      // Se é apenas uma data (YYYY-MM-DD), adicionar hora para evitar problemas de timezone
      if (dataString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return new Date(dataString + 'T00:00:00.000Z');
      }
      // Se já é um datetime ISO, usar diretamente
      return new Date(dataString);
    }

    throw new BadRequestException('Formato de data inválido');
  }

  private async verificarEquipamentoExiste(equipamentoId: string): Promise<void> {
    const equipamento = await this.prisma.equipamentos.findFirst({
      where: {
        id: equipamentoId,
        deleted_at: null
      }
    });

    if (!equipamento) {
      throw new NotFoundException('Equipamento não encontrado');
    }
  }

  private async verificarPlantaExiste(plantaId: string): Promise<void> {
    const planta = await this.prisma.plantas.findFirst({
      where: {
        id: plantaId,
        deleted_at: null
      }
    });

    if (!planta) {
      throw new NotFoundException('Planta não encontrada');
    }
  }

  private async verificarPlanoExiste(id: string): Promise<void> {
    const plano = await this.prisma.planos_manutencao.findFirst({
      where: {
        id,
        deleted_at: null
      }
    });

    if (!plano) {
      throw new NotFoundException('Plano de manutenção não encontrado');
    }
  }

  private includeRelacionamentos() {
    return {
      equipamento: {
        select: {
          id: true,
          nome: true,
          tipo_equipamento: true,
          classificacao: true,
          planta: {
            select: {
              id: true,
              nome: true,
              localizacao: true
            }
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

  private construirFiltros(filters: Partial<QueryPlanosDto>, search?: string): Prisma.planos_manutencaoWhereInput {
    const where: Prisma.planos_manutencaoWhereInput = {};

    if (filters.equipamento_id) {
      where.equipamento_id = filters.equipamento_id;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.ativo !== undefined) {
      where.ativo = filters.ativo;
    }

    if (filters.planta_id) {
      where.equipamento = {
        planta_id: filters.planta_id
      };
    }

    if (search) {
      where.OR = [
        { nome: { contains: search, mode: 'insensitive' } },
        { descricao: { contains: search, mode: 'insensitive' } },
        { equipamento: { nome: { contains: search, mode: 'insensitive' } } }
      ];
    }

    return where;
  }

  private construirOrdenacao(sortBy?: string, sortOrder?: 'asc' | 'desc') {
    const orderBy: Prisma.planos_manutencaoOrderByWithRelationInput = {};

    switch (sortBy) {
      case 'nome':
        orderBy.nome = sortOrder;
        break;
      case 'equipamento':
        orderBy.equipamento = { nome: sortOrder };
        break;
      case 'status':
        orderBy.status = sortOrder;
        break;
      case 'updated_at':
        orderBy.updated_at = sortOrder;
        break;
      default:
        orderBy.created_at = sortOrder || 'desc';
    }

    return orderBy;
  }

  private mapearParaResponse(plano: any): PlanoManutencaoResponseDto {
    return {
      id: plano.id,
      equipamento_id: plano.equipamento_id,
      nome: plano.nome,
      descricao: plano.descricao,
      versao: plano.versao,
      status: plano.status,
      ativo: plano.ativo,
      data_vigencia_inicio: plano.data_vigencia_inicio,
      data_vigencia_fim: plano.data_vigencia_fim,
      observacoes: plano.observacoes,
      criado_por: plano.criado_por,
      atualizado_por: plano.atualizado_por,
      created_at: plano.created_at,
      updated_at: plano.updated_at,
      equipamento: plano.equipamento,
      usuario_criador: plano.usuario_criador,
      usuario_atualizador: plano.usuario_atualizador,
      tarefas: plano.tarefas?.map((tarefa: any) => ({
        id: tarefa.id,
        tag: tarefa.tag,
        nome: tarefa.nome,
        categoria: tarefa.categoria,
        tipo_manutencao: tarefa.tipo_manutencao,
        status: tarefa.status,
        ordem: tarefa.ordem,
        duracao_estimada: Number(tarefa.duracao_estimada),
        tempo_estimado: tarefa.tempo_estimado,
        total_sub_tarefas: tarefa._count?.sub_tarefas || 0,
        total_recursos: tarefa._count?.recursos || 0,
        total_anexos: tarefa._count?.anexos || 0
      })),
      total_tarefas: plano._count?.tarefas || plano.tarefas?.length || 0,
      tarefas_ativas: plano.tarefas?.filter((t: any) => t.ativo)?.length || 0,
      tempo_total_estimado: plano.tarefas?.reduce((acc: number, t: any) => acc + t.tempo_estimado, 0) || 0,
      criticidade_media: plano.tarefas?.length > 0 ? 
        Math.round(plano.tarefas.reduce((acc: number, t: any) => acc + t.criticidade, 0) / plano.tarefas.length * 10) / 10 : 
        undefined,
    };
  }

  private async gerarNovaTag(equipamentoId: string, prefixo: string): Promise<string> {
    // Usar função do banco para gerar TAG única
    const result = await this.prisma.$queryRaw<[{gerar_tag_tarefa: string}]>`
      SELECT gerar_tag_tarefa(
        (SELECT pm.id FROM planos_manutencao pm WHERE pm.equipamento_id = ${equipamentoId} AND pm.deleted_at IS NULL LIMIT 1),
        ${prefixo}
      ) as gerar_tag_tarefa
    `;

    return result[0]?.gerar_tag_tarefa || `${prefixo}-${Date.now()}`;
  }

  private contarPorStatus(stats: any[], status: StatusPlano): number {
    return stats.find(s => s.status === status)?._count || 0;
  }

  private contarPorTipo(distribuicao: any[], tipo: string): number {
    return distribuicao.find(d => d.tipo_manutencao === tipo)?._count || 0;
  }
}