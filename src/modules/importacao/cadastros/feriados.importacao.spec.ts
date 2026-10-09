import { PermissionScopeService, PrismaService } from '@/core';
import { FeriadosService } from '@/modules/agenda/feriados.service';
import { ImportacaoService } from '../importacao.service';
import { RegistroImportado, UsuarioDaImportacao } from '../importacao.types';
import { FeriadosImportacao } from './feriados.importacao';

/**
 * Feriados pela planilha — e, com eles, a referência a outro cadastro pelo
 * nome: as plantas de um feriado entram pelo nome, e o ID exportado ao lado
 * resolve o nome repetido.
 */
describe('Importação de feriados (banco real)', () => {
  const prisma = new PrismaService();
  const importacao = new ImportacaoService(prisma);
  const feriados = new FeriadosImportacao(new FeriadosService(prisma), new PermissionScopeService(prisma), prisma);
  const admin: UsuarioDaImportacao = { id: 'admin', role: 'admin', permissions: ['agenda.manage'] };

  const PROPRIETARIO = 'TESTEIMPFERIADOPROP000001';
  const REPETIDA_1 = 'TESTEIMPFERIADOREP0000001';
  const REPETIDA_2 = 'TESTEIMPFERIADOREP0000002';
  const UNICA = 'TESTEIMPFERIADOUNI0000001';
  const DATA = new Date('2031-11-15T00:00:00.000Z');

  const planta = (id: string, nome: string, cnpj: string) =>
    prisma.plantas.upsert({
      where: { id },
      update: { nome, deleted_at: null },
      create: {
        id, nome, cnpj, proprietario_id: PROPRIETARIO, localizacao: 'Teste', horario_funcionamento: '8-18',
        logradouro: 'Rua 1', cidade: 'Goiânia', uf: 'GO', cep: '74000-000',
      },
    });

  beforeAll(async () => {
    await prisma.usuarios.upsert({
      where: { id: PROPRIETARIO },
      update: {},
      create: { id: PROPRIETARIO, nome: 'Prop feriado', email: 'feriado.importacao@exemplo.local' },
    });
    await planta(REPETIDA_1, 'Planta Repetida Feriado', '91.000.000/0001-01');
    await planta(REPETIDA_2, 'Planta Repetida Feriado', '91.000.000/0001-02');
    await planta(UNICA, 'Planta Única Feriado', '91.000.000/0001-03');
  });

  const limpar = async () => {
    const ids = (await prisma.feriados.findMany({ where: { data: DATA } })).map((f) => f.id);
    await prisma.feriado_plantas.deleteMany({ where: { feriado_id: { in: ids } } });
    await prisma.feriados.deleteMany({ where: { id: { in: ids } } });
  };

  beforeEach(limpar);
  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  const linha = (dados: Record<string, unknown>, id: string | null = null): RegistroImportado => ({
    id,
    aba: 'RESUMO',
    linha: 2,
    atualizado_em: null,
    dados: {
      nome: 'Feriado de teste',
      data: '2031-11-15',
      tipo: 'MUNICIPAL',
      geral: false,
      recorrente: false,
      descricao: null,
      ...dados,
    },
  });

  const plantasDoFeriado = async () => {
    const f = await prisma.feriados.findFirstOrThrow({ where: { data: DATA }, include: { feriado_plantas: true } });
    return f.feriado_plantas.map((p) => p.planta_id.trim()).sort();
  };

  it('planta pelo nome, sem caixa nem acento', async () => {
    const r = await importacao.importar(feriados, [linha({ plantas: 'planta unica FERIADO' })], true, admin);

    expect(r).toMatchObject({ confirmado: true, novos: 1, erros: [] });
    expect(await plantasDoFeriado()).toEqual([UNICA]);
  });

  it('nome repetido no cadastro: sem o ID é erro; com o ID exportado ao lado, vale o ID', async () => {
    const semId = await importacao.importar(feriados, [linha({ plantas: 'Planta Repetida Feriado' })], false, admin);
    expect(semId.erros).toEqual([
      expect.objectContaining({ campo: 'plantas', mensagem: expect.stringContaining('Há mais de uma planta chamada') }),
    ]);

    const comId = await importacao.importar(
      feriados,
      [linha({ plantas: 'Planta Repetida Feriado; Planta Única Feriado', plantas_ids: `${UNICA}; ${REPETIDA_2}` })],
      true,
      admin,
    );
    expect(comId.erros).toEqual([]);
    expect(await plantasDoFeriado()).toEqual([REPETIDA_2, UNICA].sort());
  });

  it('nome trocado com o ID antigo ao lado: vale o nome', async () => {
    await importacao.importar(feriados, [linha({ plantas: 'Planta Única Feriado' })], true, admin);
    const id = (await prisma.feriados.findFirstOrThrow({ where: { data: DATA } })).id.trim();

    const r = await importacao.importar(
      feriados,
      [linha({ plantas: 'Planta Repetida Feriado', plantas_ids: REPETIDA_1 }, id)],
      true,
      admin,
    );
    expect(r.alterados).toBe(1);
    expect(await plantasDoFeriado()).toEqual([REPETIDA_1]);

    const trocado = await importacao.importar(
      feriados,
      [linha({ plantas: 'Planta Única Feriado', plantas_ids: REPETIDA_1 }, id)],
      true,
      admin,
    );
    expect(trocado.alterados).toBe(1);
    expect(await plantasDoFeriado()).toEqual([UNICA]);
  });

  it('nome que não existe é erro: a importação não cria a planta', async () => {
    const r = await importacao.importar(feriados, [linha({ plantas: 'Planta Que Não Existe' })], true, admin);

    expect(r.confirmado).toBe(false);
    expect(r.erros[0].mensagem).toContain('Não existe planta chamada "Planta Que Não Existe"');
    expect(await prisma.plantas.count({ where: { nome: 'Planta Que Não Existe' } })).toBe(0);
  });

  it('planta excluída: o vínculo que o feriado já tem se mantém; vínculo novo é erro', async () => {
    await importacao.importar(feriados, [linha({ plantas: 'Planta Única Feriado' })], true, admin);
    const id = (await prisma.feriados.findFirstOrThrow({ where: { data: DATA } })).id.trim();
    await prisma.plantas.update({ where: { id: UNICA }, data: { deleted_at: new Date() } });

    try {
      const mantido = await importacao.importar(
        feriados,
        [linha({ plantas: 'Planta Única Feriado', plantas_ids: UNICA }, id)],
        true,
        admin,
      );
      expect(mantido).toMatchObject({ inalterados: 1, erros: [] });

      const novo = await importacao.importar(
        feriados,
        [linha({ nome: 'Outro', data: '2031-11-15', plantas: 'Planta Única Feriado', plantas_ids: UNICA })],
        false,
        admin,
      );
      expect(novo.erros[0].mensagem).toContain('Não existe planta chamada');
    } finally {
      await prisma.plantas.update({ where: { id: UNICA }, data: { deleted_at: null } });
    }
  });

  it('reimportar como exportado não muda nada (a data volta no mesmo dia)', async () => {
    await importacao.importar(feriados, [linha({ plantas: 'Planta Única Feriado' })], true, admin);
    const id = (await prisma.feriados.findFirstOrThrow({ where: { data: DATA } })).id.trim();

    const r = await importacao.importar(
      feriados,
      [linha({ plantas: 'Planta Única Feriado', plantas_ids: UNICA }, id)],
      true,
      admin,
    );

    expect(r).toMatchObject({ inalterados: 1, alterados: 0, erros: [] });
  });
});
