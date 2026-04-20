// src/anomalias/anomalias.service.ts
import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '@aupus/api-shared';
import { CreateAnomaliaDto, UpdateAnomaliaDto, AnomaliaFiltersDto, AnomaliaStatsDto } from './dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class AnomaliasService {
  private readonly logger = new Logger(AnomaliasService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(createAnomaliaDto: CreateAnomaliaDto, userId?: string) {
    const { localizacao, anexos, instrucoes_ids, ...anomaliaData } = createAnomaliaDto;

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

  async findAll(filters: AnomaliaFiltersDto) {
    const { search, periodo, status, prioridade, origem, planta, unidade, page = 1, limit = 10 } = filters;

    const where: Prisma.anomaliasWhereInput = {
      deleted_at: null,
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

  async findOne(id: string) {
    const anomalia = await this.prisma.anomalias.findFirst({
      where: { id, deleted_at: null },
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

  async update(id: string, updateAnomaliaDto: UpdateAnomaliaDto, userId?: string) {
    const anomalia = await this.findOne(id);

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

  async remove(id: string, userId?: string) {
    const anomalia = await this.findOne(id);

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

  async getStats(periodo?: string): Promise<AnomaliaStatsDto> {
    const whereBase: any = { deleted_at: null };

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

  async getPlantasSelect() {
    return this.prisma.plantas.findMany({
      where: { deleted_at: null },
      select: {
        id: true,
        nome: true
      },
      orderBy: { nome: 'asc' }
    });
  }

  async getUnidadesSelect(plantaId?: string) {
    const where: any = { deleted_at: null };

    if (plantaId) {
      where.planta_id = plantaId;
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

  async getEquipamentosSelect(plantaId?: string) {
    const where: any = { deleted_at: null };

    if (plantaId) {
      where.unidade = {
        planta_id: plantaId
      };
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