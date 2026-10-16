import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@/core';
import {
  CreateFeriadoDto,
  UpdateFeriadoDto,
  QueryFeriadosDto,
  FeriadoResponseDto,
  AssociarPlantasDto,
  PlantaResumoDto
} from './dto';
import { Prisma } from '@/core';
import type { feriados } from '@prisma/client';

/** Feriado como `listar` e `buscarPorId` o leem: com as plantas e a contagem. */
type FeriadoLido = feriados & {
  feriado_plantas?: { plantas: PlantaResumoDto | null }[];
  _count?: { feriado_plantas?: number };
};

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

  /**
   * O ano (e o mês) do filtro. O recorrente vale todo ano no mesmo dia e mês,
   * mas fica gravado com o ano em que foi cadastrado: pelo intervalo do ano só,
   * o Natal de 2024 sumia de 2026. O fim do mês é o dia 1 do seguinte (o dia 31
   * fixo levava abril até 01/05). Mês sem ano é recusado, em vez de ignorado.
   */
  private async periodoDoFiltro(ano?: number, mes?: number): Promise<Prisma.feriadosWhereInput | null> {
    if (mes && !ano) throw new BadRequestException('Para filtrar por mês, escolha também o ano');
    if (!ano) return null;
    const de = new Date(Date.UTC(ano, mes ? mes - 1 : 0, 1));
    const ate = new Date(Date.UTC(mes ? ano : ano + 1, mes ? mes : 0, 1));
    const doPeriodo: Prisma.feriadosWhereInput = { data: { gte: de, lt: ate } };
    if (!mes) return { OR: [doPeriodo, { recorrente: true }] };
    const recorrentesDoMes = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM feriados WHERE recorrente = true AND EXTRACT(MONTH FROM data) = ${mes}`;
    return { OR: [doPeriodo, { id: { in: recorrentesDoMes.map((f) => f.id) } }] };
  }

  async buscarTodos(queryDto: QueryFeriadosDto): Promise<PaginatedResponse<FeriadoResponseDto>> {
    const { page, limit, search, tipo, plantaId, ano, mes, geral, recorrente, orderBy, orderDirection } = queryDto;

    const skip = (page - 1) * limit;

    // Construir filtros. Busca, planta e período são OR cada um: no AND, para
    // um não apagar o outro (com a planta escolhida, a busca sumia calada)
    const e: Prisma.feriadosWhereInput[] = [];
    if (search) {
      e.push({ OR: [{ nome: { contains: search, mode: 'insensitive' } }, { descricao: { contains: search, mode: 'insensitive' } }] });
    }
    if (plantaId) e.push({ OR: [{ geral: true }, { feriado_plantas: { some: { planta_id: plantaId } } }] });
    const periodo = await this.periodoDoFiltro(ano, mes);
    if (periodo) e.push(periodo);

    const where: Prisma.feriadosWhereInput = {
      ativo: true,
      ...(tipo && { tipo }),
      ...(geral !== undefined && { geral }),
      ...(recorrente !== undefined && { recorrente }),
      ...(e.length && { AND: e }),
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

      // Recriar relacionamentos se necessário. Sem o geral no corpo vale o
      // gravado: PUT parcial só com as plantas (SN-12).
      const geral = updateDto.geral ?? feriadoExistente.geral;
      if (!geral && updateDto.plantaIds?.length) {
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

  private mapearParaResponse(feriado: FeriadoLido): FeriadoResponseDto {
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
      plantas: feriado.feriado_plantas?.map((fp) => fp.plantas) || [],
      total_plantas: feriado.geral ? null : feriado._count?.feriado_plantas || 0
    };
  }
}