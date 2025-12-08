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
    const { planta_id, pontos_medicao, concessionaria_id, ...unidadeData } = createDto;

    // 🔍 LOG DETALHADO - Dados recebidos
    console.log('🏁 [CREATE UNIDADE] ===== INÍCIO =====');
    console.log('📦 [CREATE UNIDADE] DTO completo recebido:', JSON.stringify(createDto, null, 2));
    console.log('🔑 [CREATE UNIDADE] concessionaria_id extraído:', concessionaria_id);
    console.log('🔍 [CREATE UNIDADE] Tipo de concessionaria_id:', typeof concessionaria_id);
    console.log('📝 [CREATE UNIDADE] Valor é undefined?', concessionaria_id === undefined);
    console.log('📝 [CREATE UNIDADE] Valor é null?', concessionaria_id === null);
    console.log('📝 [CREATE UNIDADE] Valor é string vazia?', concessionaria_id === '');

    try {
      // Normalizar IDs (trim)
      const plantaIdTrimmed = planta_id?.trim();
      const concessionariaIdTrimmed = concessionaria_id?.trim();

      // 1. Verificar se a planta existe
      const planta = await this.prisma.plantas.findFirst({
        where: {
          id: plantaIdTrimmed,
          deleted_at: null,
        },
        select: {
          id: true,
          nome: true,
          localizacao: true,
        },
      });

      if (!planta) {
        throw new NotFoundException(`Planta com ID ${plantaIdTrimmed} não encontrada`);
      }

      // 2. Se concessionaria_id foi fornecido, verificar se existe
      if (concessionariaIdTrimmed) {
        console.log('✅ [CREATE UNIDADE] concessionaria_id fornecido, verificando se existe...');
        const concessionaria = await this.prisma.concessionarias_energia.findFirst({
          where: {
            id: concessionariaIdTrimmed,
            deleted_at: null,
          },
        });

        if (!concessionaria) {
          throw new NotFoundException(`Concessionária com ID ${concessionariaIdTrimmed} não encontrada`);
        }
        console.log('✅ [CREATE UNIDADE] Concessionária encontrada:', concessionaria.nome);
      } else {
        console.log('⚠️ [CREATE UNIDADE] concessionaria_id NÃO fornecido ou é falsy');
      }

      // 3. Preparar dados para criação
      const dataToCreate = {
        ...unidadeData,
        planta_id: plantaIdTrimmed,
        pontos_medicao: pontos_medicao ? pontos_medicao : null,
        concessionaria_id: concessionariaIdTrimmed || null,
        status: 'ativo',
      };

      console.log('💾 [CREATE UNIDADE] Dados que serão salvos no banco:', JSON.stringify(dataToCreate, null, 2));
      console.log('🔑 [CREATE UNIDADE] concessionaria_id no objeto final:', dataToCreate.concessionaria_id);

      // 4. Criar a unidade
      const novaUnidade = await this.prisma.unidades.create({
        data: dataToCreate,
        include: {
          planta: {
            select: {
              id: true,
              nome: true,
              localizacao: true,
              proprietario: {
                select: {
                  id: true,
                  nome: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      console.log('✅ [CREATE UNIDADE] Unidade criada no banco com ID:', novaUnidade.id);
      console.log('🔑 [CREATE UNIDADE] concessionaria_id salvo no banco:', novaUnidade.concessionaria_id);
      console.log('🏁 [CREATE UNIDADE] ===== FIM =====');

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
      proprietarioId,
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

      // Filtros hierárquicos: proprietário > planta
      // Prioridade: planta > proprietário
      if (plantaId) {
        const plantaIdTrimmed = plantaId.trim();
        whereClause.planta_id = plantaIdTrimmed;
        console.log('🔍 [FINDALL UNIDADES] Filtrando por planta:', plantaIdTrimmed);
      }
      // Se não tem planta mas tem proprietário, filtrar por proprietário (via relação com planta)
      else if (proprietarioId) {
        const proprietarioIdTrimmed = proprietarioId.trim();
        whereClause.planta = {
          proprietario_id: proprietarioIdTrimmed
        };
        console.log('🔍 [FINDALL UNIDADES] Filtrando por proprietário:', proprietarioIdTrimmed);
      }

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
              proprietario: {
                select: {
                  id: true,
                  nome: true,
                  email: true,
                },
              },
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
              proprietario: {
                select: {
                  id: true,
                  nome: true,
                  email: true,
                },
              },
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
    const { planta_id, pontos_medicao, concessionaria_id, ...unidadeData } = updateDto;

    // 🔍 LOG DETALHADO - Dados recebidos
    console.log('🏁 [UPDATE UNIDADE] ===== INÍCIO =====');
    console.log('🆔 [UPDATE UNIDADE] ID da unidade:', id);
    console.log('📦 [UPDATE UNIDADE] DTO completo recebido:', JSON.stringify(updateDto, null, 2));
    console.log('🔑 [UPDATE UNIDADE] concessionaria_id extraído:', concessionaria_id);
    console.log('🔍 [UPDATE UNIDADE] Tipo de concessionaria_id:', typeof concessionaria_id);
    console.log('📝 [UPDATE UNIDADE] Valor é undefined?', concessionaria_id === undefined);
    console.log('📝 [UPDATE UNIDADE] Valor é null?', concessionaria_id === null);
    console.log('📝 [UPDATE UNIDADE] Valor é string vazia?', concessionaria_id === '');

    try {
      // Normalizar IDs (trim)
      const idTrimmed = id?.trim();
      const plantaIdTrimmed = planta_id?.trim();
      const concessionariaIdTrimmed = concessionaria_id?.trim();

      // 1. Verificar se a unidade existe
      const unidadeExistente = await this.prisma.unidades.findFirst({
        where: {
          id: idTrimmed,
          deleted_at: null,
        },
      });

      if (!unidadeExistente) {
        throw new NotFoundException(`Unidade com ID ${idTrimmed} não encontrada`);
      }

      console.log('📋 [UPDATE UNIDADE] Unidade existente encontrada:', unidadeExistente.nome);
      console.log('🔑 [UPDATE UNIDADE] concessionaria_id atual no banco:', unidadeExistente.concessionaria_id);

      // 2. Se mudou de planta, verificar se a nova planta existe
      if (plantaIdTrimmed && plantaIdTrimmed !== unidadeExistente.planta_id?.trim()) {
        const planta = await this.prisma.plantas.findFirst({
          where: {
            id: plantaIdTrimmed,
            deleted_at: null,
          },
        });

        if (!planta) {
          throw new NotFoundException(`Planta com ID ${plantaIdTrimmed} não encontrada`);
        }
      }

      // 3. Se mudou de concessionária, verificar se existe
      const concessionariaAtualTrimmed = unidadeExistente.concessionaria_id?.trim();
      if (concessionaria_id !== undefined && concessionariaIdTrimmed !== concessionariaAtualTrimmed) {
        console.log('🔄 [UPDATE UNIDADE] Mudança de concessionária detectada');
        console.log('   Anterior:', concessionariaAtualTrimmed);
        console.log('   Nova:', concessionariaIdTrimmed);

        if (concessionariaIdTrimmed) {
          const concessionaria = await this.prisma.concessionarias_energia.findFirst({
            where: {
              id: concessionariaIdTrimmed,
              deleted_at: null,
            },
          });

          if (!concessionaria) {
            throw new NotFoundException(`Concessionária com ID ${concessionariaIdTrimmed} não encontrada`);
          }
          console.log('✅ [UPDATE UNIDADE] Nova concessionária encontrada:', concessionaria.nome);
        } else {
          console.log('⚠️ [UPDATE UNIDADE] Removendo concessionária (setando para null)');
        }
      } else if (concessionaria_id === undefined) {
        console.log('ℹ️ [UPDATE UNIDADE] concessionaria_id undefined - mantendo valor atual');
      } else {
        console.log('ℹ️ [UPDATE UNIDADE] concessionaria_id sem alteração');
      }

      // 4. Preparar dados para atualização
      const updateData: any = {
        ...unidadeData,
      };

      if (planta_id !== undefined) updateData.planta_id = plantaIdTrimmed;
      if (pontos_medicao !== undefined) updateData.pontos_medicao = pontos_medicao || null;
      if (concessionaria_id !== undefined) updateData.concessionaria_id = concessionariaIdTrimmed || null;

      console.log('💾 [UPDATE UNIDADE] Dados que serão atualizados:', JSON.stringify(updateData, null, 2));
      console.log('🔑 [UPDATE UNIDADE] concessionaria_id no objeto final:', updateData.concessionaria_id);

      // 5. Atualizar a unidade
      const unidadeAtualizada = await this.prisma.unidades.update({
        where: { id: idTrimmed },
        data: updateData,
        include: {
          planta: {
            select: {
              id: true,
              nome: true,
              localizacao: true,
              proprietario: {
                select: {
                  id: true,
                  nome: true,
                  email: true,
                },
              },
            },
          },
          _count: {
            select: {
              equipamentos: true,
            },
          },
        },
      });

      console.log('✅ [UPDATE UNIDADE] Unidade atualizada no banco');
      console.log('🔑 [UPDATE UNIDADE] concessionaria_id após atualização:', unidadeAtualizada.concessionaria_id);
      console.log('🏁 [UPDATE UNIDADE] ===== FIM =====');

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

  async remove(id: string): Promise<{ message: string; deletedEquipments?: number }> {
    try {
      const unidade = await this.prisma.unidades.findFirst({
        where: {
          id,
          deleted_at: null,
        },
        include: {
          _count: {
            select: {
              equipamentos: {
                where: { deleted_at: null }
              },
            },
          },
        },
      });

      if (!unidade) {
        throw new NotFoundException(`Unidade com ID ${id} não encontrada`);
      }

      // Contar equipamentos que serão deletados
      const equipamentosCount = unidade._count.equipamentos;

      // Iniciar transação para deletar unidade e equipamentos em cascata
      const result = await this.prisma.$transaction(async (prisma) => {
        // 1. Soft delete de todos os equipamentos da unidade
        if (equipamentosCount > 0) {
          await prisma.equipamentos.updateMany({
            where: {
              unidade_id: id,
              deleted_at: null,
            },
            data: {
              deleted_at: new Date(),
            },
          });
          console.log(`✅ [UNIDADES SERVICE] ${equipamentosCount} equipamento(s) deletado(s) em cascata`);
        }

        // 2. Soft delete da unidade
        await prisma.unidades.update({
          where: { id },
          data: {
            deleted_at: new Date(),
          },
        });

        return { equipamentosCount };
      });

      const message = result.equipamentosCount > 0
        ? `Unidade removida com sucesso junto com ${result.equipamentosCount} equipamento(s)`
        : 'Unidade removida com sucesso';

      return {
        message,
        deletedEquipments: result.equipamentosCount
      };
    } catch (error) {
      console.error('❌ [UNIDADES SERVICE] Erro ao remover unidade:', error);

      if (error instanceof NotFoundException) {
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
    // ✅ CORREÇÃO: Converter null/undefined para undefined, e fazer trim em strings
    const formatId = (id: any): string | undefined => {
      if (!id || id === null) return undefined;
      return typeof id === 'string' ? id.trim() : id;
    };

    return {
      id: unidadeDb.id?.trim() || unidadeDb.id, // ✅ TRIM para remover espaços extras
      plantaId: unidadeDb.planta_id?.trim() || unidadeDb.planta_id, // ✅ TRIM
      nome: unidadeDb.nome,
      tipo: unidadeDb.tipo,
      estado: unidadeDb.estado,
      cidade: unidadeDb.cidade,
      latitude: Number(unidadeDb.latitude),
      longitude: Number(unidadeDb.longitude),
      potencia: Number(unidadeDb.potencia),
      status: unidadeDb.status,
      pontosMedicao: unidadeDb.pontos_medicao || [],
      irrigante: unidadeDb.irrigante,
      grupo: unidadeDb.grupo,
      subgrupo: unidadeDb.subgrupo,
      tipoUnidade: unidadeDb.tipo_unidade,
      demandaCarga: unidadeDb.demanda_carga ? Number(unidadeDb.demanda_carga) : undefined,
      demandaGeracao: unidadeDb.demanda_geracao ? Number(unidadeDb.demanda_geracao) : undefined,
      concessionariaId: formatId(unidadeDb.concessionaria_id), // ✅ CORREÇÃO: usar helper
      planta: unidadeDb.planta
        ? {
            id: unidadeDb.planta.id?.trim() || unidadeDb.planta.id, // ✅ TRIM
            nome: unidadeDb.planta.nome,
            localizacao: unidadeDb.planta.localizacao,
            proprietario: unidadeDb.planta.proprietario
              ? {
                  id: unidadeDb.planta.proprietario.id,
                  nome: unidadeDb.planta.proprietario.nome,
                  email: unidadeDb.planta.proprietario.email,
                }
              : undefined,
          }
        : undefined,
      totalEquipamentos: unidadeDb._count?.equipamentos || 0,
      criadoEm: unidadeDb.created_at,
      atualizadoEm: unidadeDb.updated_at,
    };
  }
}
