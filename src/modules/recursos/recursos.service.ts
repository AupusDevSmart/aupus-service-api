// src/modules/recursos/recursos.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, PrismaService, type recursos } from '@/core';
import {
  CreateRecursoDto,
  UpdateRecursoDto,
  QueryRecursosDto,
  CategoriaRecurso,
} from './dto/recurso.dto';
import {
  BASES,
  BASES_POR_CATEGORIA,
  CATEGORIAS,
  RUBRICAS,
  RUBRICA_PADRAO,
  baseValeNaCategoria,
  custoApurado,
  normalizarRecurso,
  type Categoria,
} from './regras-do-recurso';

/**
 * O recurso como a tela e a planilha o leem: com o custo apurado, de onde ele
 * sai e as bases que a categoria aceita (a tela não espelha a regra)
 */
export const comCusto = (r: recursos) => ({
  ...r,
  ...custoApurado(r),
  bases_disponiveis: BASES_POR_CATEGORIA[r.categoria as Categoria] ?? [],
});

/**
 * Catálogo de recursos.
 *
 * O que se usa para executar uma instrução — mão de obra, material,
 * instrumento, veículo, terceiro, despesa de campo — deixou de ser texto
 * redigitado a cada vez e virou cadastro com preço, que é o que permite orçar.
 * Os campos e as regras são os do AupusProject (SN-83, `regras-do-recurso.ts`).
 */
