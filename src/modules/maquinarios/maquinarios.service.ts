// src/modules/maquinarios/maquinarios.service.ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, type maquinarios } from '@/core';
import { RUBRICAS } from '../recursos/regras-do-recurso';
import { CreateMaquinarioDto, QueryMaquinariosDto, UpdateMaquinarioDto } from './dto/maquinario.dto';
import { BASES, RUBRICA_PADRAO, TIPOS, custoApuradoDoMaquinario, normalizarMaquinario, type Tipo } from './regras-do-maquinario';

/** O maquinário como a tela e a planilha o leem: com o custo apurado e de onde ele sai */
export const comCustoDoMaquinario = (m: maquinarios) => ({ ...m, ...custoApuradoDoMaquinario(m) });

/**
 * Cadastro de maquinários, como o do AupusProject (SN-84): a máquina que uma
 * instrução usa (betoneira, munck, gerador). Não é recurso: cadastro e tela
 * próprios, a mesma regra de custo do instrumento.
 */
@Injectable()
export class MaquinariosService {
  constructor(private readonly prisma: PrismaService) {}

  catalogo() {
    return { tipos: TIPOS, bases: BASES, rubricas: RUBRICAS, rubrica_padrao: RUBRICA_PADRAO };
  }

  async listar(query: QueryMaquinariosDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where: Prisma.maquinariosWhereInput = { deleted_at: null };
    if (query.tipo) where.tipo = query.tipo;
    if (query.apenas_ativos) where.ativo = true;
    if (query.search) where.nome = { contains: query.search, mode: 'insensitive' };

    const [total, linhas] = await Promise.all([
      this.prisma.maquinarios.count({ where }),
      this.prisma.maquinarios.findMany({
        where,
        // O id desempata: sem ele, nomes iguais deixam a ordem instável entre as páginas
        orderBy: [{ nome: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { data: linhas.map(comCustoDoMaquinario), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } };
  }

  async buscarPorId(id: string) {
    const maquinario = await this.prisma.maquinarios.findFirst({ where: { id: id?.trim(), deleted_at: null } });
    if (!maquinario) throw new NotFoundException('Maquinário não encontrado');
    return maquinario;
  }

  async detalhar(id: string) {
    return comCustoDoMaquinario(await this.buscarPorId(id));
  }

  async criar(dto: CreateMaquinarioDto) {
    await this.recusarNomeRepetido(dto.nome);
    const regra = normalizarMaquinario({ tipo: dto.tipo as Tipo, base_calculo: dto.base_calculo, rubrica: dto.rubrica });
    return comCustoDoMaquinario(
      await this.prisma.maquinarios.create({
        data: {
          nome: dto.nome,
          tipo: dto.tipo,
          descricao: dto.descricao ?? null,
          base_calculo: regra.base_calculo!,
          rubrica: regra.rubrica!,
          preco_unitario: dto.preco_unitario ?? null,
          valor_aquisicao: dto.valor_aquisicao ?? null,
          prazo_retorno_meses: dto.prazo_retorno_meses ?? null,
          custos_anuais: dto.custos_anuais ?? 0,
          meta_utilizacao_horas: dto.meta_utilizacao_horas ?? null,
          horas_por_diaria: dto.horas_por_diaria ?? 8,
          ativo: dto.ativo ?? true,
        },
      }),
    );
  }

  async atualizar(id: string, dto: UpdateMaquinarioDto) {
    // O IsOptional do PartialType deixa passar o null: o banco recusaria com 500
    for (const campo of ['nome', 'tipo', 'ativo'] as const) {
      if (dto[campo] === null) throw new BadRequestException(`O campo ${campo} não pode ficar vazio`);
    }
    const atual = await this.buscarPorId(id);
    if (dto.nome !== undefined) await this.recusarNomeRepetido(dto.nome, atual.id);

    const tipo = (dto.tipo ?? atual.tipo) as Tipo;
    const mudouTipo = dto.tipo !== undefined && dto.tipo !== atual.tipo;
    const regra = normalizarMaquinario({
      tipo,
      base_calculo: dto.base_calculo ?? atual.base_calculo,
      // Mudou o tipo sem dizer a rubrica: vale a do novo (locação é terceirizado)
      rubrica: dto.rubrica ?? (mudouTipo ? undefined : atual.rubrica),
    });

    return comCustoDoMaquinario(
      await this.prisma.maquinarios.update({
        where: { id: atual.id },
        data: {
          ...(dto.nome !== undefined && { nome: dto.nome }),
          tipo,
          ...(dto.descricao !== undefined && { descricao: dto.descricao ?? null }),
          base_calculo: regra.base_calculo!,
          rubrica: regra.rubrica!,
          ...(dto.preco_unitario !== undefined && { preco_unitario: dto.preco_unitario ?? null }),
          ...(dto.valor_aquisicao !== undefined && { valor_aquisicao: dto.valor_aquisicao ?? null }),
          ...(dto.prazo_retorno_meses !== undefined && { prazo_retorno_meses: dto.prazo_retorno_meses ?? null }),
          ...(dto.custos_anuais !== undefined && { custos_anuais: dto.custos_anuais ?? 0 }),
          ...(dto.meta_utilizacao_horas !== undefined && { meta_utilizacao_horas: dto.meta_utilizacao_horas ?? null }),
          ...(dto.horas_por_diaria !== undefined && { horas_por_diaria: dto.horas_por_diaria ?? 8 }),
          ...(dto.ativo !== undefined && { ativo: dto.ativo }),
        },
      }),
    );
  }

  /**
   * Remover é exclusão lógica. Enquanto nenhuma instrução usa maquinário (o
   * vínculo chega no SN-85), não há o que bloquear; depois, o mesmo bloqueio do
   * recurso: em uso, desativa.
   */
  async remover(id: string) {
    const maquinario = await this.buscarPorId(id);
    await this.prisma.maquinarios.update({ where: { id: maquinario.id }, data: { deleted_at: new Date(), ativo: false } });
    return { message: 'Maquinário removido com sucesso' };
  }

  /**
   * O índice único parcial em lower(nome) dá o erro cru do Postgres; isto dá a
   * mensagem. Por lower(), não pelo `mode: 'insensitive'` do Prisma: ele vira
   * ILIKE sem escape, e "_" ou "%" no nome casavam com outro (conflito falso).
   */
  private async recusarNomeRepetido(nome: string, ignorarId?: string) {
    const [existente] = await this.prisma.$queryRaw<{ nome: string }[]>`
      SELECT nome FROM maquinarios
       WHERE lower(nome) = lower(${nome?.trim() ?? ''}) AND deleted_at IS NULL
         -- trim: o id de 25 caracteres no Char(26) vem com espaço, e o próprio registro contava como repetido
         ${ignorarId ? Prisma.sql`AND trim(id) <> ${ignorarId.trim()}` : Prisma.empty}
       LIMIT 1`;
    if (existente) throw new ConflictException(`Já existe um maquinário chamado "${existente.nome}".`);
  }
}
