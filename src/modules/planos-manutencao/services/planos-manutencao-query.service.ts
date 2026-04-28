// src/modules/planos-manutencao/services/planos-manutencao-query.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@aupus/api-shared';
import { Prisma } from '@aupus/api-shared';
import {
  QueryPlanosDto,
  QueryPlanosPorPlantaDto,
  PlanoManutencaoResponseDto
} from '../dto';
import { PlanosManutencaoValidators } from '../helpers/planos-manutencao.validators';
import { PlanosQueryBuilder } from '../builders/planos-query.builder';
import { PlanosIncludeBuilder } from '../builders/planos-include.builder';
import { PlanosManutencaoMapper } from './planos-manutencao.mapper';

interface PaginatedResponse {
  data: PlanoManutencaoResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class PlanosManutencaoQueryService {
  private validators: PlanosManutencaoValidators;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: PlanosManutencaoMapper
  ) {
    this.validators = new PlanosManutencaoValidators(prisma);
  }

  async listar(queryDto: QueryPlanosDto): Promise<PaginatedResponse> {
    const { page, limit, search, sort_by, sort_order, ...filters } = queryDto;
    const skip = (page - 1) * limit;

    // Construir filtros e ordenação usando builders
    const where: Prisma.planos_manutencaoWhereInput = {
      deleted_at: null,
      ...PlanosQueryBuilder.construirFiltros(filters, search)
    };

    const orderBy = PlanosQueryBuilder.construirOrdenacao(sort_by, sort_order);

    const [planos, total] = await Promise.all([
      this.prisma.planos_manutencao.findMany({
        where,
        include: PlanosIncludeBuilder.comContagemTarefas(),
        orderBy,
        skip,
        take: limit
      }),
      this.prisma.planos_manutencao.count({ where })
    ]);

    return {
      data: planos.map(plano => this.mapper.mapearParaResponse(plano)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async buscarPorEquipamento(equipamentoId: string): Promise<PlanoManutencaoResponseDto> {
    await this.validators.verificarEquipamentoExiste(equipamentoId);

    const plano = await this.prisma.planos_manutencao.findFirst({
      where: {
        equipamento_id: equipamentoId,
        deleted_at: null
      },
      include: PlanosIncludeBuilder.relacionamentosBasicos()
    });

    if (!plano) {
      await this.validators.verificarPlanoExiste(''); // Lança exceção genérica
    }

    return this.mapper.mapearParaResponse(plano);
  }

  async buscarPorPlanta(
    plantaId: string,
    queryDto: QueryPlanosPorPlantaDto
  ): Promise<PaginatedResponse> {
    await this.validators.verificarPlantaExiste(plantaId);

    const { page, limit, status, incluir_tarefas } = queryDto;
    const skip = (page - 1) * limit;

    const where: Prisma.planos_manutencaoWhereInput = {
      deleted_at: null,
      status: status,
      equipamento: {
        deleted_at: null,
        unidade: {
          planta_id: plantaId
        }
      }
    };

    const includeOptions = PlanosIncludeBuilder.porPlantaOuUnidade(incluir_tarefas);

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
      data: planos.map(plano => this.mapper.mapearParaResponse(plano)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async buscarPorUnidade(
    unidadeId: string,
    queryDto: QueryPlanosPorPlantaDto
  ): Promise<PaginatedResponse> {
    await this.validators.verificarUnidadeExiste(unidadeId);

    const { page, limit, status, incluir_tarefas } = queryDto;
    const skip = (page - 1) * limit;

    const where: Prisma.planos_manutencaoWhereInput = {
      deleted_at: null,
      status: status,
      equipamento: {
        deleted_at: null,
        unidade_id: unidadeId
      }
    };

    const includeOptions = PlanosIncludeBuilder.porPlantaOuUnidade(incluir_tarefas);

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
      data: planos.map(plano => this.mapper.mapearParaResponse(plano)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }
}
