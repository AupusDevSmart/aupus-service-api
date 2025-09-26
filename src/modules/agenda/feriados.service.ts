import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  CreateFeriadoDto,
  UpdateFeriadoDto,
  QueryFeriadosDto,
  FeriadoResponseDto,
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
export class FeriadosService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(createDto: CreateFeriadoDto): Promise<FeriadoResponseDto> {
    // Verificar se já existe feriado na mesma data
    const feriadoExistente = await this.prisma.feriados.findFirst({
      where: {
        data: createDto.data,
        ativo: true
      }
    });

    if (feriadoExistente) {
      throw new ConflictException(`Já existe um feriado na data ${createDto.data.toISOString().split('T')[0]}`);
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

    // Transação para criar feriado e relacionamentos
    const feriado = await this.prisma.$transaction(async (tx) => {
      const novoFeriado = await tx.feriados.create({
        data: {
          nome: createDto.nome,
          data: createDto.data,
          tipo: createDto.tipo,
          geral: createDto.geral || false,
          recorrente: createDto.recorrente || false,
          descricao: createDto.descricao,
          ativo: true
        }
      });

      // Criar relacionamentos com plantas se não for geral
      if (!createDto.geral && createDto.plantaIds?.length) {
        await tx.feriado_plantas.createMany({
          data: createDto.plantaIds.map(plantaId => ({
            feriado_id: novoFeriado.id,
            planta_id: plantaId
          }))
        });
      }

      return novoFeriado;
    });

    return this.buscarPorId(feriado.id);
  }

  async buscarTodos(queryDto: QueryFeriadosDto): Promise<PaginatedResponse<FeriadoResponseDto>> {
    const { page, limit, search, tipo, plantaId, ano, mes, geral, recorrente, orderBy, orderDirection } = queryDto;

    const skip = (page - 1) * limit;

    // Construir filtros
    const where: Prisma.feriadosWhereInput = {
      ativo: true,
      ...(search && {
        OR: [
          { nome: { contains: search, mode: 'insensitive' } },
          { descricao: { contains: search, mode: 'insensitive' } }
        ]
      }),
      ...(tipo && { tipo }),
      ...(geral !== undefined && { geral }),
      ...(recorrente !== undefined && { recorrente }),
      ...(ano && {
        data: {
          gte: new Date(`${ano}-01-01`),
          lte: new Date(`${ano}-12-31`)
        }
      }),
      ...(mes && ano && {
        data: {
          gte: new Date(`${ano}-${mes.toString().padStart(2, '0')}-01`),
          lte: new Date(`${ano}-${mes.toString().padStart(2, '0')}-31`)
        }
      }),
      ...(plantaId && {
        OR: [
          { geral: true },
          { feriado_plantas: { some: { planta_id: plantaId } } }
        ]
      })
    };

    // Ordenação
    const orderByClause = this.buildOrderBy(orderBy, orderDirection);

    // Buscar dados
    const [feriados, total] = await Promise.all([
      this.prisma.feriados.findMany({
        where,
        include: {
          feriado_plantas: {
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
              feriado_plantas: true
            }
          }
        },
        orderBy: orderByClause,
        skip,
        take: limit
      }),
      this.prisma.feriados.count({ where })
    ]);

