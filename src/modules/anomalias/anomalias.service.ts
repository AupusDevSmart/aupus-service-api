// src/anomalias/anomalias.service.ts
import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService, PermissionScopeService, PlantaScope } from '@aupus/api-shared';
import { CreateAnomaliaDto, UpdateAnomaliaDto, AnomaliaFiltersDto, AnomaliaStatsDto } from './dto';
import { Prisma } from '@aupus/api-shared';

type UserCtx = { id: string; role?: string | null } | undefined;

@Injectable()
export class AnomaliasService {
  private readonly logger = new Logger(AnomaliasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: PermissionScopeService,
  ) {}

  private async getScope(user?: UserCtx): Promise<PlantaScope> {
    if (!user?.id) {
      this.logger.warn(`[SCOPE] user sem id, sem filtro`);
      return null;
    }
    const scope = await this.scopeService.getPlantasDoUsuario(user.id, user.role);
    this.logger.log(
      `[SCOPE] userId=${user.id} role=${user.role ?? 'null'} -> ${scope === null ? 'SEM FILTRO (admin-like)' : `[${scope.length}] ${JSON.stringify(scope)}`}`,
    );
    return scope;
  }

  /**
   * Retorna filtro where para anomalias restringindo ao escopo de plantas.
   * Combina planta_id direto e equipamento.unidade.planta_id.
   */
  private scopeWhere(scope: PlantaScope): Prisma.anomaliasWhereInput | undefined {
    if (!this.scopeService.isScoped(scope)) return undefined;
    if (scope.length === 0) {
      // Usuario sem plantas vinculadas: nao ve nada
      return { id: '__NEVER__' };
    }
    return {
      OR: [
        { planta_id: { in: scope } },
        { equipamento: { unidade: { planta_id: { in: scope } } } },
      ],
    };
  }

  async create(createAnomaliaDto: CreateAnomaliaDto, user?: UserCtx) {
    const { localizacao, anexos, instrucoes_ids, ...anomaliaData } = createAnomaliaDto;
    const userId = user?.id;

    // Validar escopo: se usuario tem scope, a planta da anomalia deve estar nele
    const scope = await this.getScope(user);
    if (this.scopeService.isScoped(scope)) {
      const plantaDaAnomalia = await this.resolverPlantaIdDoInput(createAnomaliaDto);
      if (!plantaDaAnomalia || !scope.includes(plantaDaAnomalia)) {
        throw new ForbiddenException('Voce nao pode criar anomalia para uma planta fora do seu escopo');
      }
    }

    const data: Prisma.anomaliasCreateInput = {
      ...anomaliaData,
      local: localizacao.local,
      ativo: localizacao.ativo,
      status: 'REGISTRADA',
      criado_por: userId ? `Usuário ${userId}` : 'Sistema',
      ...(localizacao.equipamentoId && {
        equipamento: { connect: { id: localizacao.equipamentoId } }
      }),
      ...(userId && {
        usuario: { connect: { id: userId } }
      }),
      historico: {
        create: {
          acao: 'Anomalia criada',
          usuario: userId ? `Usuário ${userId}` : 'Sistema',
          observacoes: 'Anomalia registrada no sistema'
        }
      }
    };

    const anomalia = await this.prisma.anomalias.create({
      data,
      include: {
        planta: true,
        equipamento: {
          include: {
            unidade: {
              select: {
                id: true,
                nome: true,
                planta_id: true,
                planta: { select: { id: true, nome: true } }
              }
            }
          }
        },
        usuario: true,
        historico: {
          orderBy: { created_at: 'desc' }
        },
        anomalias_instrucoes: {
          include: {
            instrucao: {
              select: { id: true, tag: true, nome: true, status: true, ativo: true }
            }
          },
          orderBy: { created_at: 'desc' }
        }
      }
    });

    // Associar instruções se fornecidas
    if (instrucoes_ids && instrucoes_ids.length > 0) {
      await this.associarInstrucoes(anomalia.id, instrucoes_ids);
      return this.findOne(anomalia.id);
    }

    return anomalia;
  }

