import { PrismaService } from '@/core';
import { InstrucoesService } from '@/modules/instrucoes/instrucoes.service';
import { PropagacaoPlanosService } from '@/modules/planos-manutencao/propagacao-planos.service';
import { ImportacaoService } from '../importacao.service';
import { RegistroImportado, UsuarioDaImportacao } from '../importacao.types';
import { InstrucoesImportacao } from './instrucoes.importacao';

/**
 * Instruções pela planilha — o cadastro com listas: os passos e os recursos
 * vêm de seções da aba, cada item com a sua linha, e o erro de um item aponta
 * a linha dele.
 */
describe('Importação de instruções (banco real)', () => {
  const prisma = new PrismaService();
  const importacao = new ImportacaoService(prisma);
  const instrucoes = new InstrucoesImportacao(
    new InstrucoesService(prisma, {} as PropagacaoPlanosService),
    prisma,
  );
  const usuario: UsuarioDaImportacao = { id: 'TESTEIMPINSTRUCAOUSUARIO1', role: 'admin', permissions: ['manutencao.manage'] };
  const NOME = 'TESTE IMPORTACAO INSTRUCAO';
  let eletricista: string;

  beforeAll(async () => {
    await prisma.usuarios.upsert({
      where: { id: usuario.id },
      update: {},
      create: { id: usuario.id, nome: 'Autor', email: 'autor.instrucao@importacao.teste' },
    });
    await prisma.recursos.deleteMany({ where: { nome: { startsWith: 'TESTE IMP INSTR' } } });
    eletricista = (
      await prisma.recursos.create({ data: { categoria: 'TECNICO', nome: 'TESTE IMP INSTR Eletricista', unidade: 'h' } })
    ).id.trim();
  });

  const limpar = async () => {
    const ids = (await prisma.instrucoes.findMany({ where: { nome: { startsWith: NOME } } })).map((i) => i.id);
    await prisma.sub_instrucoes.deleteMany({ where: { instrucao_id: { in: ids } } });
    await prisma.recursos_instrucao.deleteMany({ where: { instrucao_id: { in: ids } } });
    await prisma.instrucoes.deleteMany({ where: { id: { in: ids } } });
  };

  beforeEach(limpar);
  afterAll(async () => {
    await limpar();
    await prisma.recursos.deleteMany({ where: { nome: { startsWith: 'TESTE IMP INSTR' } } });
    await prisma.usuarios.deleteMany({ where: { id: usuario.id } });
    await prisma.$disconnect();
  });

  const ficha = (dados: Record<string, unknown> = {}, id: string | null = null): RegistroImportado => ({
    id,
    aba: '01',
    linha: 1,
    atualizado_em: null,
    dados: {
      nome: NOME,
      descricao: 'Instrução de teste',
      status: 'ATIVA',
      sub_instrucoes: [
        { _linha: 9, descricao: 'Desligar', obrigatoria: true, tempo_estimado: 30 },
        { _linha: 10, descricao: 'Medir', obrigatoria: false, tempo_estimado: 90 },
      ],
      recursos: [
        { _linha: 14, tipo: 'TECNICO', recurso: 'teste imp instr eletricista', quantidade: 2, obrigatorio: true },
      ],
      ...dados,
    },
  });

  /** Listas em consultas próprias: o include falha com Char(26) (ver o adaptador). */
  const doBanco = async () => {
    const i = await prisma.instrucoes.findFirst({ where: { nome: NOME } });
    if (!i) return null;
    return {
      ...i,
      sub_instrucoes: await prisma.sub_instrucoes.findMany({ where: { instrucao_id: i.id }, orderBy: { ordem: 'asc' } }),
      recursos: await prisma.recursos_instrucao.findMany({ where: { instrucao_id: i.id } }),
    };
  };

  it('cria com os passos na ordem e o recurso pelo nome do catálogo', async () => {
    const r = await importacao.importar(instrucoes, [ficha()], true, usuario);

    expect(r).toMatchObject({ confirmado: true, novos: 1, erros: [] });
    const i = (await doBanco())!;
    expect(i.tag).toMatch(/^INST-/);
    expect(i.categoria).toBe('MECANICA');
    expect(i.sub_instrucoes.map((p) => [p.descricao, p.ordem, p.tempo_estimado])).toEqual([
      ['Desligar', 1, 30],
      ['Medir', 2, 90],
    ]);
    expect(i.recursos.map((x) => [x.recurso_id?.trim(), Number(x.quantidade)])).toEqual([[eletricista, 2]]);
  });

  it('o erro de um item aponta a linha dele na aba', async () => {
    const r = await importacao.importar(
      instrucoes,
      [
        ficha({
          recursos: [
            { _linha: 14, tipo: 'TECNICO', recurso: 'TESTE IMP INSTR Eletricista', quantidade: 1 },
            { _linha: 15, tipo: 'TECNICO', recurso: 'Encanador', quantidade: 1 },
          ],
        }),
      ],
      false,
      usuario,
    );

    expect(r.erros).toEqual([
      expect.objectContaining({ aba: '01', linha: 15, mensagem: expect.stringContaining('Não existe recurso chamado "Encanador"') }),
    ]);
  });

  it('erro de validação do item também aponta a linha (passo sem descrição)', async () => {
    const r = await importacao.importar(
      instrucoes,
      [ficha({ sub_instrucoes: [{ _linha: 9, descricao: 'Ok' }, { _linha: 10, descricao: '', tempo_estimado: 5 }] })],
      false,
      usuario,
    );

    expect(r.erros[0]).toMatchObject({ linha: 10, campo: 'sub_instrucoes.1.descricao' });
  });

  it('reimportar sem mexer não muda nada — nem com ordem antiga com buraco, nem reativando', async () => {
    await importacao.importar(instrucoes, [ficha({ status: 'INATIVA' })], true, usuario);
    const i = (await doBanco())!;
    await prisma.sub_instrucoes.update({ where: { id: i.sub_instrucoes[1].id }, data: { ordem: 7 } });

    const r = await importacao.importar(
      instrucoes,
      [ficha({ status: 'INATIVA', recursos: [{ tipo: 'TECNICO', recurso: 'TESTE IMP INSTR Eletricista', recurso_ref: eletricista, quantidade: 2, obrigatorio: true }] }, i.id.trim())],
      true,
      usuario,
    );

    expect(r).toMatchObject({ inalterados: 1, erros: [] });
    expect((await doBanco())!).toMatchObject({ status: 'INATIVA', ativo: false });
  });

  it('mudar só um item de lista conta como alterado e grava', async () => {
    await importacao.importar(instrucoes, [ficha()], true, usuario);
    const id = (await doBanco())!.id.trim();

    const r = await importacao.importar(
      instrucoes,
      [ficha({ recursos: [{ tipo: 'TECNICO', recurso: 'TESTE IMP INSTR Eletricista', quantidade: 3, obrigatorio: true }] }, id)],
      true,
      usuario,
    );

    expect(r).toMatchObject({ alterados: 1, erros: [] });
    expect(Number((await doBanco())!.recursos[0].quantidade)).toBe(3);
  });

  it('linha antiga de recurso em texto livre continua livre se não mudou', async () => {
    await importacao.importar(instrucoes, [ficha({ recursos: [] })], true, usuario);
    const i = (await doBanco())!;
    await prisma.recursos_instrucao.create({
      data: { instrucao_id: i.id, tipo: 'MATERIAL', descricao: 'Fita isolante (antiga)', quantidade: 1, unidade: 'un' },
    });

    const r = await importacao.importar(
      instrucoes,
      [ficha({ recursos: [{ tipo: 'MATERIAL', recurso: 'Fita isolante (antiga)', quantidade: 1, obrigatorio: false }] }, i.id.trim())],
      true,
      usuario,
    );

    expect(r).toMatchObject({ inalterados: 1, erros: [] });
  });
});