    return {
      data: feriados.map(feriado => this.mapearParaResponse(feriado)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async buscarPorId(id: string): Promise<FeriadoResponseDto> {
    const feriado = await this.prisma.feriados.findUnique({
      where: { id },
      include: {
        feriado_plantas: {
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
            feriado_plantas: true
          }
        }
      }
    });

    if (!feriado) {
      throw new NotFoundException(`Feriado com ID ${id} não encontrado`);
    }

    return this.mapearParaResponse(feriado);
  }

  async atualizar(id: string, updateDto: UpdateFeriadoDto): Promise<FeriadoResponseDto> {
    const feriadoExistente = await this.prisma.feriados.findUnique({
      where: { id }
    });

    if (!feriadoExistente) {
      throw new NotFoundException(`Feriado com ID ${id} não encontrado`);
    }

    // Verificar conflito de data se estiver sendo alterada
    if (updateDto.data && updateDto.data.getTime() !== feriadoExistente.data.getTime()) {
      const conflito = await this.prisma.feriados.findFirst({
        where: {
          data: updateDto.data,
          id: { not: id },
          ativo: true
        }
      });

      if (conflito) {
        throw new ConflictException(`Já existe um feriado na data ${updateDto.data.toISOString().split('T')[0]}`);
      }
    }

    // Se mudando de/para geral, limpar relacionamentos existentes
    if (updateDto.geral !== undefined && updateDto.geral !== feriadoExistente.geral) {
      await this.prisma.feriado_plantas.deleteMany({
        where: { feriado_id: id }
      });
    }

    // Transação para atualizar
    const feriado = await this.prisma.$transaction(async (tx) => {
      const feriadoAtualizado = await tx.feriados.update({
        where: { id },
        data: {
          nome: updateDto.nome,
          data: updateDto.data,
          tipo: updateDto.tipo,
          geral: updateDto.geral,
          recorrente: updateDto.recorrente,
          descricao: updateDto.descricao
        }
      });

      // Recriar relacionamentos se necessário
      if (updateDto.geral === false && updateDto.plantaIds?.length) {
        await tx.feriado_plantas.deleteMany({
          where: { feriado_id: id }
        });

        await tx.feriado_plantas.createMany({
          data: updateDto.plantaIds.map(plantaId => ({
            feriado_id: id,
            planta_id: plantaId
          }))
        });
      }

      return feriadoAtualizado;
    });

    return this.buscarPorId(feriado.id);
  }

  async remover(id: string): Promise<void> {
    const feriado = await this.prisma.feriados.findUnique({
      where: { id }
    });

    if (!feriado) {
      throw new NotFoundException(`Feriado com ID ${id} não encontrado`);
    }

    await this.prisma.feriados.update({
      where: { id },
      data: { ativo: false }
    });
  }

  async associarPlantas(id: string, associarDto: AssociarPlantasDto): Promise<FeriadoResponseDto> {
    const feriado = await this.prisma.feriados.findUnique({
      where: { id }
    });

    if (!feriado) {
      throw new NotFoundException(`Feriado com ID ${id} não encontrado`);
    }

    if (feriado.geral) {
      throw new BadRequestException('Não é possível associar plantas a um feriado geral');
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
      await tx.feriado_plantas.deleteMany({
        where: { feriado_id: id }
      });

      await tx.feriado_plantas.createMany({
        data: associarDto.plantaIds.map(plantaId => ({
          feriado_id: id,
          planta_id: plantaId
        }))
      });
    });

    return this.buscarPorId(id);
  }

  async desassociarPlanta(id: string, plantaId: string): Promise<void> {
    const feriado = await this.prisma.feriados.findUnique({
      where: { id }
    });

    if (!feriado) {
      throw new NotFoundException(`Feriado com ID ${id} não encontrado`);
    }

    if (feriado.geral) {
      throw new BadRequestException('Não é possível desassociar plantas de um feriado geral');
    }

    await this.prisma.feriado_plantas.deleteMany({
      where: {
        feriado_id: id,
        planta_id: plantaId
      }
    });
  }

  async verificarFeriado(data: Date, plantaId?: string): Promise<boolean> {
    const where: Prisma.feriadosWhereInput = {
      data: data,
      ativo: true,
      OR: [
        { geral: true },
        ...(plantaId ? [{
          geral: false,
          feriado_plantas: {
            some: { planta_id: plantaId }
          }
        }] : [])
      ]
    };

    const feriado = await this.prisma.feriados.findFirst({ where });
    return !!feriado;
  }

  private buildOrderBy(orderBy?: string, orderDirection?: 'asc' | 'desc') {
    const direction = orderDirection || 'asc';

    switch (orderBy) {
      case 'nome':
        return { nome: direction };
      case 'tipo':
        return { tipo: direction };
      case 'created_at':
        return { created_at: direction };
      case 'data':
      default:
        return { data: direction };
    }
  }

  private mapearParaResponse(feriado: any): FeriadoResponseDto {
    return {
      id: feriado.id,
      nome: feriado.nome,
      data: feriado.data,
      tipo: feriado.tipo,
      geral: feriado.geral,
      recorrente: feriado.recorrente,
      descricao: feriado.descricao,
      ativo: feriado.ativo,
      created_at: feriado.created_at,
      updated_at: feriado.updated_at,
      plantas: feriado.feriado_plantas?.map((fp: any) => fp.plantas) || [],
      total_plantas: feriado.geral ? null : feriado._count?.feriado_plantas || 0
    };
  }
}