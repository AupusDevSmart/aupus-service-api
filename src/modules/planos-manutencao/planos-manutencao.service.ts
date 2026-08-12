// src/modules/planos-manutencao/planos-manutencao.service.ts
import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService, PermissionScopeService, ScopedUser } from '@aupus/api-shared';
import {
  CreatePlanoManutencaoDto,
  UpdatePlanoManutencaoDto,
  QueryPlanosDto,
  QueryPlanosPorPlantaDto,
  VincularPlanoDto,
  VincularPlanoResponseDto,
  PreviaDesvinculoDto,
  PlanoManutencaoResponseDto,
  PlanoResumoDto,
  DashboardPlanosDto
} from './dto';
import { Prisma } from '@aupus/api-shared';
import { PropagacaoPlanosService } from './propagacao-planos.service';

@Injectable()
export class PlanosManutencaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: PermissionScopeService,
    private readonly propagacaoService: PropagacaoPlanosService,
  ) {}

  /** Andamento das propagacoes de um template. */
  async consultarPropagacoes(planoId: string) {
    return this.propagacaoService.consultar(planoId);
  }

  /** Fragmento `where` para planos restringindo ao escopo via equipamento.unidade.planta_id. */
  private async scopeFragment(user?: ScopedUser): Promise<Prisma.planos_manutencaoWhereInput | undefined> {
    const scope = await this.scopeService.getScope(user);
    if (!this.scopeService.isScoped(scope)) return undefined;
    if (scope.length === 0) return { id: '__NEVER__' };
    return { equipamento: { unidade: { planta_id: { in: scope } } } };
  }

  /**
   * Template nao tem equipamento, logo nao tem planta, logo nao tem escopo:
   * pertence a uma categoria e vale para toda a base. O escopo por planta e
   * verificado no vinculo, onde o equipamento existe.
   */
  private readonly SOMENTE_TEMPLATES: Prisma.planos_manutencaoWhereInput = {
    plano_origem_id: null,
  };

  async criar(createDto: CreatePlanoManutencaoDto, user?: ScopedUser): Promise<PlanoManutencaoResponseDto> {
    await this.verificarCategoriaExiste(createDto.categoria_id);

    const dados = {
      ...createDto,
      categoria_id: createDto.categoria_id.trim(),
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

    // Somente templates: as copias por equipamento nascem do vinculo e
    // apareceriam duplicadas aqui, uma por equipamento vinculado.
    const where: Prisma.planos_manutencaoWhereInput = {
      deleted_at: null,
      ...this.SOMENTE_TEMPLATES,
      ...this.construirFiltros(filters, search),
    };

    // Construir ordenação
    const orderBy = this.construirOrdenacao(sort_by, sort_order);

    const [planos, total] = await Promise.all([
      this.prisma.planos_manutencao.findMany({
        where,
        include: {
          equipamento: true,
          categoria: { select: { id: true, nome: true } },
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
              },
              // Quantos equipamentos usam este template hoje
              copias: {
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
    const existente = await this.verificarPlanoExiste(id);

    // Copia (tem origem) segue amarrada a um equipamento e mantem o escopo por
    // planta. Template e global por categoria e nao tem escopo.
    if (user && (existente as any).equipamento_id) {
      await this.scopeService.assertEntityInScope('equipamento', (existente as any).equipamento_id, user);
    }

    if (updateDto.categoria_id) {
      await this.verificarCategoriaExiste(updateDto.categoria_id);
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

    // Enfileirado DEPOIS do update: o worker le o template do banco, entao
    // enfileirar antes abre janela para ele propagar o conteudo antigo.
    if (!(existente as any).plano_origem_id) {
      await this.propagacaoService.enfileirar(id);
    }

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
        }
      }
    });

    if (!plano) {
      throw new NotFoundException('Plano de manutenção não encontrado');
    }

    // Calcular estatísticas
    const totalTarefas = plano.tarefas.length;
    const tarefasAtivas = plano.tarefas.filter(t => t.ativo).length;

    const resumo: PlanoResumoDto = {
      id: plano.id,
      nome: plano.nome,
      versao: plano.versao,
      equipamento_nome: plano.equipamento?.nome,
      equipamento_tipo: plano.equipamento?.tipo_equipamento,
      planta_nome: plano.equipamento?.unidade?.planta?.nome,
      total_tarefas: totalTarefas,
      tarefas_ativas: tarefasAtivas,
      created_at: plano.created_at,
      updated_at: plano.updated_at
    };

    return resumo;
  }

  async obterDashboard(): Promise<DashboardPlanosDto> {
    const [totalPlanos, statsTarefas] = await Promise.all([
      // Total de planos
      this.prisma.planos_manutencao.count({
        where: { deleted_at: null }
      }),

      // Stats das tarefas
      this.prisma.tarefas.aggregate({
        where: { deleted_at: null },
        _count: true
      })
    ]);

    const equipamentosComPlano = await this.prisma.planos_manutencao.groupBy({
      by: ['equipamento_id'],
      where: { deleted_at: null }
    }).then(result => result.length);

    return {
      total_planos: totalPlanos,
      equipamentos_com_plano: equipamentosComPlano,
      total_tarefas_todos_planos: statsTarefas._count,
      media_tarefas_por_plano: totalPlanos > 0 ? Math.round(statsTarefas._count / totalPlanos) : 0
    };
  }

  // ==========================================
  // Vinculo equipamento <-> plano (copia do template)
  // ==========================================

  /**
   * Lista os templates aplicaveis a um equipamento: os da categoria do modelo
   * dele. Equipamento sem modelo nao tem categoria e portanto nao tem template.
   */
  /**
   * Os templates de uma categoria, direto.
   *
   * No cadastro de equipamento ainda nao ha id para consultar por equipamento,
   * mas a categoria ja foi escolhida no formulario — e e ela que decide quais
   * planos servem.
   */
  async listarTemplatesDaCategoria(categoriaId: string): Promise<PlanoManutencaoResponseDto[]> {
    const id = categoriaId?.trim();
    if (!id) return [];
    return this.buscarTemplatesPorCategoria(id);
  }

  private async buscarTemplatesPorCategoria(categoriaId: string): Promise<PlanoManutencaoResponseDto[]> {
    const planos = await this.prisma.planos_manutencao.findMany({
      where: { deleted_at: null, ...this.SOMENTE_TEMPLATES, categoria_id: categoriaId },
      include: {
        categoria: { select: { id: true, nome: true } },
        _count: { select: { tarefas: { where: { deleted_at: null } } } }
      },
      orderBy: [{ nome: 'asc' }, { id: 'asc' }]
    });

    return planos.map(plano => this.mapearParaResponse(plano));
  }

  async listarTemplatesDoEquipamento(equipamentoId: string, user?: ScopedUser): Promise<PlanoManutencaoResponseDto[]> {
    const id = equipamentoId.trim();
    if (user) await this.scopeService.assertEntityInScope('equipamento', id, user);

    const categoriaId = await this.categoriaDoEquipamento(id);
    if (!categoriaId) return [];

    return this.buscarTemplatesPorCategoria(categoriaId);
  }

  /** O que se perde ao trocar ou desvincular o plano do equipamento. */
  async previaDesvinculo(equipamentoId: string, user?: ScopedUser): Promise<PreviaDesvinculoDto> {
    const id = equipamentoId.trim();
    if (user) await this.scopeService.assertEntityInScope('equipamento', id, user);

    const copia = await this.prisma.planos_manutencao.findFirst({
      where: { equipamento_id: id, deleted_at: null },
      include: { tarefas: { where: { deleted_at: null }, select: { origem_status: true } } }
    });

    if (!copia) {
      return { possui_plano: false, total_tarefas: 0, tarefas_proprias: 0, tarefas_customizadas: 0 };
    }

    return {
      possui_plano: true,
      total_tarefas: copia.tarefas.length,
      tarefas_proprias: copia.tarefas.filter(t => t.origem_status === 'PROPRIA').length,
      tarefas_customizadas: copia.tarefas.filter(t => t.origem_status === 'CUSTOMIZADA').length
    };
  }

  async vincularEquipamento(dto: VincularPlanoDto, user?: ScopedUser): Promise<VincularPlanoResponseDto> {
    const equipamentoId = dto.equipamento_id.trim();
    const planoId = dto.plano_id.trim();

    if (user) await this.scopeService.assertEntityInScope('equipamento', equipamentoId, user);

    const equipamento = await this.prisma.equipamentos.findFirst({
      where: { id: equipamentoId, deleted_at: null },
      select: {
        id: true,
        nome: true,
        classificacao: true,
        unidade: { select: { planta_id: true } }
      }
    });

    if (!equipamento) {
      throw new NotFoundException('Equipamento não encontrado');
    }

    if (equipamento.classificacao !== 'UC') {
      throw new BadRequestException(
        'Somente equipamentos UC recebem plano de manutenção. Componentes UAR são cobertos pelo plano do equipamento pai.'
      );
    }

    const template = await this.prisma.planos_manutencao.findFirst({
      where: { id: planoId, deleted_at: null },
      include: {
        tarefas: {
          where: { deleted_at: null },
          orderBy: { ordem: 'asc' }
        }
      }
    });

    if (!template) {
      throw new NotFoundException('Plano de manutenção não encontrado');
    }

    if (template.plano_origem_id) {
      throw new BadRequestException('Só é possível vincular um plano template, não uma cópia de outro equipamento');
    }

    const categoriaEquipamento = await this.categoriaDoEquipamento(equipamentoId);
    if (!categoriaEquipamento) {
      throw new BadRequestException(
        'Equipamento sem modelo definido: não há categoria para casar com o plano'
      );
    }

    if (categoriaEquipamento !== template.categoria_id?.trim()) {
      throw new BadRequestException('O plano pertence a outra categoria de equipamento');
    }

    const previa = await this.previaDesvinculo(equipamentoId);

    const resultado = await this.prisma.$transaction(async (tx) => {
      // Substituicao: remove a copia anterior inteira — nao acumular plano
      // orfao no banco. Seguro porque a OS congela nome, criticidade,
      // periodicidade e instrucao no momento da geracao: perder a tarefa nao
      // apaga mais o registro do que foi pedido.
      if (previa.possui_plano) {
        const copiaAnterior = await tx.planos_manutencao.findFirst({
          where: { equipamento_id: equipamentoId, deleted_at: null },
          select: { id: true }
        });

        if (copiaAnterior) {
          await this.removerCopia(tx, copiaAnterior.id);
        }
      }

      const copia = await tx.planos_manutencao.create({
        data: {
          nome: template.nome,
          descricao: template.descricao,
          versao: template.versao,
          equipamento_id: equipamentoId,
          plano_origem_id: template.id,
          ...(dto.criado_por && { criado_por: dto.criado_por })
        }
      });

      let copiadas = 0;
      for (const tarefaTemplate of template.tarefas) {
        const tag = await this.gerarNovaTag(equipamentoId, 'TRF');

        await tx.tarefas.create({
          data: {
            plano_manutencao_id: copia.id,
            equipamento_id: equipamentoId,
            planta_id: equipamento.unidade?.planta_id ?? null,
            tarefa_origem_id: tarefaTemplate.id,
            origem_status: 'HERDADA',
            data_ancora: new Date(),
            tag,
            nome: tarefaTemplate.nome,
            frequencia: tarefaTemplate.frequencia,
            frequencia_personalizada: tarefaTemplate.frequencia_personalizada,
            criticidade: tarefaTemplate.criticidade,
            ordem: tarefaTemplate.ordem,
            instrucao_id: tarefaTemplate.instrucao_id,
            ...(dto.criado_por && { criado_por: dto.criado_por })
          }
        });
        copiadas++;
      }

      return { planoId: copia.id, copiadas };
    }, { maxWait: 15000, timeout: 15000 });

    return {
      plano_id: resultado.planoId,
      tarefas_copiadas: resultado.copiadas,
      substituiu_vinculo_anterior: previa.possui_plano,
      tarefas_proprias_descartadas: previa.tarefas_proprias,
      tarefas_customizadas_descartadas: previa.tarefas_customizadas
    };
  }

  async desvincularEquipamento(equipamentoId: string, user?: ScopedUser): Promise<PreviaDesvinculoDto> {
    const id = equipamentoId.trim();
    if (user) await this.scopeService.assertEntityInScope('equipamento', id, user);

    const previa = await this.previaDesvinculo(id);
    if (!previa.possui_plano) {
      throw new NotFoundException('Este equipamento não possui plano de manutenção vinculado');
    }

    const copia = await this.prisma.planos_manutencao.findFirst({
      where: { equipamento_id: id, deleted_at: null },
      select: { id: true }
    });

    await this.prisma.$transaction(async (tx) => {
      await this.removerCopia(tx, copia!.id);
    });

    return previa;
  }

  /**
   * Apaga de vez a copia de um equipamento e suas tarefas.
   *
   * Hard delete e seguro porque a OS congela o conteudo pedido (nome,
   * criticidade, periodicidade e instrucao) no momento em que e gerada:
   * `tarefas_os.tarefa_id` fica so como rastro, e perder a tarefa nao apaga
   * mais o registro do que foi pedido. Antes do congelamento isso destruiria
   * historico em silencio.
   */
  private async removerCopia(tx: any, planoId: string): Promise<void> {
    // Os vinculos com OS/programacao ficam com tarefa_id nulo (a FK e opcional),
    // preservando o snapshot ja gravado neles.
    await tx.tarefas.deleteMany({ where: { plano_manutencao_id: planoId } });
    await tx.planos_manutencao.delete({ where: { id: planoId } });
  }

  /** Categoria do modelo (tipo_equipamento) do equipamento, ou null. */
  private async categoriaDoEquipamento(equipamentoId: string): Promise<string | null> {
    const equipamento = await this.prisma.equipamentos.findFirst({
      where: { id: equipamentoId.trim(), deleted_at: null },
      select: { tipo_equipamento_id: true }
    });

    const tipoId = equipamento?.tipo_equipamento_id?.trim();
    if (!tipoId) return null;

    const modelo = await this.prisma.tipos_equipamentos.findUnique({
      where: { id: tipoId },
      select: { categoria_id: true }
    });

    return modelo?.categoria_id?.trim() ?? null;
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

  private async verificarPlanoExiste(id: string) {
    const plano = await this.prisma.planos_manutencao.findFirst({
      where: {
        id,
        deleted_at: null
      }
    });

    if (!plano) {
      throw new NotFoundException('Plano de manutenção não encontrado');
    }

    return plano;
  }

  private async verificarCategoriaExiste(categoriaId: string): Promise<void> {
    const categoria = await this.prisma.categorias_equipamentos.findFirst({
      where: { id: categoriaId.trim() }
    });

    if (!categoria) {
      throw new NotFoundException('Categoria de equipamento não encontrada');
    }
  }

  private includeRelacionamentos(): Prisma.planos_manutencaoInclude {
    return {
      categoria: {
        select: {
          id: true,
          nome: true
        }
      },
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

    if (filters.categoria_id) {
      where.categoria_id = filters.categoria_id.trim();
    }

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
      categoria_id: plano.categoria_id?.trim() || plano.categoria_id,
      plano_origem_id: plano.plano_origem_id?.trim() || plano.plano_origem_id,
      categoria: plano.categoria,
      is_template: !plano.plano_origem_id,
      total_equipamentos_vinculados: plano._count?.copias ?? 0,
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
        ordem: tarefa.ordem,
        criticidade: tarefa.criticidade,
        instrucao_id: tarefa.instrucao_id,
      })),
      total_tarefas: plano._count?.tarefas || plano.tarefas?.length || 0,
      tarefas_ativas: plano.tarefas?.filter((t: any) => t.ativo)?.length || 0,
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