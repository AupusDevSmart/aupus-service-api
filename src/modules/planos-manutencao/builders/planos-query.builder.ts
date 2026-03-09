// src/modules/planos-manutencao/builders/planos-query.builder.ts
import { Prisma } from '@prisma/client';
import { QueryPlanosDto } from '../dto';

export class PlanosQueryBuilder {
  /**
   * Constrói filtros WHERE para queries de planos
   */
  static construirFiltros(filters: Partial<QueryPlanosDto>, search?: string): Prisma.planos_manutencaoWhereInput {
    const where: Prisma.planos_manutencaoWhereInput = {};

    if (filters.equipamento_id) {
      where.equipamento_id = filters.equipamento_id;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.ativo !== undefined) {
      where.ativo = filters.ativo;
    }

    if (search) {
      where.OR = [
        { nome: { contains: search, mode: 'insensitive' } },
        { descricao: { contains: search, mode: 'insensitive' } }
      ];
    }

    return where;
  }

  /**
   * Constrói ordenação para queries de planos
   */
  static construirOrdenacao(
    sortBy?: string,
    sortOrder: 'asc' | 'desc' = 'desc'
  ): Prisma.planos_manutencaoOrderByWithRelationInput {
    const orderBy: Prisma.planos_manutencaoOrderByWithRelationInput = {};

    switch (sortBy) {
      case 'nome':
        orderBy.nome = sortOrder;
        break;
      case 'equipamento':
        orderBy.equipamento_id = sortOrder;
        break;
      case 'status':
        orderBy.status = sortOrder;
        break;
      case 'updated_at':
        orderBy.updated_at = sortOrder;
        break;
      default:
        orderBy.created_at = sortOrder;
    }

    return orderBy;
  }
}
