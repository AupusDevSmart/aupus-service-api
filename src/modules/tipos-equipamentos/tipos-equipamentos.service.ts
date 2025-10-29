import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

export interface CampoTecnico {
  campo: string;
  tipo: 'number' | 'text' | 'date' | 'select';
  unidade?: string;
  obrigatorio?: boolean;
  valor_padrao?: any;
  opcoes?: string[];
  descricao?: string;
}

export interface PropriedadesSchema {
  campos: CampoTecnico[];
}

@Injectable()
export class TiposEquipamentosService {
  constructor(private prisma: PrismaService) {}

  /**
   * Busca todos os tipos de equipamentos
   * Pode filtrar por categoria e pesquisar por nome/código
   */
  async findAll(categoria?: string, search?: string) {
    // Construir filtros
    const where: any = {};

    if (categoria) {
      where.categoria = categoria;
    }

    if (search) {
      where.OR = [
        { codigo: { contains: search, mode: 'insensitive' } },
        { nome: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Buscar tipos de equipamentos
    const tipos = await this.prisma.tipos_equipamentos.findMany({
      where,
      orderBy: [
        { categoria: 'asc' },
        { nome: 'asc' },
      ],
    });

    // Contar por categoria
    const categorias = await this.prisma.tipos_equipamentos.groupBy({
      by: ['categoria'],
      _count: {
        id: true,
      },
      orderBy: {
        categoria: 'asc',
      },
    });

    return {
      data: tipos.map((tipo) => ({
        id: tipo.id,
        codigo: tipo.codigo,
        nome: tipo.nome,
        categoria: tipo.categoria,
        larguraPadrao: tipo.largura_padrao,
        alturaPadrao: tipo.altura_padrao,
        iconeSvg: tipo.icone_svg,
        propriedadesSchema: tipo.propriedades_schema,
        createdAt: tipo.created_at,
        updatedAt: tipo.updated_at,
      })),
      meta: {
        total: tipos.length,
        categorias: categorias.map((cat) => ({
          categoria: cat.categoria,
          total: cat._count.id,
        })),
      },
    };
  }

  /**
   * Busca um tipo de equipamento por ID
   */
  async findOne(id: string) {
    const tipo = await this.prisma.tipos_equipamentos.findUnique({
      where: { id },
    });

    if (!tipo) {
      return null;
    }

    return {
      id: tipo.id,
      codigo: tipo.codigo,
      nome: tipo.nome,
      categoria: tipo.categoria,
      larguraPadrao: tipo.largura_padrao,
      alturaPadrao: tipo.altura_padrao,
      iconeSvg: tipo.icone_svg,
      propriedadesSchema: tipo.propriedades_schema,
      createdAt: tipo.created_at,
      updatedAt: tipo.updated_at,
    };
  }

  /**
   * Busca um tipo de equipamento por código
   */
  async findByCode(codigo: string) {
    const tipo = await this.prisma.tipos_equipamentos.findUnique({
      where: { codigo },
    });

    if (!tipo) {
      return null;
    }

    return {
      id: tipo.id,
      codigo: tipo.codigo,
      nome: tipo.nome,
      categoria: tipo.categoria,
      larguraPadrao: tipo.largura_padrao,
      alturaPadrao: tipo.altura_padrao,
      iconeSvg: tipo.icone_svg,
      propriedadesSchema: tipo.propriedades_schema,
      createdAt: tipo.created_at,
      updatedAt: tipo.updated_at,
    };
  }

  /**
   * Retorna os campos técnicos padrão para um tipo de equipamento
   */
  async getCamposTecnicos(id: string): Promise<CampoTecnico[]> {
    const tipo = await this.prisma.tipos_equipamentos.findUnique({
      where: { id },
      select: { propriedades_schema: true },
    });

    if (!tipo || !tipo.propriedades_schema) {
      return [];
    }

    const schema = tipo.propriedades_schema as unknown as PropriedadesSchema;
    return schema.campos || [];
  }

  /**
   * Retorna os campos técnicos padrão para um tipo de equipamento por código
   */
  async getCamposTecnicosByCode(codigo: string): Promise<CampoTecnico[]> {
    const tipo = await this.prisma.tipos_equipamentos.findUnique({
      where: { codigo },
      select: { propriedades_schema: true },
    });

    if (!tipo || !tipo.propriedades_schema) {
      return [];
    }

    const schema = tipo.propriedades_schema as unknown as PropriedadesSchema;
    return schema.campos || [];
  }

  /**
   * Retorna todas as categorias disponíveis
   */
  async getCategorias() {
    const categorias = await this.prisma.tipos_equipamentos.groupBy({
      by: ['categoria'],
      _count: {
        id: true,
      },
      orderBy: {
        categoria: 'asc',
      },
    });

    return categorias.map((cat) => ({
      categoria: cat.categoria,
      total: cat._count.id,
    }));
  }

  /**
   * Retorna estatísticas sobre os tipos de equipamentos
   */
  async getEstatisticas() {
    const [total, porCategoria] = await Promise.all([
      this.prisma.tipos_equipamentos.count(),
      this.prisma.tipos_equipamentos.groupBy({
        by: ['categoria'],
        _count: {
          id: true,
        },
        orderBy: {
          categoria: 'asc',
        },
      }),
    ]);

    return {
      total,
      categorias: porCategoria.map((cat) => ({
        categoria: cat.categoria,
        total: cat._count.id,
      })),
    };
  }
}
