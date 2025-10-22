import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class TiposEquipamentosService {
  constructor(private prisma: PrismaService) {}

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
}
