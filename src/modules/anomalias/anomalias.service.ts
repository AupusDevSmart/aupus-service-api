// src/anomalias/anomalias.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateAnomaliaDto, UpdateAnomaliaDto, AnomaliaFiltersDto, AnomaliaStatsDto } from './dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class AnomaliasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createAnomaliaDto: CreateAnomaliaDto, userId?: string) {
    const { localizacao, anexos, ...anomaliaData } = createAnomaliaDto;

    const data: Prisma.anomaliasCreateInput = {
      ...anomaliaData,
      local: localizacao.local,
      ativo: localizacao.ativo,
      status: 'AGUARDANDO',
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

    return this.prisma.anomalias.create({
      data,
      include: {
        planta: true,
        equipamento: true,
        usuario: true,
        historico: {
          orderBy: { created_at: 'desc' }
        }
      }
    });
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
      ...(planta && { planta_id: planta }),
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
          equipamento: true,
          usuario: true
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
        equipamento: true,
        usuario: true,
        historico: {
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
    const { localizacao, anexos, ...updateData } = updateAnomaliaDto;

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
          status_novo: updateData.status || anomalia.status
        }
      }
    };

    return this.prisma.anomalias.update({
      where: { id },
      data,
      include: {
        planta: true,
        equipamento: true,
        usuario: true,
        historico: {
          orderBy: { created_at: 'desc' }
        }
      }
    });
  }

  async remove(id: string, userId?: string) {
    await this.findOne(id);

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

  async gerarOS(id: string, userId?: string) {
    const anomalia = await this.findOne(id);

    if (!['AGUARDANDO', 'EM_ANALISE'].includes(anomalia.status)) {
      throw new Error('Anomalia não está em status válido para gerar OS');
    }

    const osId = `OS-${new Date().getFullYear()}-${Date.now().toString().slice(-3)}`;

    return this.prisma.anomalias.update({
      where: { id },
      data: {
        status: 'OS_GERADA',
        ordem_servico_id: osId,
        historico: {
          create: {
            acao: 'Ordem de Serviço gerada',
            usuario: userId ? `Usuário ${userId}` : 'Sistema',
            observacoes: `${osId} criada`,
            status_anterior: anomalia.status,
            status_novo: 'OS_GERADA'
          }
        }
      },
      include: {
        planta: true,
        equipamento: true,
        usuario: true,
        historico: {
          orderBy: { created_at: 'desc' }
        }
      }
    });
  }

  async resolver(id: string, observacoes?: string, userId?: string) {
    const anomalia = await this.findOne(id);

    return this.prisma.anomalias.update({
      where: { id },
      data: {
        status: 'RESOLVIDA',
        historico: {
          create: {
            acao: 'Anomalia resolvida',
            usuario: userId ? `Usuário ${userId}` : 'Sistema',
            observacoes: observacoes || 'Anomalia foi resolvida',
            status_anterior: anomalia.status,
            status_novo: 'RESOLVIDA'
          }
        }
      },
      include: {
        planta: true,
        equipamento: true,
        usuario: true,
        historico: {
          orderBy: { created_at: 'desc' }
        }
      }
    });
  }

  async cancelar(id: string, motivo?: string, userId?: string) {
    const anomalia = await this.findOne(id);

    return this.prisma.anomalias.update({
      where: { id },
      data: {
        status: 'CANCELADA',
        historico: {
          create: {
            acao: 'Anomalia cancelada',
            usuario: userId ? `Usuário ${userId}` : 'Sistema',
            observacoes: motivo || 'Anomalia foi cancelada',
            status_anterior: anomalia.status,
            status_novo: 'CANCELADA'
          }
        }
      },
      include: {
        planta: true,
        equipamento: true,
        usuario: true,
        historico: {
          orderBy: { created_at: 'desc' }
        }
      }
    });
  }

  async getStats(filters?: Pick<AnomaliaFiltersDto, 'periodo'>): Promise<AnomaliaStatsDto> {
    const where: Prisma.anomaliasWhereInput = {
      deleted_at: null,
      ...(filters?.periodo && this.buildPeriodoFilter(filters.periodo))
    };

    const [
      total,
      aguardando,
      emAnalise,
      osGerada,
      resolvida,
      cancelada,
      criticas
    ] = await Promise.all([
      this.prisma.anomalias.count({ where }),
      this.prisma.anomalias.count({ where: { ...where, status: 'AGUARDANDO' } }),
      this.prisma.anomalias.count({ where: { ...where, status: 'EM_ANALISE' } }),
      this.prisma.anomalias.count({ where: { ...where, status: 'OS_GERADA' } }),
      this.prisma.anomalias.count({ where: { ...where, status: 'RESOLVIDA' } }),
      this.prisma.anomalias.count({ where: { ...where, status: 'CANCELADA' } }),
      this.prisma.anomalias.count({ where: { ...where, prioridade: 'CRITICA' } })
    ]);

    return {
      total,
      aguardando,
      emAnalise,
      osGerada,
      resolvida,
      cancelada,
      criticas
    };
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
}