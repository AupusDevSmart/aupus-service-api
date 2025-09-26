import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  CreateConfiguracaoDiasUteisDto,
  UpdateConfiguracaoDiasUteisDto,
  QueryConfiguracoesDto,
  ConfiguracaoDiasUteisResponseDto,
  AssociarPlantasDto
} from './dto';
import { Prisma } from '@prisma/client';

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class ConfiguracoesDiasUteisService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(createDto: CreateConfiguracaoDiasUteisDto): Promise<ConfiguracaoDiasUteisResponseDto> {
    // Verificar se já existe configuração com o mesmo nome
    const configuracaoExistente = await this.prisma.configuracoes_dias_uteis.findFirst({
      where: {
        nome: createDto.nome,
        ativo: true
      }
    });

    if (configuracaoExistente) {
      throw new ConflictException(`Já existe uma configuração com o nome "${createDto.nome}"`);
    }

    // Se não for geral, verificar se plantas existem
    if (!createDto.geral && createDto.plantaIds?.length) {
      const plantasExistentes = await this.prisma.plantas.findMany({
        where: {
          id: { in: createDto.plantaIds },
          deleted_at: null
        }
      });

      if (plantasExistentes.length !== createDto.plantaIds.length) {
        throw new BadRequestException('Uma ou mais plantas não foram encontradas');
      }
    }

    // Transação para criar configuração e relacionamentos
    const configuracao = await this.prisma.$transaction(async (tx) => {
      const novaConfiguracao = await tx.configuracoes_dias_uteis.create({
        data: {
          nome: createDto.nome,
          descricao: createDto.descricao,
          segunda: createDto.segunda !== undefined ? createDto.segunda : true,
          terca: createDto.terca !== undefined ? createDto.terca : true,
          quarta: createDto.quarta !== undefined ? createDto.quarta : true,
          quinta: createDto.quinta !== undefined ? createDto.quinta : true,
          sexta: createDto.sexta !== undefined ? createDto.sexta : true,
          sabado: createDto.sabado !== undefined ? createDto.sabado : false,
          domingo: createDto.domingo !== undefined ? createDto.domingo : false,
          geral: createDto.geral || false,
          ativo: true
        }
      });

      // Criar relacionamentos com plantas se não for geral
      if (!createDto.geral && createDto.plantaIds?.length) {
        await tx.configuracao_plantas.createMany({
          data: createDto.plantaIds.map(plantaId => ({
            configuracao_id: novaConfiguracao.id,
            planta_id: plantaId
          }))
        });
      }

      return novaConfiguracao;
    });

    return this.buscarPorId(configuracao.id);
  }

  async buscarTodos(queryDto: QueryConfiguracoesDto): Promise<PaginatedResponse<ConfiguracaoDiasUteisResponseDto>> {
    const { page, limit, search, plantaId, geral, sabado, domingo, orderBy, orderDirection } = queryDto;

    const skip = (page - 1) * limit;

    // Construir filtros
    const where: Prisma.configuracoes_dias_uteisWhereInput = {
      ativo: true,
      ...(search && {
        OR: [
          { nome: { contains: search, mode: 'insensitive' } },
          { descricao: { contains: search, mode: 'insensitive' } }
        ]
      }),
      ...(geral !== undefined && { geral }),
      ...(sabado !== undefined && { sabado }),
      ...(domingo !== undefined && { domingo }),
      ...(plantaId && {
        OR: [
          { geral: true },
          { configuracao_plantas: { some: { planta_id: plantaId } } }
        ]
      })
    };

    // Ordenação
    const orderByClause = this.buildOrderBy(orderBy, orderDirection);

    // Buscar dados
    const [configuracoes, total] = await Promise.all([
      this.prisma.configuracoes_dias_uteis.findMany({
        where,
        include: {
          configuracao_plantas: {
            include: {
              plantas: {
                select: {
                  id: true,
                  nome: true,
                  cnpj: true,
                  cidade: true
                }
              }
            }
          },
          _count: {
            select: {
              configuracao_plantas: true
            }
          }
        },
        orderBy: orderByClause,
        skip,
        take: limit
      }),
      this.prisma.configuracoes_dias_uteis.count({ where })
    ]);

    return {
      data: configuracoes.map(config => this.mapearParaResponse(config)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async buscarPorId(id: string): Promise<ConfiguracaoDiasUteisResponseDto> {
    const configuracao = await this.prisma.configuracoes_dias_uteis.findUnique({
      where: { id },
      include: {
        configuracao_plantas: {
          include: {
            plantas: {
              select: {
                id: true,
                nome: true,
                cnpj: true,
                cidade: true
              }
            }
          }
        },
        _count: {
          select: {
            configuracao_plantas: true
          }
        }
      }
    });

    if (!configuracao) {
      throw new NotFoundException(`Configuração com ID ${id} não encontrada`);
    }

    return this.mapearParaResponse(configuracao);
  }

  async atualizar(id: string, updateDto: UpdateConfiguracaoDiasUteisDto): Promise<ConfiguracaoDiasUteisResponseDto> {
    const configuracaoExistente = await this.prisma.configuracoes_dias_uteis.findUnique({
      where: { id }
    });

    if (!configuracaoExistente) {
      throw new NotFoundException(`Configuração com ID ${id} não encontrada`);
    }

    // Verificar conflito de nome se estiver sendo alterado
    if (updateDto.nome && updateDto.nome !== configuracaoExistente.nome) {
      const conflito = await this.prisma.configuracoes_dias_uteis.findFirst({
        where: {
          nome: updateDto.nome,
          id: { not: id },
          ativo: true
        }
      });

      if (conflito) {
        throw new ConflictException(`Já existe uma configuração com o nome "${updateDto.nome}"`);
      }
    }

    // Se mudando de/para geral, limpar relacionamentos existentes
    if (updateDto.geral !== undefined && updateDto.geral !== configuracaoExistente.geral) {
      await this.prisma.configuracao_plantas.deleteMany({
        where: { configuracao_id: id }
      });
    }

    // Transação para atualizar
    const configuracao = await this.prisma.$transaction(async (tx) => {
      const configuracaoAtualizada = await tx.configuracoes_dias_uteis.update({
        where: { id },
        data: {
          nome: updateDto.nome,
          descricao: updateDto.descricao,
          segunda: updateDto.segunda,
          terca: updateDto.terca,
          quarta: updateDto.quarta,
          quinta: updateDto.quinta,
          sexta: updateDto.sexta,
          sabado: updateDto.sabado,
          domingo: updateDto.domingo,
          geral: updateDto.geral
        }
      });

      // Recriar relacionamentos se necessário
      if (updateDto.geral === false && updateDto.plantaIds?.length) {
        await tx.configuracao_plantas.deleteMany({
          where: { configuracao_id: id }
        });

        await tx.configuracao_plantas.createMany({
          data: updateDto.plantaIds.map(plantaId => ({
            configuracao_id: id,
            planta_id: plantaId
          }))
        });
      }

      return configuracaoAtualizada;
    });

    return this.buscarPorId(configuracao.id);
  }

  async remover(id: string): Promise<void> {
    const configuracao = await this.prisma.configuracoes_dias_uteis.findUnique({
      where: { id }
    });

    if (!configuracao) {
      throw new NotFoundException(`Configuração com ID ${id} não encontrada`);
    }

    await this.prisma.configuracoes_dias_uteis.update({
      where: { id },
      data: { ativo: false }
    });
  }

  async associarPlantas(id: string, associarDto: AssociarPlantasDto): Promise<ConfiguracaoDiasUteisResponseDto> {
    const configuracao = await this.prisma.configuracoes_dias_uteis.findUnique({
      where: { id }
    });

    if (!configuracao) {
      throw new NotFoundException(`Configuração com ID ${id} não encontrada`);
    }

    if (configuracao.geral) {
      throw new BadRequestException('Não é possível associar plantas a uma configuração geral');
    }

    // Verificar se plantas existem
    const plantasExistentes = await this.prisma.plantas.findMany({
      where: {
        id: { in: associarDto.plantaIds },
        deleted_at: null
      }
    });

    if (plantasExistentes.length !== associarDto.plantaIds.length) {
      throw new BadRequestException('Uma ou mais plantas não foram encontradas');
    }

    // Remover associações existentes e criar novas
    await this.prisma.$transaction(async (tx) => {
      await tx.configuracao_plantas.deleteMany({
        where: { configuracao_id: id }
      });

      await tx.configuracao_plantas.createMany({
        data: associarDto.plantaIds.map(plantaId => ({
          configuracao_id: id,
          planta_id: plantaId
        }))
      });
    });

    return this.buscarPorId(id);
  }

  async desassociarPlanta(id: string, plantaId: string): Promise<void> {
    const configuracao = await this.prisma.configuracoes_dias_uteis.findUnique({
      where: { id }
    });

    if (!configuracao) {
      throw new NotFoundException(`Configuração com ID ${id} não encontrada`);
    }

    if (configuracao.geral) {
      throw new BadRequestException('Não é possível desassociar plantas de uma configuração geral');
    }

    await this.prisma.configuracao_plantas.deleteMany({
      where: {
        configuracao_id: id,
        planta_id: plantaId
      }
    });
  }

  async obterConfiguracaoPorPlanta(plantaId?: string): Promise<ConfiguracaoDiasUteisResponseDto | null> {
    let configuracao;

    if (plantaId) {
      // Buscar configuração específica da planta primeiro
      configuracao = await this.prisma.configuracoes_dias_uteis.findFirst({
        where: {
          ativo: true,
          geral: false,
          configuracao_plantas: {
            some: { planta_id: plantaId }
          }
        },
        include: {
          configuracao_plantas: {
            include: {
              plantas: {
                select: {
                  id: true,
                  nome: true,
                  cnpj: true,
                  cidade: true
                }
              }
            }
          },
          _count: {
            select: {
              configuracao_plantas: true
            }
          }
        }
      });
    }

    // Se não encontrou específica, buscar geral
    if (!configuracao) {
      configuracao = await this.prisma.configuracoes_dias_uteis.findFirst({
        where: {
          ativo: true,
          geral: true
        },
        include: {
          configuracao_plantas: {
            include: {
              plantas: {
                select: {
                  id: true,
                  nome: true,
                  cnpj: true,
                  cidade: true
                }
              }
            }
          },
          _count: {
            select: {
              configuracao_plantas: true
            }
          }
        }
      });
    }

    return configuracao ? this.mapearParaResponse(configuracao) : null;
  }

  private buildOrderBy(orderBy?: string, orderDirection?: 'asc' | 'desc') {
    const direction = orderDirection || 'asc';

    switch (orderBy) {
      case 'created_at':
        return { created_at: direction };
      case 'total_dias_uteis':
        // Para ordenar por total de dias úteis, usar um campo calculado
        return { nome: direction }; // Fallback para nome
      case 'nome':
      default:
        return { nome: direction };
    }
  }

  private mapearParaResponse(configuracao: any): ConfiguracaoDiasUteisResponseDto {
    // Calcular dias úteis
    const diasUteis = [];
    const diasUteisCount = [
      configuracao.segunda && diasUteis.push('Segunda'),
      configuracao.terca && diasUteis.push('Terça'),
      configuracao.quarta && diasUteis.push('Quarta'),
      configuracao.quinta && diasUteis.push('Quinta'),
      configuracao.sexta && diasUteis.push('Sexta'),
      configuracao.sabado && diasUteis.push('Sábado'),
      configuracao.domingo && diasUteis.push('Domingo')
    ].filter(Boolean).length;

    return {
      id: configuracao.id,
      nome: configuracao.nome,
      descricao: configuracao.descricao,
      segunda: configuracao.segunda,
      terca: configuracao.terca,
      quarta: configuracao.quarta,
      quinta: configuracao.quinta,
      sexta: configuracao.sexta,
      sabado: configuracao.sabado,
      domingo: configuracao.domingo,
      geral: configuracao.geral,
      ativo: configuracao.ativo,
      created_at: configuracao.created_at,
      updated_at: configuracao.updated_at,
      plantas: configuracao.configuracao_plantas?.map((cp: any) => cp.plantas) || [],
      total_plantas: configuracao.geral ? null : configuracao._count?.configuracao_plantas || 0,
      total_dias_uteis: diasUteisCount,
      dias_uteis_semana: diasUteis
    };
  }
}