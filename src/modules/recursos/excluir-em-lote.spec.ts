import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { PrismaService } from '@/core';
import { exceptionFactoryEmPortugues } from '@/common/pipes/mensagens-validacao';
import { CategoriaRecurso, ExcluirRecursosEmLoteDto, QueryRecursosDto } from './dto/recurso.dto';
import { RecursosService } from './recursos.service';

/**
 * Excluir recursos de uma vez (30/out/2026, pedido do stakeholder: "excluir todos
 * os inativos de uma vez pela tela"): os selecionados ou todos os inativos do
 * filtro. A regra é a do remover um: o que alguma instrução usa fica. Contra
 * Postgres real.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  exceptionFactory: exceptionFactoryEmPortugues,
});
const corpo = <T>(metatype: new () => T, dados: unknown) => pipe.transform(dados, { type: 'body', metatype }) as Promise<T>;

describe('excluir em lote (DTO)', () => {
  it('os selecionados vão até 500; a situação da lista é ATIVO ou INATIVO', async () => {
    await expect(corpo(ExcluirRecursosEmLoteDto, { ids: ['a', 'b'], previa: 'true' })).resolves.toMatchObject({ ids: ['a', 'b'], previa: true });
    await expect(corpo(ExcluirRecursosEmLoteDto, { ids: Array.from({ length: 501 }, (_, i) => `id${i}`) })).rejects.toBeInstanceOf(BadRequestException);
    await expect(corpo(ExcluirRecursosEmLoteDto, { inativos: true, categoria: 'FOGUETE' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({ situacao: 'INATIVO' }, { type: 'query', metatype: QueryRecursosDto })).resolves.toMatchObject({ situacao: 'INATIVO' });
    await expect(pipe.transform({ situacao: 'TALVEZ' }, { type: 'query', metatype: QueryRecursosDto })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('excluir em lote (banco real)', () => {
  const prisma = new PrismaService();
  const recursos = new RecursosService(prisma);
  const PREFIXO = 'TESTE-EXCLUIR-LOTE';
  let instrucao = '';

  const apagar = async () => {
    await prisma.instrucoes.deleteMany({ where: { codigo: { startsWith: PREFIXO } } });
    await prisma.recursos.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
  };
  const novo = (nome: string, categoria: CategoriaRecurso, ativo: boolean) =>
    prisma.recursos.create({ data: { nome: `${PREFIXO} ${nome}`, categoria, base_calculo: 'unidade', rubrica: 'materiais', preco_unitario: 10, ativo } });
  const vivo = async (nome: string) => Boolean(await prisma.recursos.findFirst({ where: { nome: `${PREFIXO} ${nome}`, deleted_at: null } }));

  beforeEach(async () => {
    await apagar();
    await novo('Cabo velho', CategoriaRecurso.MATERIAL, false);
    await novo('Fita velha', CategoriaRecurso.MATERIAL, false);
    await novo('Picape velha', CategoriaRecurso.VEICULO, false);
    await novo('Alicate em uso', CategoriaRecurso.MATERIAL, false);
    await novo('Luva ativa', CategoriaRecurso.MATERIAL, true);
    instrucao = (await prisma.instrucoes.create({ data: { codigo: `${PREFIXO}-A`, nome: 'Usa o alicate', descricao: 'x' } })).id;
    const alicate = await prisma.recursos.findFirstOrThrow({ where: { nome: `${PREFIXO} Alicate em uso` } });
    await prisma.instrucao_recursos.create({ data: { instrucao_id: instrucao, recurso_id: alicate.id, quantidade: 1 } });
  });
  afterAll(async () => {
    await apagar();
    await prisma.$disconnect();
  });

  it('a prévia dos inativos diz o que sai e o que fica (em uso), sem excluir nada', async () => {
    const previa = await recursos.excluirEmLote({ inativos: true, search: PREFIXO, previa: true });
    expect(previa).toMatchObject({ previa: true, excluidos: 3 });
    expect(previa.em_uso).toEqual([{ id: expect.any(String), nome: `${PREFIXO} Alicate em uso`, instrucoes: 1 }]);
    expect(await vivo('Cabo velho')).toBe(true);
  });

  it('exclui todos os inativos do filtro de uma vez; o em uso e o ativo ficam', async () => {
    const feito = await recursos.excluirEmLote({ inativos: true, search: PREFIXO, previa: false, esperados: 3 });
    expect(feito).toMatchObject({ previa: false, excluidos: 3 });
    expect([await vivo('Cabo velho'), await vivo('Fita velha'), await vivo('Picape velha')]).toEqual([false, false, false]);
    expect([await vivo('Alicate em uso'), await vivo('Luva ativa')]).toEqual([true, true]);
    // Removido como no remover de um: desativado também, com a data de atualização
    const cabo = await prisma.recursos.findFirstOrThrow({ where: { nome: `${PREFIXO} Cabo velho` }, select: { ativo: true, deleted_at: true, updated_at: true } });
    expect(cabo.ativo).toBe(false);
    expect(cabo.updated_at.getTime()).toBe(cabo.deleted_at!.getTime());
  });

  it('os inativos só da categoria filtrada', async () => {
    expect(await recursos.excluirEmLote({ inativos: true, search: PREFIXO, categoria: CategoriaRecurso.VEICULO, previa: false })).toMatchObject({ excluidos: 1 });
    expect([await vivo('Picape velha'), await vivo('Cabo velho')]).toEqual([false, true]);
  });

  it('os selecionados saem, ativos ou não; o que está em uso fica e volta listado', async () => {
    const ids = (await prisma.recursos.findMany({ where: { nome: { in: [`${PREFIXO} Luva ativa`, `${PREFIXO} Alicate em uso`] } }, select: { id: true } })).map((r) => r.id.trim());
    // O cuid de 25 caracteres guardado em Char(26) (com espaço): a forma que a tela manda, aparada
    expect(ids.some((id) => id.length === 25)).toBe(true);
    const feito = await recursos.excluirEmLote({ ids: [...ids, 'id-que-nao-existe'], previa: false });
    expect(feito.excluidos).toBe(1);
    expect(feito.nao_encontrados).toBe(1);
    expect(feito.em_uso.map((r) => r.nome)).toEqual([`${PREFIXO} Alicate em uso`]);
    expect([await vivo('Luva ativa'), await vivo('Alicate em uso')]).toEqual([false, true]);
  });

  it('sem dizer previa: false, é só a prévia: nada sai', async () => {
    expect(await recursos.excluirEmLote({ inativos: true, search: PREFIXO })).toMatchObject({ previa: true, excluidos: 3 });
    expect(await vivo('Cabo velho')).toBe(true);
  });

  it('a lista mudou desde a prévia (outra quantidade): 409 e nada sai', async () => {
    await expect(recursos.excluirEmLote({ inativos: true, search: PREFIXO, previa: false, esperados: 2 })).rejects.toThrow(/mudou desde a prévia/);
    expect(await vivo('Cabo velho')).toBe(true);
  });

  it('a busca é literal: "_" e "%" não são curinga', async () => {
    expect(await recursos.excluirEmLote({ inativos: true, search: `${PREFIXO} _` })).toMatchObject({ excluidos: 0 });
    expect((await recursos.listar({ search: `${PREFIXO}%velha`, limit: 100 })).data).toEqual([]);
  });

  it('ou os selecionados ou os inativos: os dois juntos, ou nenhum, é 400', async () => {
    await expect(recursos.excluirEmLote({ ids: ['x'], inativos: true })).rejects.toBeInstanceOf(BadRequestException);
    await expect(recursos.excluirEmLote({})).rejects.toBeInstanceOf(BadRequestException);
    await expect(recursos.excluirEmLote({ ids: ['  '] })).rejects.toThrow(/Nenhum recurso/);
  });

  it('o vínculo novo entre a leitura e a gravação segura o recurso (a condição "sem uso" no UPDATE)', async () => {
    const cabo = await prisma.recursos.findFirstOrThrow({ where: { nome: `${PREFIXO} Cabo velho` } });
    // Uma instrução passa a usar o cabo depois que o lote leu (pela mesma transação, no meio da trava)
    const transacao = prisma.$transaction.bind(prisma);
    const espiao = jest.spyOn(prisma, '$transaction').mockImplementationOnce(((fn: (tx: unknown) => Promise<unknown>, opcoes: unknown) =>
      transacao(async (tx) => {
        const executar = tx.$queryRaw.bind(tx);
        (tx as { $queryRaw: unknown }).$queryRaw = async (...args: Parameters<typeof executar>) => {
          const lido = await executar(...args);
          await tx.instrucao_recursos.create({ data: { instrucao_id: instrucao, recurso_id: cabo.id, quantidade: 1 } });
          return lido;
        };
        return fn(tx);
      }, opcoes as never)) as never);
    const feito = await recursos.excluirEmLote({ ids: [cabo.id.trim()], previa: false });
    espiao.mockRestore();
    expect(feito).toMatchObject({ excluidos: 0, em_uso: [{ nome: `${PREFIXO} Cabo velho`, instrucoes: 1 }] });
    expect(await vivo('Cabo velho')).toBe(true);
  });

  it('a lista filtra pela situação; "só ativos" manda sobre a situação', async () => {
    expect((await recursos.listar({ search: PREFIXO, apenas_ativos: true, situacao: 'INATIVO', limit: 100 })).data.map((r) => r.nome)).toEqual([`${PREFIXO} Luva ativa`]);
    const inativos = await recursos.listar({ search: PREFIXO, situacao: 'INATIVO', limit: 100 });
    expect(inativos.data.map((r) => r.nome).sort()).toEqual([`${PREFIXO} Alicate em uso`, `${PREFIXO} Cabo velho`, `${PREFIXO} Fita velha`, `${PREFIXO} Picape velha`]);
    const ativos = await recursos.listar({ search: PREFIXO, situacao: 'ATIVO', limit: 100 });
    expect(ativos.data.map((r) => r.nome)).toEqual([`${PREFIXO} Luva ativa`]);
  });
});
