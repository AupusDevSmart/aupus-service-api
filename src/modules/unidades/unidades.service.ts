import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateUnidadeDto } from './dto/create-unidade.dto';
import { UpdateUnidadeDto } from './dto/update-unidade.dto';
import { FindAllUnidadesDto } from './dto/find-all-unidades.dto';
import { UnidadeResponse, PaginatedUnidadesResponse } from './dto/unidade-response.dto';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

@Injectable()
export class UnidadesService {
  constructor(private prisma: PrismaService) {}

  async create(createDto: CreateUnidadeDto): Promise<UnidadeResponse> {
    const { planta_id, pontos_medicao, ...unidadeData } = createDto;

    try {
      // 1. Verificar se a planta existe
      const planta = await this.prisma.plantas.findFirst({
        where: {
          id: planta_id,
          deleted_at: null,
        },
        select: {
          id: true,
          nome: true,
          localizacao: true,
        },
      });

      if (!planta) {
        throw new NotFoundException(`Planta com ID ${planta_id} não encontrada`);
      }

      // 2. Criar a unidade
      const novaUnidade = await this.prisma.unidades.create({
        data: {
          ...unidadeData,
          planta_id,
          pontos_medicao: pontos_medicao ? pontos_medicao : null,
          status: 'ativo',
        },
        include: {
          planta: {
            select: {
              id: true,
              nome: true,
              localizacao: true,
            },
          },
        },
      });

      return this.formatUnidadeResponse(novaUnidade);
    } catch (error) {
      console.error('❌ [UNIDADES SERVICE] Erro ao criar unidade:', error);

      if (error instanceof NotFoundException) {
        throw error;
      }

      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new BadRequestException('Planta inválida ou não encontrada');
        }
      }

