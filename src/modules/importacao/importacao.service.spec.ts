import { PrismaService } from '@/core';
import { RecursosService } from '@/modules/recursos/recursos.service';
import { ImportacaoService } from './importacao.service';
import { RecursosImportacao } from './cadastros/recursos.importacao';
import { RegistroImportado, UsuarioDaImportacao } from './importacao.types';

/**
 * O motor da importação de planilha — contra Postgres de verdade, com o
 * cadastro mais simples (Recursos) para o que se prova ser o motor: prévia,
 * tudo-ou-nada, savepoint por registro, "sem mudança" e o aviso de alterado.
 */
describe('ImportacaoService (banco real)', () => {
  const prisma = new PrismaService();
  const importacao = new ImportacaoService(prisma);
  const recursos = new RecursosImportacao(new RecursosService(prisma), prisma);
  const PREFIXO = 'TESTE_IMPORTACAO';
  const usuario: UsuarioDaImportacao = { id: 'admin', role: 'admin', permissions: ['recursos.manage'] };

  let linha = 1;
  const registro = (dados: Record<string, unknown>, extra: Partial<RegistroImportado> = {}): RegistroImportado => ({
    id: null,
    aba: 'RESUMO',
    linha: ++linha,
    atualizado_em: null,
    dados,
    ...extra,
  });

  const novo = (nome: string, extra: Record<string, unknown> = {}) =>
    registro({ categoria: 'TECNICO', nome: `${PREFIXO} ${nome}`, unidade: 'h', preco_medio: 10, ativo: true, ...extra });

  const doBanco = () =>
    prisma.recursos.findMany({ where: { nome: { startsWith: PREFIXO } }, orderBy: { nome: 'asc' } });

  beforeEach(async () => {
    linha = 1;
    await prisma.recursos.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
  });

  afterAll(async () => {
    await prisma.recursos.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
    await prisma.$disconnect();
  });

  it('a prévia conta o que faria e não grava nada', async () => {
    const r = await importacao.importar(recursos, [novo('A'), novo('B')], false, usuario);

    expect(r).toMatchObject({ confirmado: false, novos: 2, alterados: 0, erros: [] });
    expect(await doBanco()).toHaveLength(0);
  });

  it('confirmar grava', async () => {
    const r = await importacao.importar(recursos, [novo('A'), novo('B')], true, usuario);

    expect(r).toMatchObject({ confirmado: true, novos: 2 });
    expect((await doBanco()).map((x) => x.nome)).toEqual([`${PREFIXO} A`, `${PREFIXO} B`]);
  });

  it('um erro não grava nada, e aponta a aba e a linha', async () => {
    const r = await importacao.importar(
      recursos,
      [novo('A'), novo('B', { categoria: 'NAO_EXISTE' })],
      true,
      usuario,
    );

    expect(r.confirmado).toBe(false);
    expect(r.novos).toBe(1);
    expect(r.erros).toEqual([
      expect.objectContaining({ aba: 'RESUMO', linha: 3, campo: 'categoria', mensagem: 'categoria tem um valor não permitido.' }),
    ]);
    expect(await doBanco()).toHaveLength(0);
  });

  it('o erro que só o service descobre também aparece na prévia (nome repetido = 409)', async () => {
    const r = await importacao.importar(recursos, [novo('A'), novo('A')], false, usuario);

    expect(r.novos).toBe(1);
    expect(r.erros).toEqual([
      expect.objectContaining({ linha: 3, mensagem: expect.stringContaining('Já existe um recurso chamado') }),
    ]);
  });

  it('campo que o formulário não aceita é erro, como na tela', async () => {
    const r = await importacao.importar(recursos, [novo('A', { custo_total: 5 })], false, usuario);

    expect(r.erros).toEqual([expect.objectContaining({ mensagem: 'O campo "custo total" não é aceito aqui.' })]);
  });

  it('ID que não existe é erro, e nada é criado no lugar', async () => {
    const r = await importacao.importar(
      recursos,
      [registro({ categoria: 'TECNICO', nome: `${PREFIXO} fantasma` }, { id: 'naoexiste0000000000000000' })],
      true,
      usuario,
    );

    expect(r.confirmado).toBe(false);
    expect(r.erros[0]).toMatchObject({ campo: 'id', mensagem: expect.stringContaining('Não existe recurso com o ID') });
    expect(await doBanco()).toHaveLength(0);
  });

  it('ID repetido na planilha é erro', async () => {
    const criado = await prisma.recursos.create({ data: { categoria: 'TECNICO', nome: `${PREFIXO} A` } });
    const id = criado.id.trim();

    const r = await importacao.importar(
      recursos,
      [novo('A', {}), novo('A2', {})].map((x) => ({ ...x, id })),
      false,
      usuario,
    );

    expect(r.erros).toEqual([
      expect.objectContaining({ linha: 3, campo: 'id', mensagem: expect.stringContaining('aparece duas vezes') }),
    ]);
  });

  describe('edição', () => {
    let id: string;
    let exportadoEm: string;

    beforeEach(async () => {
      const criado = await prisma.recursos.create({
        data: { categoria: 'TECNICO', nome: `${PREFIXO} Eletricista`, unidade: 'h', preco_medio: 85.5 },
      });
      id = criado.id.trim();
      exportadoEm = criado.updated_at.toISOString();
    });

    const comoExportado = (extra: Record<string, unknown> = {}) =>
      registro(
        { categoria: 'TECNICO', nome: `${PREFIXO} Eletricista`, unidade: 'h', preco_medio: 85.5, ativo: true, ...extra },
        { id: ` ${id}  `, atualizado_em: exportadoEm },
      );

    it('sem mudança não regrava (nem o updated_at)', async () => {
      const antes = await prisma.recursos.findUniqueOrThrow({ where: { id } });
      await new Promise((r) => setTimeout(r, 1100));

      const r = await importacao.importar(recursos, [comoExportado()], true, usuario);

      expect(r).toMatchObject({ novos: 0, alterados: 0, inalterados: 1, erros: [], avisos: [] });
      const depois = await prisma.recursos.findUniqueOrThrow({ where: { id } });
      expect(depois.updated_at).toEqual(antes.updated_at);
    });

    it('espaço sobrando gravado pela tela não conta como mudança (a planilha apara o que lê)', async () => {
      await prisma.recursos.update({ where: { id }, data: { unidade: 'h  ' } });
      exportadoEm = (await prisma.recursos.findUniqueOrThrow({ where: { id } })).updated_at.toISOString();

      const r = await importacao.importar(recursos, [comoExportado()], true, usuario);

      expect(r).toMatchObject({ inalterados: 1, alterados: 0, erros: [] });
      expect((await prisma.recursos.findUniqueOrThrow({ where: { id } })).unidade).toBe('h  ');
    });

    it('alterado grava, e o aviso de "mudou depois" não dispara falso', async () => {
      const r = await importacao.importar(recursos, [comoExportado({ preco_medio: 90 })], true, usuario);

      expect(r).toMatchObject({ confirmado: true, alterados: 1, avisos: [] });
      expect(Number((await prisma.recursos.findUniqueOrThrow({ where: { id } })).preco_medio)).toBe(90);
    });

    it('avisa quando o registro mudou no sistema depois da exportação', async () => {
      await new Promise((r) => setTimeout(r, 1100));
      await prisma.recursos.update({ where: { id }, data: { unidade: 'un' } });

      const r = await importacao.importar(recursos, [comoExportado({ preco_medio: 90 })], false, usuario);

      expect(r.avisos).toEqual([
        expect.objectContaining({ linha: 2, mensagem: expect.stringContaining('alterado no sistema depois da exportação') }),
      ]);
    });
  });
});
