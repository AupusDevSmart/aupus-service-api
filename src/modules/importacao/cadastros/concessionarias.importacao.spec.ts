import { ConcessionariasService, PrismaService } from '@/core';
import { ImportacaoService } from '../importacao.service';
import { RegistroImportado, UsuarioDaImportacao } from '../importacao.types';
import { ConcessionariasImportacao } from './concessionarias.importacao';

/** Concessionárias pela planilha — as tarifas são colunas fixas, não lista. */
describe('Importação de concessionárias (banco real)', () => {
  const prisma = new PrismaService();
  const importacao = new ImportacaoService(prisma);
  const concessionarias = new ConcessionariasImportacao(new ConcessionariasService(prisma), prisma);
  const admin: UsuarioDaImportacao = { id: 'admin', role: 'admin', permissions: ['equipamentos.manage'] };
  const NOME = 'TESTE IMPORTACAO CONCESSIONARIA';

  const linha = (dados: Record<string, unknown> = {}, id: string | null = null): RegistroImportado => ({
    id,
    aba: 'RESUMO',
    linha: 2,
    atualizado_em: null,
    dados: {
      nome: NOME,
      estado: 'GO',
      numero_reh: 'REH 3.000/2026',
      data_inicio: '2026-10-22',
      data_validade: '2027-10-21',
      a4_verde: { tusd_d: 12.5, tusd_p: 1.234567, tusd_fp: 0.123456, te_d: null, te_p: 0.5, te_fp: 0.3 },
      a3a_verde: { tusd_d: null, tusd_p: null, tusd_fp: null, te_d: null, te_p: null, te_fp: null },
      b: { tusd_valor: 0.45, te_valor: 0.31 },
      ...dados,
    },
  });

  const limpar = () => prisma.concessionarias_energia.deleteMany({ where: { nome: NOME } });
  beforeEach(limpar);
  afterAll(async () => {
    await limpar();
    await prisma.$disconnect();
  });

  it('cria com as datas no dia certo e as tarifas nas colunas certas', async () => {
    const r = await importacao.importar(concessionarias, [linha()], true, admin);

    expect(r).toMatchObject({ confirmado: true, novos: 1, erros: [] });
    const c = await prisma.concessionarias_energia.findFirstOrThrow({ where: { nome: NOME } });
    expect(c.data_inicio.toISOString()).toBe('2026-10-22T00:00:00.000Z');
    expect(Number(c.a4_verde_tusd_p)).toBe(1.234567);
    expect(c.a3a_verde_tusd_d).toBeNull();
  });

  it('reimportar como exportado não muda nada', async () => {
    const criado = await importacao.importar(concessionarias, [linha()], true, admin);

    const r = await importacao.importar(concessionarias, [linha({}, criado.registros[0].id)], true, admin);

    expect(r).toMatchObject({ inalterados: 1, alterados: 0, erros: [] });
  });

  it('a regra do service (início antes da validade) também vale', async () => {
    const r = await importacao.importar(concessionarias, [linha({ data_validade: '2026-01-01' })], false, admin);

    expect(r.erros[0].mensagem).toBe('Data de início deve ser anterior à data de validade');
  });
});