      throw new BadRequestException('Erro ao criar unidade');
    }
  }

  async findAll(queryDto: FindAllUnidadesDto): Promise<PaginatedUnidadesResponse> {
    const {
      page = 1,
      limit = 10,
      search,
      plantaId,
      tipo,
      status,
      estado,
      orderBy = 'nome',
      orderDirection = 'asc',
    } = queryDto;

    try {
      // Construir filtros
      const whereClause: any = {
        deleted_at: null,
      };

      // Filtro de busca textual
      if (search && search.trim()) {
        const searchTerm = search.trim();
        whereClause.OR = [
          { nome: { contains: searchTerm, mode: 'insensitive' } },
          { cidade: { contains: searchTerm, mode: 'insensitive' } },
          { estado: { contains: searchTerm, mode: 'insensitive' } },
        ];
      }

      // Filtros específicos
      if (plantaId) whereClause.planta_id = plantaId;
      if (tipo) whereClause.tipo = tipo;
      if (status) whereClause.status = status;
      if (estado) whereClause.estado = estado;

      // Construir ordenação
      const orderByClause: any = {};
      switch (orderBy) {
        case 'nome':
          orderByClause.nome = orderDirection;
          break;
        case 'tipo':
          orderByClause.tipo = orderDirection;
          break;
        case 'cidade':
          orderByClause.cidade = orderDirection;
          break;
        case 'potencia':
          orderByClause.potencia = orderDirection;
          break;
        case 'criadoEm':
          orderByClause.created_at = orderDirection;
          break;
        default:
          orderByClause.nome = 'asc';
      }

      // Calcular paginação
      const skip = (page - 1) * limit;

      // Buscar dados e contagem em paralelo
      const [unidades, total] = await Promise.all([
        this.prisma.unidades.findMany({
          where: whereClause,
          include: {
            planta: {
              select: {
                id: true,
                nome: true,
                localizacao: true,
              },
            },
            _count: {
              select: {
                equipamentos: true,
              },
            },
          },
          orderBy: orderByClause,
          skip,
          take: limit,
        }),
        this.prisma.unidades.count({
          where: whereClause,
        }),
      ]);

      // Formatar resposta
      const unidadesFormatadas = unidades.map((unidade) =>
        this.formatUnidadeResponse(unidade),
      );

      const totalPages = Math.ceil(total / limit);

      return {
        data: unidadesFormatadas,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };
    } catch (error) {
      console.error('❌ [UNIDADES SERVICE] Erro ao buscar unidades:', error);
      throw new BadRequestException('Erro ao buscar unidades');
    }
  }

  async findOne(id: string): Promise<UnidadeResponse> {
    try {
      const unidade = await this.prisma.unidades.findFirst({
        where: {
          id,
          deleted_at: null,
        },
        include: {
          planta: {
            select: {
              id: true,
              nome: true,
              localizacao: true,
            },
          },
          _count: {
            select: {
              equipamentos: true,
            },
          },
        },
      });

      if (!unidade) {
        throw new NotFoundException(`Unidade com ID ${id} não encontrada`);
      }

      return this.formatUnidadeResponse(unidade);
    } catch (error) {
      console.error('❌ [UNIDADES SERVICE] Erro ao buscar unidade:', error);

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new BadRequestException('Erro ao buscar unidade');
    }
  }

  async findByPlanta(plantaId: string): Promise<UnidadeResponse[]> {
    try {
      // Verificar se planta existe
      const planta = await this.prisma.plantas.findFirst({
        where: {
          id: plantaId,
          deleted_at: null,
        },
      });

      if (!planta) {
        throw new NotFoundException(`Planta com ID ${plantaId} não encontrada`);
      }

      const unidades = await this.prisma.unidades.findMany({
        where: {
          planta_id: plantaId,
          deleted_at: null,
        },
        include: {
          planta: {
            select: {
              id: true,
              nome: true,
              localizacao: true,
            },
          },
          _count: {
            select: {
              equipamentos: true,
            },
          },
        },
        orderBy: {
          nome: 'asc',
        },
      });

      return unidades.map((unidade) => this.formatUnidadeResponse(unidade));
    } catch (error) {
      console.error('❌ [UNIDADES SERVICE] Erro ao buscar unidades da planta:', error);

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new BadRequestException('Erro ao buscar unidades da planta');
    }
  }

  async update(id: string, updateDto: UpdateUnidadeDto): Promise<UnidadeResponse> {
    const { planta_id, pontos_medicao, ...unidadeData } = updateDto;

    try {
      // 1. Verificar se a unidade existe
      const unidadeExistente = await this.prisma.unidades.findFirst({
        where: {
          id,
          deleted_at: null,
        },
      });

      if (!unidadeExistente) {
        throw new NotFoundException(`Unidade com ID ${id} não encontrada`);
      }

      // 2. Se mudou de planta, verificar se a nova planta existe
      if (planta_id && planta_id !== unidadeExistente.planta_id) {
        const planta = await this.prisma.plantas.findFirst({
          where: {
            id: planta_id,
            deleted_at: null,
          },
        });

        if (!planta) {
          throw new NotFoundException(`Planta com ID ${planta_id} não encontrada`);
        }
      }

      // 3. Preparar dados para atualização
      const updateData: any = {
        ...unidadeData,
      };

      if (planta_id !== undefined) updateData.planta_id = planta_id;
      if (pontos_medicao !== undefined) updateData.pontos_medicao = pontos_medicao || null;

      // 4. Atualizar a unidade
      const unidadeAtualizada = await this.prisma.unidades.update({
        where: { id },
        data: updateData,
        include: {
          planta: {
            select: {
              id: true,
              nome: true,
              localizacao: true,
            },
          },
          _count: {
            select: {
              equipamentos: true,
            },
          },
        },
      });

      return this.formatUnidadeResponse(unidadeAtualizada);
    } catch (error) {
      console.error('❌ [UNIDADES SERVICE] Erro ao atualizar unidade:', error);

      if (error instanceof NotFoundException) {
        throw error;
      }

      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new BadRequestException('Planta inválida ou não encontrada');
        }
      }

      throw new BadRequestException('Erro ao atualizar unidade');
    }
  }

  async remove(id: string): Promise<{ message: string }> {
    try {
      const unidade = await this.prisma.unidades.findFirst({
        where: {
          id,
          deleted_at: null,
        },
        include: {
          _count: {
            select: {
              equipamentos: true,
            },
          },
        },
      });

      if (!unidade) {
        throw new NotFoundException(`Unidade com ID ${id} não encontrada`);
      }

      // Verificar se há equipamentos vinculados
      if (unidade._count.equipamentos > 0) {
        throw new BadRequestException(
          `Não é possível remover unidade que possui ${unidade._count.equipamentos} equipamento(s) vinculado(s)`,
        );
      }

      // Soft delete
      await this.prisma.unidades.update({
        where: { id },
        data: {
          deleted_at: new Date(),
        },
      });

      return { message: 'Unidade removida com sucesso' };
    } catch (error) {
      console.error('❌ [UNIDADES SERVICE] Erro ao remover unidade:', error);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException('Erro ao remover unidade');
    }
  }

  async getEstatisticas(unidadeId: string) {
    try {
      const unidade = await this.prisma.unidades.findFirst({
        where: {
          id: unidadeId,
          deleted_at: null,
        },
        select: {
          id: true,
          nome: true,
          tipo: true,
          potencia: true,
        },
      });

      if (!unidade) {
        throw new NotFoundException(`Unidade com ID ${unidadeId} não encontrada`);
      }

      const [totalEquipamentos, equipamentosPorTipo, equipamentosPorCriticidade] =
        await Promise.all([
          // Total de equipamentos
          this.prisma.equipamentos.count({
            where: {
              unidade_id: unidadeId,
              deleted_at: null,
            },
          }),

          // Por classificação
          this.prisma.equipamentos.groupBy({
            by: ['classificacao'],
            where: {
              unidade_id: unidadeId,
              deleted_at: null,
            },
            _count: {
              id: true,
            },
          }),

          // Por criticidade
          this.prisma.equipamentos.groupBy({
            by: ['criticidade'],
            where: {
              unidade_id: unidadeId,
              deleted_at: null,
            },
            _count: {
              id: true,
            },
          }),
        ]);

      return {
        unidade: {
          id: unidade.id,
          nome: unidade.nome,
          tipo: unidade.tipo,
          potencia: Number(unidade.potencia),
        },
        totais: {
          equipamentos: totalEquipamentos,
        },
        porTipo: equipamentosPorTipo.reduce(
          (acc, item) => {
            acc[item.classificacao || 'outros'] = item._count.id;
            return acc;
          },
          {} as Record<string, number>,
        ),
        porCriticidade: equipamentosPorCriticidade.reduce(
          (acc, item) => {
            acc[item.criticidade || '0'] = item._count.id;
            return acc;
          },
          {} as Record<string, number>,
        ),
      };
    } catch (error) {
      console.error('❌ [UNIDADES SERVICE] Erro ao buscar estatísticas:', error);

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new BadRequestException('Erro ao buscar estatísticas da unidade');
    }
  }

  private formatUnidadeResponse(unidadeDb: any): UnidadeResponse {
    return {
      id: unidadeDb.id,
      plantaId: unidadeDb.planta_id,
      nome: unidadeDb.nome,
      tipo: unidadeDb.tipo,
      estado: unidadeDb.estado,
      cidade: unidadeDb.cidade,
      latitude: Number(unidadeDb.latitude),
      longitude: Number(unidadeDb.longitude),
      potencia: Number(unidadeDb.potencia),
      status: unidadeDb.status,
      pontosMedicao: unidadeDb.pontos_medicao || [],
      planta: unidadeDb.planta
        ? {
            id: unidadeDb.planta.id,
            nome: unidadeDb.planta.nome,
            localizacao: unidadeDb.planta.localizacao,
          }
        : undefined,
      totalEquipamentos: unidadeDb._count?.equipamentos || 0,
      criadoEm: unidadeDb.created_at,
      atualizadoEm: unidadeDb.updated_at,
    };
  }
}