@Injectable()
export class RecursosService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(query: QueryRecursosDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const where: Prisma.recursosWhereInput = { deleted_at: null };

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
      data: recursos.map(comCusto),
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

  /** As listas do formulário, da mesma regra que valida a gravação */
  catalogo() {
    return { categorias: CATEGORIAS, bases: BASES, bases_por_categoria: BASES_POR_CATEGORIA, rubricas: RUBRICAS, rubrica_padrao: RUBRICA_PADRAO };
  }

  /** Com o custo apurado: o que a rota devolve */
  async detalhar(id: string) {
    return comCusto(await this.buscarPorId(id));
  }

  async criar(dto: CreateRecursoDto) {
    await this.recusarNomeRepetido(dto.categoria, dto.nome);
    this.recusarBaseForaDaCategoria(dto.categoria as Categoria, dto.base_calculo);

    // Base e rubrica no padrão da categoria quando vêm vazias ou fora dela, e
    // os campos que não são da categoria limpos (como no AupusProject)
    const dados = normalizarRecurso({
      ...dto,
      categoria: dto.categoria as Categoria,
      horas_por_diaria: dto.horas_por_diaria ?? 8,
      custos_anuais: dto.custos_anuais ?? 0,
    });
    return comCusto(
      await this.prisma.recursos.create({
        data: {
          categoria: dados.categoria,
          nome: dto.nome,
          funcao: dados.funcao ?? null,
          descricao: dto.descricao ?? null,
          unidade: dto.unidade ?? null,
          base_calculo: dados.base_calculo!,
          rubrica: dados.rubrica!,
          preco_unitario: dto.preco_unitario ?? null,
          valor_aquisicao: dados.valor_aquisicao ?? null,
          prazo_retorno_meses: dados.prazo_retorno_meses ?? null,
          custos_anuais: dados.custos_anuais ?? 0,
          meta_utilizacao_horas: dados.meta_utilizacao_horas ?? null,
          horas_por_diaria: dados.horas_por_diaria ?? 8,
          ativo: dto.ativo ?? true,
        },
      }),
    );
  }

  async atualizar(id: string, dto: UpdateRecursoDto) {
    // O IsOptional do PartialType deixa passar o null: sem categoria o recurso não existe
    if (dto.categoria === null) throw new BadRequestException('Categoria é obrigatória');
    if (dto.ativo === null) throw new BadRequestException('O campo ativo não pode ficar vazio');
    const recurso = await this.buscarPorId(id);

    const categoria = dto.categoria ?? (recurso.categoria as CategoriaRecurso);
    const nome = dto.nome ?? recurso.nome;

    if (dto.categoria !== undefined || dto.nome !== undefined) {
      await this.recusarNomeRepetido(categoria, nome, recurso.id);
    }

    // A base pedida tem de valer na categoria (a nova, se mudou): fora dela é recusa
    this.recusarBaseForaDaCategoria(categoria as Categoria, dto.base_calculo);

    // O registro inteiro (o pedido sobre o gravado) passa pela regra: trocar a
    // categoria para material tem de limpar a aquisição que o instrumento tinha
    const num = (v: Prisma.Decimal | null) => (v === null ? null : v.toNumber());
    const vale = <K extends keyof UpdateRecursoDto>(campo: K, gravado: UpdateRecursoDto[K]) =>
      dto[campo] !== undefined ? dto[campo] : gravado;
    // Base e rubrica vazias mantêm as gravadas (célula vazia na planilha não troca a cobrança).
    // Trocada a categoria, a base gravada fica se valer na nova; senão, o padrão dela
    const baseGravada = baseValeNaCategoria(categoria as Categoria, recurso.base_calculo) ? recurso.base_calculo : undefined;
    const dados = normalizarRecurso({
      categoria: categoria as Categoria,
      base_calculo: dto.base_calculo || baseGravada,
      rubrica: dto.rubrica || recurso.rubrica,
      funcao: vale('funcao', recurso.funcao),
      valor_aquisicao: vale('valor_aquisicao', num(recurso.valor_aquisicao)),
      prazo_retorno_meses: vale('prazo_retorno_meses', recurso.prazo_retorno_meses),
      custos_anuais: vale('custos_anuais', num(recurso.custos_anuais)),
      meta_utilizacao_horas: vale('meta_utilizacao_horas', num(recurso.meta_utilizacao_horas)),
    });

    return comCusto(
      await this.prisma.recursos.update({
        where: { id: recurso.id },
        data: {
          categoria: dados.categoria,
          nome,
          funcao: dados.funcao ?? null,
          ...(dto.descricao !== undefined && { descricao: dto.descricao ?? null }),
          ...(dto.unidade !== undefined && { unidade: dto.unidade ?? null }),
          base_calculo: dados.base_calculo!,
          rubrica: dados.rubrica!,
          ...(dto.preco_unitario !== undefined && { preco_unitario: dto.preco_unitario ?? null }),
          valor_aquisicao: dados.valor_aquisicao ?? null,
          prazo_retorno_meses: dados.prazo_retorno_meses ?? null,
          custos_anuais: dados.custos_anuais ?? 0,
          meta_utilizacao_horas: dados.meta_utilizacao_horas ?? null,
          ...(dto.horas_por_diaria !== undefined && { horas_por_diaria: dto.horas_por_diaria ?? 8 }),
          ...(dto.ativo !== undefined && { ativo: dto.ativo }),
        },
      }),
    );
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
  /** A cobrança pedida tem de valer na categoria (a mesma regra do AupusProject, que responde 422) */
  private recusarBaseForaDaCategoria(categoria: Categoria, base?: string | null) {
    if (base && !baseValeNaCategoria(categoria, base)) {
      throw new BadRequestException('Esta forma de cobrança não vale para a categoria escolhida.');
    }
  }

  /**
   * Por lower(), não pelo `mode: 'insensitive'` do Prisma: ele vira ILIKE sem
   * escape, e "_" ou "%" no nome casavam com outro recurso (409 falso).
   */
  private async recusarNomeRepetido(
    categoria: CategoriaRecurso,
    nome: string,
    ignorarId?: string,
  ) {
    const [existente] = await this.prisma.$queryRaw<{ nome: string }[]>`
      SELECT nome FROM recursos
       WHERE categoria = ${categoria}::"TipoRecurso" AND lower(nome) = lower(${nome?.trim() ?? ''}) AND deleted_at IS NULL
         -- trim: o id de 25 caracteres no Char(26) vem com espaço, e o próprio registro contava como repetido
         ${ignorarId ? Prisma.sql`AND trim(id) <> ${ignorarId.trim()}` : Prisma.empty}
       LIMIT 1`;

    if (existente) {
      throw new ConflictException(
        `Já existe um recurso chamado "${existente.nome}" nesta categoria.`,
      );
    }
  }
}
