// src/modules/planos-manutencao/planos-manutencao.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService, PermissionScopeService, ScopedUser } from '@aupus/api-shared';
import {
  CreatePlanoManutencaoDto,
  UpdatePlanoManutencaoDto,
  QueryPlanosDto,
  QueryPlanosPorPlantaDto,
  DuplicarPlanoDto,
  ClonarPlanoLoteDto,
  ClonarPlanoLoteResponseDto,
  PlanoManutencaoResponseDto,
  PlanoResumoDto,
  DashboardPlanosDto
} from './dto';
import { Prisma } from '@aupus/api-shared';

@Injectable()
export class PlanosManutencaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: PermissionScopeService,
  ) {}

  /** Fragmento `where` para planos restringindo ao escopo via equipamento.unidade.planta_id. */
  private async scopeFragment(user?: ScopedUser): Promise<Prisma.planos_manutencaoWhereInput | undefined> {
    const scope = await this.scopeService.getScope(user);
    if (!this.scopeService.isScoped(scope)) return undefined;
    if (scope.length === 0) return { id: '__NEVER__' };
    return { equipamento: { unidade: { planta_id: { in: scope } } } };
  }

  async criar(createDto: CreatePlanoManutencaoDto, user?: ScopedUser): Promise<PlanoManutencaoResponseDto> {
    // Verificar se equipamento existe e esta no escopo
    await this.verificarEquipamentoExiste(createDto.equipamento_id);
    if (user) await this.scopeService.assertEntityInScope('equipamento', createDto.equipamento_id, user);
    
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

    const dados = {
      ...createDto,
      versao: createDto.versao || '1.0',
    };

    const plano = await this.prisma.planos_manutencao.create({
      data: dados,
      include: this.includeRelacionamentos()
    });

    return this.mapearParaResponse(plano);
  }

  async listar(queryDto: QueryPlanosDto, user?: ScopedUser): Promise<{
    data: PlanoManutencaoResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page, limit, search, sort_by, sort_order, ...filters } = queryDto;
    const skip = (page - 1) * limit;

    // Construir filtros
    const scopeFragment = await this.scopeFragment(user);
    const where: Prisma.planos_manutencaoWhereInput = {
      deleted_at: null,
      ...this.construirFiltros(filters, search),
      ...(scopeFragment && { AND: [scopeFragment] }),
    };

    // Construir ordenação
    const orderBy = this.construirOrdenacao(sort_by, sort_order);

    const [planos, total] = await Promise.all([
      this.prisma.planos_manutencao.findMany({
        where,
        include: {
          equipamento: true,
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

  async buscarPorId(id: string, incluirTarefas = false, user?: ScopedUser): Promise<PlanoManutencaoResponseDto> {
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

    // Scope RBAC: 403 se planta do equipamento nao esta no escopo
    if (user) await this.scopeService.assertEntityInScope('equipamento', (plano as any).equipamento_id, user);

    return this.mapearParaResponse(plano);
  }

  async buscarPorEquipamento(equipamentoId: string, user?: ScopedUser): Promise<PlanoManutencaoResponseDto> {
    await this.verificarEquipamentoExiste(equipamentoId);
    if (user) await this.scopeService.assertEntityInScope('equipamento', equipamentoId, user);

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

  async buscarPorPlanta(plantaId: string, queryDto: QueryPlanosPorPlantaDto, user?: ScopedUser): Promise<{
    data: PlanoManutencaoResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    // Verificar se planta existe e esta no escopo
    await this.verificarPlantaExiste(plantaId);
    if (user) await this.scopeService.assertPlantaInScope(plantaId, user);

    const { page, limit, incluir_tarefas } = queryDto;
    const skip = (page - 1) * limit;

    // Construir filtros - JOIN entre planos_manutencao e equipamentos através de unidade
    const where: Prisma.planos_manutencaoWhereInput = {
      deleted_at: null,
      equipamento: {
        deleted_at: null,
        unidade: {
          planta_id: plantaId
        }
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
          unidade: {
            select: {
              planta: {
                select: {
                  id: true,
                  nome: true,
                  localizacao: true
                }
              }
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

  async buscarPorUnidade(unidadeId: string, queryDto: QueryPlanosPorPlantaDto, user?: ScopedUser): Promise<{
    data: PlanoManutencaoResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    // Verificar se unidade existe e esta no escopo
    await this.verificarUnidadeExiste(unidadeId);
    if (user) await this.scopeService.assertEntityInScope('unidade', unidadeId, user);

    const { page, limit, incluir_tarefas } = queryDto;
    const skip = (page - 1) * limit;

    // Construir filtros - JOIN entre planos_manutencao e equipamentos através de unidade_id
    const where: Prisma.planos_manutencaoWhereInput = {
      deleted_at: null,
      equipamento: {
        deleted_at: null,
        unidade_id: unidadeId
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
          unidade: {
            select: {
              id: true,
              nome: true,
              planta: {
                select: {
                  id: true,
                  nome: true,
                  localizacao: true
                }
              }
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

  async atualizar(id: string, updateDto: UpdatePlanoManutencaoDto, user?: ScopedUser): Promise<PlanoManutencaoResponseDto> {
    if (user) {
      const existing = await this.prisma.planos_manutencao.findFirst({
        where: { id, deleted_at: null },
        select: { equipamento_id: true },
      });
      if (existing) await this.scopeService.assertEntityInScope('equipamento', existing.equipamento_id, user);
    }
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

    const dadosAtualizacao: any = {
      ...updateDto,
      updated_at: new Date()
    };

    const plano = await this.prisma.planos_manutencao.update({
      where: { id },
      data: dadosAtualizacao,
      include: this.includeRelacionamentos()
    });

    return this.mapearParaResponse(plano);
  }

  async remover(id: string, user?: ScopedUser): Promise<void> {
    if (user) {
      const existing = await this.prisma.planos_manutencao.findFirst({
        where: { id, deleted_at: null },
        select: { equipamento_id: true },
      });
      if (existing) await this.scopeService.assertEntityInScope('equipamento', existing.equipamento_id, user);
    }
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

  async duplicar(id: string, duplicarDto: DuplicarPlanoDto, user?: ScopedUser): Promise<PlanoManutencaoResponseDto> {
    if (user) {
      const existing = await this.prisma.planos_manutencao.findFirst({
        where: { id, deleted_at: null },
        select: { equipamento_id: true },
      });
      if (existing) await this.scopeService.assertEntityInScope('equipamento', existing.equipamento_id, user);
      if (duplicarDto.equipamento_destino_id) {
        await this.scopeService.assertEntityInScope('equipamento', duplicarDto.equipamento_destino_id, user);
      }
    }
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
      `${planoOriginal.nome} - ${equipamentoDestino?.nome || 'Cópia'}`;

    // Duplicar plano com todas as tarefas
    const planoDuplicado = await this.prisma.$transaction(async (tx) => {
      // Criar novo plano - com conversão de datas
      const novoPlano = await tx.planos_manutencao.create({
        data: {
          equipamento_id: duplicarDto.equipamento_destino_id,
          nome: novoNome,
          descricao: planoOriginal.descricao,
          versao: '1.0', // Reset versão
          // Apenas incluir criado_por se for fornecido
          ...(duplicarDto.criado_por && { criado_por: duplicarDto.criado_por })
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
            // Apenas incluir criado_por se for fornecido
            ...(duplicarDto.criado_por && { criado_por: duplicarDto.criado_por })
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

  /**
   * Clona um plano de manutenção para múltiplos equipamentos
   * Útil para replicar planos similares para vários equipamentos de uma vez
   */
  async clonarParaVariosEquipamentos(
    planoOrigemId: string,
    dto: ClonarPlanoLoteDto,
  ): Promise<ClonarPlanoLoteResponseDto> {
    // Verificar se plano origem existe
    const planoOrigem = await this.prisma.planos_manutencao.findFirst({
      where: {
        id: planoOrigemId,
        deleted_at: null
      },
      include: {
        tarefas: {
          where: { deleted_at: null },
          select: { id: true }
        }
      }
    });

    if (!planoOrigem) {
      throw new NotFoundException('Plano de manutenção original não encontrado');
    }

    const resultado: ClonarPlanoLoteResponseDto = {
      planos_criados: 0,
      planos_com_erro: 0,
      detalhes: []
    };

    // Processar cada equipamento destino
    for (const equipamentoId of dto.equipamentos_destino_ids) {
      try {
        // Buscar equipamento para pegar nome
        const equipamento = await this.prisma.equipamentos.findFirst({
          where: {
            id: equipamentoId,
            deleted_at: null
          },
          select: { nome: true }
        });

        if (!equipamento) {
          resultado.planos_com_erro++;
          resultado.detalhes.push({
            equipamento_id: equipamentoId,
            equipamento_nome: 'Desconhecido',
            sucesso: false,
            erro: 'Equipamento não encontrado'
          });
          continue;
        }

        // Verificar se equipamento já tem plano
        const planoExistente = await this.prisma.planos_manutencao.findFirst({
          where: {
            equipamento_id: equipamentoId,
            deleted_at: null
          }
        });

        if (planoExistente) {
          resultado.planos_com_erro++;
          resultado.detalhes.push({
            equipamento_id: equipamentoId,
            equipamento_nome: equipamento.nome,
            sucesso: false,
            erro: 'Equipamento já possui um plano de manutenção'
          });
          continue;
        }

        // Gerar novo nome do plano
        const novoNome = dto.manter_nome_original
          ? planoOrigem.nome
          : `${planoOrigem.nome} - ${equipamento.nome}`;

        // Usar método de duplicação existente
        const novoPlano = await this.duplicar(planoOrigemId, {
          equipamento_destino_id: equipamentoId,
          novo_nome: novoNome,
          novo_prefixo_tag: dto.novo_prefixo_tag,
          criado_por: dto.criado_por
        });

        resultado.planos_criados++;
        resultado.detalhes.push({
          equipamento_id: equipamentoId,
          equipamento_nome: equipamento.nome,
          sucesso: true,
          plano_id: novoPlano.id,
          plano_nome: novoPlano.nome,
          total_tarefas: novoPlano.total_tarefas || 0
        });

      } catch (error) {
        resultado.planos_com_erro++;
        resultado.detalhes.push({
          equipamento_id: equipamentoId,
          equipamento_nome: 'Erro ao processar',
          sucesso: false,
          erro: error.message || 'Erro desconhecido'
        });
      }
    }

    return resultado;
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
            unidade: {
              select: {
                planta: {
                  select: {
                    id: true,
                    nome: true
                  }
                }
              }
            }
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
      equipamento_nome: plano.equipamento?.nome,
      equipamento_tipo: plano.equipamento?.tipo_equipamento,
      planta_nome: plano.equipamento?.unidade?.planta?.nome,
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
    const [totalPlanos, statsTarefas, distribuicao] = await Promise.all([
      // Total de planos
      this.prisma.planos_manutencao.count({
        where: { deleted_at: null }
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
          unidade: {
            select: {
              id: true,
              nome: true,
              planta: {
                select: {
                  id: true,
                  nome: true,
                  localizacao: true
                }
              }
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

    // Handle planta_id and unidade_id filters - usando equipamento_id diretamente
    // ao invés de relação (para evitar problemas com relações opcionais)
    if (filters.planta_id || filters.unidade_id) {
      // Precisamos fazer uma subquery ou filtrar depois
      // Por enquanto, vamos deixar sem filtrar por planta/unidade no WHERE
      // e filtrar na aplicação se necessário
    }

    if (search) {
      where.OR = [
        { nome: { contains: search, mode: 'insensitive' } },
        { descricao: { contains: search, mode: 'insensitive' } }
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
        // Não podemos ordenar por relação opcional, usar equipamento_id
        orderBy.equipamento_id = sortOrder;
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
    // Gerar TAG única sem depender de função do banco
    // Buscar plano do equipamento
    const plano = await this.prisma.planos_manutencao.findFirst({
      where: {
        equipamento_id: equipamentoId,
        deleted_at: null
      },
      include: {
        tarefas: {
          where: { deleted_at: null },
          select: { tag: true }
        }
      }
    });

    if (!plano) {
      // Se não há plano ainda (caso raro durante criação), usar timestamp
      return `${prefixo}-${Date.now()}`;
    }

    // Contar tarefas existentes e gerar próximo número
    const totalTarefas = plano.tarefas.length;
    const proximoNumero = totalTarefas + 1;

    // Gerar TAG no formato: PREFIXO-001, PREFIXO-002, etc.
    const numeroFormatado = proximoNumero.toString().padStart(3, '0');
    const novaTag = `${prefixo}-${numeroFormatado}`;

    // Verificar se TAG já existe (improvável, mas garantir unicidade)
    const tagExiste = plano.tarefas.some(t => t.tag === novaTag);
    if (tagExiste) {
      // Se existir, usar timestamp como fallback
      return `${prefixo}-${Date.now()}`;
    }

    return novaTag;
  }

  private contarPorTipo(distribuicao: any[], tipo: string): number {
    return distribuicao.find(d => d.tipo_manutencao === tipo)?._count || 0;
  }
}