  async findAll(filters: AnomaliaFiltersDto, user?: UserCtx) {
    const { search, periodo, status, prioridade, origem, planta, unidade, page = 1, limit = 10 } = filters;
    const scope = await this.getScope(user);
    const scopeFilter = this.scopeWhere(scope);

    const where: Prisma.anomaliasWhereInput = {
      deleted_at: null,
      ...(scopeFilter && { AND: [scopeFilter] }),
      ...(search && {
        OR: [
          { descricao: { contains: search, mode: 'insensitive' } },
          { local: { contains: search, mode: 'insensitive' } },
          { ativo: { contains: search, mode: 'insensitive' } },
          { criado_por: { contains: search, mode: 'insensitive' } },
          { id: { contains: search, mode: 'insensitive' } }
        ]
      }),
      ...(status && { status: status as any }),
      ...(prioridade && { prioridade: prioridade as any }),
      ...(origem && { origem: origem as any }),
      // ✅ CORRIGIDO: Filtrar por planta através da relação equipamento → unidade → planta
      ...(planta && !unidade && {
        equipamento: {
          unidade: {
            planta_id: planta
          }
        }
      }),
      // ✅ Filtrar por unidade (já filtra por planta implicitamente)
      ...(unidade && {
        equipamento: {
          unidade_id: unidade
        }
      }),
      ...(periodo && this.buildPeriodoFilter(periodo))
    };

    this.logger.log(`[findAll] where=${JSON.stringify(where)}`);
    const [data, total] = await Promise.all([
      this.prisma.anomalias.findMany({
        where,
        include: {
          planta: true,
          equipamento: {
          include: {
            unidade: {
              select: {
                id: true,
                nome: true,
                planta_id: true,
                planta: { select: { id: true, nome: true } }
              }
            }
          }
        },
          usuario: true,
          anomalias_instrucoes: {
            include: {
              instrucao: {
                select: { id: true, tag: true, nome: true, status: true, ativo: true }
              }
            }
          }
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      this.prisma.anomalias.count({ where })
    ]);

    this.logger.log(`[findAll] data.length=${data.length} total=${total}`);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async findOne(id: string, user?: UserCtx) {
    const scope = await this.getScope(user);
    const scopeFilter = this.scopeWhere(scope);
    const anomalia = await this.prisma.anomalias.findFirst({
      where: { id, deleted_at: null, ...(scopeFilter && { AND: [scopeFilter] }) },
      include: {
        planta: true,
        equipamento: {
          include: {
            unidade: {
              select: {
                id: true,
                nome: true,
                planta_id: true,
                planta: { select: { id: true, nome: true } }
              }
            }
          }
        },
        usuario: true,
        historico: {
          orderBy: { created_at: 'desc' }
        },
        anomalias_instrucoes: {
          include: {
            instrucao: {
              select: { id: true, tag: true, nome: true, status: true, ativo: true }
            }
          },
          orderBy: { created_at: 'desc' }
        }
      }
    });

    if (!anomalia) {
      throw new NotFoundException('Anomalia não encontrada');
    }

    return anomalia;
  }

  async update(id: string, updateAnomaliaDto: UpdateAnomaliaDto, user?: UserCtx) {
    const anomalia = await this.findOne(id, user);
    const userId = user?.id;

    if (anomalia.status !== 'REGISTRADA') {
      throw new ConflictException('Apenas anomalias registradas podem ser editadas');
    }

    const { localizacao, anexos, instrucoes_ids, ...updateData } = updateAnomaliaDto;

    const data: Prisma.anomaliasUpdateInput = {
      ...updateData,
      ...(localizacao && {
        local: localizacao.local,
        ativo: localizacao.ativo,
        ...(localizacao.equipamentoId && {
          equipamento: { connect: { id: localizacao.equipamentoId } }
        })
      }),
      historico: {
        create: {
          acao: 'Anomalia atualizada',
          usuario: userId ? `Usuário ${userId}` : 'Sistema',
          observacoes: 'Dados da anomalia foram modificados',
          status_anterior: anomalia.status,
          status_novo: anomalia.status
        }
      }
    };

    await this.prisma.anomalias.update({
      where: { id },
      data,
    });

    // Atualizar instruções vinculadas se fornecidas
    if (instrucoes_ids !== undefined) {
      await this.prisma.anomalias_instrucoes.deleteMany({
        where: { anomalia_id: id },
      });
      if (instrucoes_ids && instrucoes_ids.length > 0) {
        await this.associarInstrucoes(id, instrucoes_ids);
      }
    }

    return this.findOne(id);
  }

  async remove(id: string, user?: UserCtx) {
    const anomalia = await this.findOne(id, user);
    const userId = user?.id;

    if (anomalia.status !== 'REGISTRADA') {
      throw new ConflictException('Apenas anomalias registradas podem ser excluídas');
    }

    return this.prisma.anomalias.update({
      where: { id },
      data: {
        deleted_at: new Date(),
        historico: {
          create: {
            acao: 'Anomalia removida',
            usuario: userId ? `Usuário ${userId}` : 'Sistema',
            observacoes: 'Anomalia foi removida do sistema'
          }
        }
      }
    });
  }

  async getStats(user?: UserCtx, periodo?: string): Promise<AnomaliaStatsDto> {
    const scope = await this.getScope(user);
    const scopeFilter = this.scopeWhere(scope);
    const whereBase: any = { deleted_at: null, ...(scopeFilter && { AND: [scopeFilter] }) };

    if (periodo) {
      const now = new Date();
      let dataInicio: Date;
      switch (periodo) {
        case '7d': dataInicio = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
        case '30d': dataInicio = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
        case '90d': dataInicio = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); break;
        default: dataInicio = null;
      }
      if (dataInicio) {
        whereBase.created_at = { gte: dataInicio };
      }
    }

    const [total, registradas, programadas, finalizadas, criticas] = await Promise.all([
      this.prisma.anomalias.count({ where: whereBase }),
      this.prisma.anomalias.count({ where: { ...whereBase, status: 'REGISTRADA' } }),
      this.prisma.anomalias.count({ where: { ...whereBase, status: 'PROGRAMADA' } }),
      this.prisma.anomalias.count({ where: { ...whereBase, status: 'FINALIZADA' } }),
      this.prisma.anomalias.count({ where: { ...whereBase, prioridade: 'CRITICA' } }),
    ]);

    return { total, registradas, programadas, finalizadas, criticas };
  }

  async marcarComoProgramada(id: string, programacao_os_id?: string): Promise<void> {
    const anomalia = await this.findOne(id);

    await this.prisma.anomalias.update({
      where: { id },
      data: {
        status: 'PROGRAMADA',
      },
    });

    this.logger.log(`Anomalia ${id} marcada como programada`);
  }

  async marcarComoFinalizada(id: string): Promise<void> {
    await this.prisma.anomalias.update({
      where: { id },
      data: { status: 'FINALIZADA' },
    });

    this.logger.log(`Anomalia ${id} marcada como finalizada`);
  }

  async voltarParaRegistrada(id: string): Promise<void> {
    await this.prisma.anomalias.update({
      where: { id },
      data: {
        status: 'REGISTRADA',
      },
    });

    this.logger.log(`Anomalia ${id} voltou para registrada`);
  }

  /**
   * Resolve a planta_id de uma anomalia a partir do equipamentoId informado.
   * Retorna null se nao houver equipamento ou nao conseguir resolver a planta.
   */
  private async resolverPlantaIdDoInput(dto: CreateAnomaliaDto): Promise<string | null> {
    const equipamentoId = dto.localizacao?.equipamentoId;
    if (!equipamentoId) return null;
    const eq = await this.prisma.equipamentos.findUnique({
      where: { id: equipamentoId },
      select: { unidade: { select: { planta_id: true } } },
    });
    return eq?.unidade?.planta_id ?? null;
  }

  private buildPeriodoFilter(periodo: string): Prisma.anomaliasWhereInput {
    // Formato esperado: "Janeiro de 2025"
    const [mes, , ano] = periodo.split(' ');
    const meses: Record<string, number> = {
      'Janeiro': 0, 'Fevereiro': 1, 'Março': 2, 'Abril': 3,
      'Maio': 4, 'Junho': 5, 'Julho': 6, 'Agosto': 7,
      'Setembro': 8, 'Outubro': 9, 'Novembro': 10, 'Dezembro': 11
    };

    const mesIndex = meses[mes];
    if (mesIndex === undefined || !ano) return {};

    const startDate = new Date(parseInt(ano), mesIndex, 1);
    const endDate = new Date(parseInt(ano), mesIndex + 1, 0, 23, 59, 59);

    return {
      data: {
        gte: startDate,
        lte: endDate
      }
    };
  }

  async getPlantasSelect(user?: UserCtx) {
    const scope = await this.getScope(user);
    const where: Prisma.plantasWhereInput = { deleted_at: null };
    if (this.scopeService.isScoped(scope)) {
      where.id = { in: scope };
    }
    return this.prisma.plantas.findMany({
      where,
      select: {
        id: true,
        nome: true
      },
      orderBy: { nome: 'asc' }
    });
  }

  async getUnidadesSelect(user?: UserCtx, plantaId?: string) {
    const scope = await this.getScope(user);
    const where: any = { deleted_at: null };

    if (plantaId) {
      where.planta_id = plantaId;
    }
    if (this.scopeService.isScoped(scope)) {
      where.planta_id = plantaId ? plantaId : { in: scope };
      if (plantaId && !scope.includes(plantaId)) {
        // planta fora do escopo: retorna vazio
        where.planta_id = '__NEVER__';
      }
    }

    return this.prisma.unidades.findMany({
      where,
      select: {
        id: true,
        nome: true,
        planta: {
          select: {
            id: true,
            nome: true
          }
        }
      },
      orderBy: { nome: 'asc' }
    });
  }

  async getEquipamentosSelect(user?: UserCtx, plantaId?: string) {
    const scope = await this.getScope(user);
    const where: any = { deleted_at: null };

    if (plantaId) {
      where.unidade = { planta_id: plantaId };
    }
    if (this.scopeService.isScoped(scope)) {
      if (plantaId && !scope.includes(plantaId)) {
        where.unidade = { planta_id: '__NEVER__' };
      } else if (!plantaId) {
        where.unidade = { planta_id: { in: scope } };
      }
    }

    return this.prisma.equipamentos.findMany({
      where,
      select: {
        id: true,
        nome: true,
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
      },
      orderBy: [
        { nome: 'asc' }
      ]
    }).then(equipamentos =>
      equipamentos.map(eq => ({
        id: eq.id,
        nome: eq.nome,
        planta_id: eq.unidade?.planta?.id || null,
        planta_nome: eq.unidade?.planta?.nome || 'Sem planta'
      }))
    );
  }

  async getUsuariosSelect() {
    return this.prisma.usuarios.findMany({
      where: { deleted_at: null },
      select: {
        id: true,
        nome: true,
        email: true
      },
      orderBy: { nome: 'asc' }
    });
  }

  private async associarInstrucoes(anomaliaId: string, instrucoesIds: string[]) {
    const instrucoes = await this.prisma.instrucoes.findMany({
      where: {
        id: { in: instrucoesIds },
        deleted_at: null
      }
    });

    if (instrucoes.length !== instrucoesIds.length) {
      throw new BadRequestException('Algumas instruções não foram encontradas');
    }

    // Criar associações uma a uma para que o Prisma gere os IDs via @default(cuid())
    for (const instrucaoId of instrucoesIds) {
      await this.prisma.anomalias_instrucoes.create({
        data: {
          anomalia_id: anomaliaId,
          instrucao_id: instrucaoId,
        }
      });
    }
  }
}