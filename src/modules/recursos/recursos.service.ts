// src/modules/recursos/recursos.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@/core';
import {
  CreateRecursoDto,
  UpdateRecursoDto,
  QueryRecursosDto,
  CategoriaRecurso,
} from './dto/recurso.dto';

/**
 * Catálogo de recursos.
 *
 * O que se usa para executar uma instrução — peça, material, ferramenta,
 * técnico, viatura — deixou de ser texto redigitado a cada vez e virou cadastro
 * com custo médio, que é o que permite orçar.
 */
@Injectable()
export class RecursosService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(query: QueryRecursosDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const where: any = { deleted_at: null };

    if (query.categoria) where.categoria = query.categoria;
    if (query.apenas_ativos) where.ativo = true;

    if (query.search) {
      where.nome = { contains: query.search, mode: 'insensitive' };
    }

    const [total, recursos] = await Promise.all([
      this.prisma.recursos.count({ where }),
      this.prisma.recursos.findMany({
        where,
        // O id desempata: sem ele, nomes iguais deixam a ordem instável entre
        // requisições e as páginas se sobrepõem no OFFSET.
        orderBy: [{ nome: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: recursos,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async buscarPorId(id: string) {
    const recurso = await this.prisma.recursos.findFirst({
      where: { id: id?.trim(), deleted_at: null },
    });

    if (!recurso) {
      throw new NotFoundException('Recurso não encontrado');
    }

    return recurso;
  }

  async criar(dto: CreateRecursoDto) {
    await this.recusarNomeRepetido(dto.categoria, dto.nome);

    return this.prisma.recursos.create({
      data: {
        categoria: dto.categoria,
        nome: dto.nome,
        unidade: dto.unidade ?? null,
        preco_medio: dto.preco_medio ?? null,
        ativo: dto.ativo ?? true,
      },
    });
  }

  async atualizar(id: string, dto: UpdateRecursoDto) {
    const recurso = await this.buscarPorId(id);

    const categoria = dto.categoria ?? (recurso.categoria as CategoriaRecurso);
    const nome = dto.nome ?? recurso.nome;

    if (dto.categoria !== undefined || dto.nome !== undefined) {
      await this.recusarNomeRepetido(categoria, nome, recurso.id);
    }

    return this.prisma.recursos.update({
      where: { id: recurso.id },
      data: {
        ...(dto.categoria !== undefined && { categoria: dto.categoria }),
        ...(dto.nome !== undefined && { nome: dto.nome }),
        ...(dto.unidade !== undefined && { unidade: dto.unidade ?? null }),
        ...(dto.preco_medio !== undefined && { preco_medio: dto.preco_medio ?? null }),
        ...(dto.ativo !== undefined && { ativo: dto.ativo }),
      },
    });
  }

  /**
   * Remover é bloqueado enquanto alguma instrução usar o recurso.
   *
   * A alternativa seria deixar remover e a FK zerar a referência, mas aí a
   * instrução perderia em silêncio o que estava orçado. Quem quer tirar de
   * circulação sem apagar histórico desativa — é o caminho normal.
   */
  async remover(id: string) {
    const recurso = await this.buscarPorId(id);

    const usos = await this.prisma.recursos_instrucao.count({
      where: { recurso_id: recurso.id },
    });

    if (usos > 0) {
      throw new BadRequestException(
        `Este recurso está em uso em ${usos} ${usos === 1 ? 'instrução' : 'instruções'}. ` +
          'Desative-o em vez de remover, ou troque o recurso nessas instruções antes.',
      );
    }

    await this.prisma.recursos.update({
      where: { id: recurso.id },
      data: { deleted_at: new Date(), ativo: false },
    });

    return { message: 'Recurso removido com sucesso' };
  }

  /**
   * O banco tem um índice único parcial em (categoria, lower(nome)) para os não
   * removidos. Esta checagem existe para a mensagem: sem ela o usuário receberia
   * o erro cru do Postgres.
   */
  private async recusarNomeRepetido(
    categoria: CategoriaRecurso,
    nome: string,
    ignorarId?: string,
  ) {
    const existente = await this.prisma.recursos.findFirst({
      where: {
        categoria,
        nome: { equals: nome?.trim(), mode: 'insensitive' },
        deleted_at: null,
        ...(ignorarId ? { id: { not: ignorarId } } : {}),
      },
      select: { nome: true },
    });

    if (existente) {
      throw new ConflictException(
        `Já existe um recurso chamado "${existente.nome}" nesta categoria.`,
      );
    }
  }
}
