import { PermissionScopeService, PrismaService } from '@/core';
import { PlanosManutencaoService } from '@/modules/planos-manutencao/planos-manutencao.service';
import { PropagacaoPlanosService } from '@/modules/planos-manutencao/propagacao-planos.service';
import { TarefasService } from '@/modules/tarefas/tarefas.service';
import { ImportacaoService } from '../importacao.service';
import { RegistroImportado, UsuarioDaImportacao } from '../importacao.types';
import { PlanosImportacao } from './planos.importacao';

/**
 * Planos (templates) pela planilha — contra Postgres de verdade. Além do
 * plano e das tarefas, o que se prova é a propagação: a fila é gravada na
 * transação, e o disparo só acontece depois de confirmar.
 */
describe('Importação de planos de manutenção (banco real)', () => {
  const prisma = new PrismaService();
  const escopo = new PermissionScopeService(prisma);
  const propagacao = new PropagacaoPlanosService(prisma);
  const importacao = new ImportacaoService(prisma);
  const planos = new PlanosImportacao(
    new PlanosManutencaoService(prisma, escopo, propagacao),
    new TarefasService(prisma, escopo, propagacao),
    prisma,
  );
  const usuario: UsuarioDaImportacao = { id: 'TESTEIMPPLANOUSUARIO00001', role: 'admin', permissions: ['manutencao.manage'] };

  const CATEGORIA = 'TESTEIMPPLANOCATEGORIA001';
  const NOME = 'TESTE IMPORTACAO PLANO';
  let limpeza: string;
  let inspecao: string;
  let disparo: jest.SpyInstance;

  const instrucao = async (tag: string, nome: string) =>
    (
      await prisma.instrucoes.upsert({
        where: { tag },
        update: { nome, deleted_at: null, ativo: true },
        create: {
          tag, nome, descricao: 'Teste', categoria: 'LIMPEZA', tipo_manutencao: 'PREVENTIVA',
          condicao_ativo: 'QUALQUER', criticidade: 3, duracao_estimada: 1, tempo_estimado: 60,
        },
      })
    ).id.trim();

  beforeAll(async () => {
    await prisma.usuarios.upsert({
      where: { id: usuario.id },
      update: {},
      create: { id: usuario.id, nome: 'Autor', email: 'autor.plano@importacao.teste' },
    });
    await prisma.categorias_equipamentos.upsert({
      where: { id: CATEGORIA },
      update: { nome: 'Categoria Importação Plano' },
      create: { id: CATEGORIA, nome: 'Categoria Importação Plano' },
    });
    limpeza = await instrucao('TST-IMP-PL1', 'Limpeza de teste do plano');
    inspecao = await instrucao('TST-IMP-PL2', 'Inspeção de teste do plano');
  });

  const limpar = async () => {
    const ids = (await prisma.planos_manutencao.findMany({ where: { nome: { startsWith: NOME } } })).map((p) => p.id);
    await prisma.propagacoes_plano.deleteMany({ where: { plano_id: { in: ids } } });
    await prisma.tarefas.deleteMany({ where: { plano_manutencao_id: { in: ids } } });
    await prisma.planos_manutencao.deleteMany({ where: { id: { in: ids } } });
  };

  beforeEach(async () => {
    await limpar();
    disparo = jest.spyOn(propagacao, 'processarFila').mockResolvedValue(undefined as never);
  });
  afterEach(() => disparo.mockRestore());
  afterAll(async () => {
    await limpar();
    await prisma.instrucoes.deleteMany({ where: { tag: { in: ['TST-IMP-PL1', 'TST-IMP-PL2'] } } });
    await prisma.categorias_equipamentos.deleteMany({ where: { id: CATEGORIA } });
    await prisma.usuarios.deleteMany({ where: { id: usuario.id } });
    await prisma.$disconnect();
  });

  const ficha = (dados: Record<string, unknown> = {}, id: string | null = null): RegistroImportado => ({
    id,
    aba: '01',
    linha: 1,
    atualizado_em: null,
    dados: {
      categoria: 'categoria importacao plano',
      nome: NOME,
      versao: '1.0',
      descricao: null,
      tarefas: [
        { _linha: 9, instrucao: 'TST-IMP-PL1', nome: null, frequencia: 'MENSAL', criticidade: 3 },
        { _linha: 10, instrucao: 'Inspeção de teste do plano', nome: 'Inspeção visual', frequencia: 'PERSONALIZADA', frequencia_personalizada: 45, criticidade: 4 },
      ],
      ...dados,
    },
  });

  const plano = () => prisma.planos_manutencao.findFirst({ where: { nome: NOME } });
  const tarefasDoPlano = async () => {
    const p = await plano();
    return prisma.tarefas.findMany({ where: { plano_manutencao_id: p!.id, deleted_at: null }, orderBy: { ordem: 'asc' } });
  };

  it('a prévia não grava nem dispara a propagação', async () => {
    const r = await importacao.importar(planos, [ficha()], false, usuario);

    expect(r).toMatchObject({ novos: 1, erros: [] });
    expect(await plano()).toBeNull();
    expect(disparo).not.toHaveBeenCalled();
  });

  it('confirmar cria o template e as tarefas (instrução pela TAG ou pelo nome; nome vazio = o da instrução)', async () => {
    const r = await importacao.importar(planos, [ficha()], true, usuario);

    expect(r).toMatchObject({ confirmado: true, novos: 1, erros: [] });
    const t = await tarefasDoPlano();
    expect(t.map((x) => [x.nome, x.instrucao_id?.trim(), x.frequencia, x.frequencia_personalizada, x.criticidade])).toEqual([
      ['Limpeza de teste do plano', limpeza, 'MENSAL', null, 3],
      ['Inspeção visual', inspecao, 'PERSONALIZADA', 45, 4],
    ]);
    expect(disparo).toHaveBeenCalled();
  });

  it('reimportar sem mexer não muda nada e não enfileira propagação', async () => {
    await importacao.importar(planos, [ficha()], true, usuario);
    const p = (await plano())!;
    const [t1, t2] = await tarefasDoPlano();
    const filaAntes = await prisma.propagacoes_plano.count({ where: { plano_id: p.id } });
    disparo.mockClear();

    const r = await importacao.importar(
      planos,
      [
        ficha(
          {
            categoria_ref: CATEGORIA,
            tarefas: [
              { id: t1.id.trim(), instrucao: 'Limpeza de teste do plano', instrucao_ref: limpeza, nome: 'Limpeza de teste do plano', frequencia: 'MENSAL', criticidade: 3 },
              { id: t2.id.trim(), instrucao: 'TST-IMP-PL2', nome: 'Inspeção visual', frequencia: 'PERSONALIZADA', frequencia_personalizada: 45, criticidade: 4 },
            ],
          },
          p.id.trim(),
        ),
      ],
      true,
      usuario,
    );

    expect(r).toMatchObject({ inalterados: 1, erros: [] });
    expect(await prisma.propagacoes_plano.count({ where: { plano_id: p.id } })).toBe(filaAntes);
    expect(disparo).not.toHaveBeenCalled();
  });

  it('tarefa fora da seção é removida; tarefa de outro plano é erro na linha dela', async () => {
    await importacao.importar(planos, [ficha()], true, usuario);
    const p = (await plano())!;
    const [t1] = await tarefasDoPlano();

    const removida = await importacao.importar(
      planos,
      [ficha({ tarefas: [{ id: t1.id.trim(), instrucao: 'TST-IMP-PL1', nome: t1.nome, frequencia: 'MENSAL', criticidade: 3 }] }, p.id.trim())],
      true,
      usuario,
    );
    expect(removida.alterados).toBe(1);
    expect((await tarefasDoPlano()).map((t) => t.id)).toEqual([t1.id]);

    const deOutro = await importacao.importar(
      planos,
      [ficha({ tarefas: [{ _linha: 12, id: 'tarefadeoutroplano00000001', instrucao: 'TST-IMP-PL1', frequencia: 'MENSAL', criticidade: 3 }] }, p.id.trim())],
      false,
      usuario,
    );
    expect(deOutro.erros[0]).toMatchObject({ linha: 12, mensagem: expect.stringContaining('não é deste plano') });
  });

  it('tarefa antiga sem instrução, com a célula vazia, fica como está', async () => {
    await importacao.importar(planos, [ficha()], true, usuario);
    const p = (await plano())!;
    const [t1, t2] = await tarefasDoPlano();
    await prisma.tarefas.update({ where: { id: t1.id }, data: { instrucao_id: null, nome: 'Tarefa antiga' } });

    const r = await importacao.importar(
      planos,
      [
        ficha(
          {
            tarefas: [
              { id: t1.id.trim(), instrucao: null, nome: 'Tarefa antiga', frequencia: 'MENSAL', criticidade: 3 },
              { id: t2.id.trim(), instrucao: 'TST-IMP-PL2', nome: 'Inspeção visual', frequencia: 'PERSONALIZADA', frequencia_personalizada: 45, criticidade: 4 },
            ],
          },
          p.id.trim(),
        ),
      ],
      true,
      usuario,
    );

    expect(r).toMatchObject({ inalterados: 1, erros: [] });
  });

  it('erro de validação da tarefa aponta a linha dela', async () => {
    const r = await importacao.importar(
      planos,
      [ficha({ tarefas: [{ _linha: 9, instrucao: 'TST-IMP-PL1', frequencia: 'MENSAL', criticidade: 9 }] })],
      false,
      usuario,
    );

    expect(r.erros).toEqual([expect.objectContaining({ linha: 9, campo: 'tarefas.0.criticidade' })]);
  });

  it('cópia de equipamento não se edita pela planilha de planos', async () => {
    await importacao.importar(planos, [ficha()], true, usuario);
    const p = (await plano())!;
    await prisma.planos_manutencao.update({ where: { id: p.id }, data: { plano_origem_id: p.id } });

    const r = await importacao.importar(planos, [ficha({}, p.id.trim())], false, usuario);

    expect(r.erros[0]).toMatchObject({ campo: 'id', mensagem: expect.stringContaining('Não existe plano com o ID') });
  });
});
