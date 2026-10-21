import { PermissionScopeService, PrismaService } from '@/core';
import { InstrucoesService } from '@/modules/instrucoes/instrucoes.service';
import { PropagacaoPlanosService } from '@/modules/planos-manutencao/propagacao-planos.service';
import { variantesDeIds } from '@/modules/tarefas/ids';
import { ImportacaoService } from '../importacao.service';
import { RegistroImportado, UsuarioDaImportacao } from '../importacao.types';
import { InstrucoesImportacao } from './instrucoes.importacao';

/**
 * Instruções pela planilha, na montagem da do AupusProject (SN-85): os passos,
 * os recursos, o maquinário e os materiais vêm de seções da aba, cada item com
 * a sua linha, e o erro de um item aponta a linha dele.
 */
describe('Importação de instruções (banco real)', () => {
  const prisma = new PrismaService();
  const importacao = new ImportacaoService(prisma);
  const instrucoes = new InstrucoesImportacao(
    new InstrucoesService(prisma, {} as PropagacaoPlanosService, new PermissionScopeService(prisma)),
    prisma,
  );
  const usuario: UsuarioDaImportacao = { id: 'TESTEIMPINSTRUCAOUSUARIO1', role: 'admin', permissions: ['manutencao.manage'] };
  const NOME = 'TESTE IMPORTACAO INSTRUCAO';
  const PREFIXO = 'TESTE IMP INSTR';
  let eletricista: string;
  let cabo: string;
  let munck: string;

  beforeAll(async () => {
    await prisma.usuarios.upsert({
      where: { id: usuario.id },
      update: {},
      create: { id: usuario.id, nome: 'Autor', email: 'autor.instrucao@importacao.teste' },
    });
    await limpar();
    await prisma.recursos.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
    await prisma.maquinarios.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
    eletricista = (
      await prisma.recursos.create({
        data: { categoria: 'MAO_DE_OBRA', base_calculo: 'hora', rubrica: 'instrucoes', nome: `${PREFIXO} Eletricista`, preco_unitario: 80 },
      })
    ).id.trim();
    cabo = (
      await prisma.recursos.create({
        data: { categoria: 'MATERIAL', base_calculo: 'unidade', rubrica: 'materiais', nome: `${PREFIXO} Cabo`, unidade: 'm', preco_unitario: 12.5 },
      })
    ).id.trim();
    munck = (
      await prisma.maquinarios.create({
        data: { nome: `${PREFIXO} Munck`, tipo: 'locacao', base_calculo: 'diaria', rubrica: 'terceirizados', preco_unitario: 1500 },
      })
    ).id.trim();
  });

  async function limpar() {
    const ids = (await prisma.instrucoes.findMany({ where: { nome: { startsWith: NOME } } })).map((i) => i.id);
    await prisma.sub_instrucoes.deleteMany({ where: { instrucao_id: { in: variantesDeIds(ids) } } });
    await prisma.instrucao_recursos.deleteMany({ where: { instrucao_id: { in: variantesDeIds(ids) } } });
    await prisma.instrucao_maquinarios.deleteMany({ where: { instrucao_id: { in: ids } } });
    await prisma.instrucoes.deleteMany({ where: { id: { in: ids } } });
  }

  beforeEach(limpar);
  afterAll(async () => {
    await limpar();
    await prisma.recursos.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
    await prisma.maquinarios.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
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
      frente: 'Elétrica',
      prazo_inicio_relativo: 5,
      duracao_dias: 2,
      status: 'ATIVA',
      sub_instrucoes: [
        { _linha: 9, descricao: 'Desligar', tipo: 'eletrico', duracao_horas: 0.5, obrigatoria: true },
        { _linha: 10, descricao: 'Medir', duracao_horas: 1.5, obrigatoria: false, registro: 'LEITURA', unidade: 'V' },
      ],
      recursos: [
        { _linha: 14, grupo: 'recursos', recurso: `${PREFIXO} eletricista`, quantidade: 2, duracao_horas: 3 },
        { _linha: 22, grupo: 'materiais', recurso: `${PREFIXO} CABO`, quantidade: 40, fator_perda: 0.1, fornecido_pelo_cliente: false },
      ],
      maquinarios: [{ _linha: 18, maquinario: `${PREFIXO} munck`, quantidade: 1, duracao_horas: 10 }],
      ...dados,
    },
  });

  /** Listas em consultas próprias: o include falha com Char(26) (ver o adaptador). */
  const doBanco = async () => {
    const i = await prisma.instrucoes.findFirst({ where: { nome: NOME } });
    if (!i) return null;
    return {
      ...i,
      sub_instrucoes: await prisma.sub_instrucoes.findMany({ where: { instrucao_id: { in: variantesDeIds([i.id]) } }, orderBy: { ordem: 'asc' } }),
      recursos: await prisma.instrucao_recursos.findMany({ where: { instrucao_id: { in: variantesDeIds([i.id]) } } }),
      maquinarios: await prisma.instrucao_maquinarios.findMany({ where: { instrucao_id: i.id } }),
    };
  };

  it('cria com o cabeçalho do AupusProject, os passos na ordem e cada item pelo nome do cadastro', async () => {
    const r = await importacao.importar(instrucoes, [ficha()], true, usuario);

    expect(r).toMatchObject({ confirmado: true, novos: 1, erros: [] });
    const i = (await doBanco())!;
    expect(i).toMatchObject({ frente: 'Elétrica', prazo_inicio_relativo: 5, duracao_dias: 2, status: 'ATIVA', ativo: true });
    expect(i.codigo).toMatch(/^INST-\d{3,}$/);
    expect(i.sub_instrucoes.map((p) => [p.descricao, p.ordem, p.tipo, Number(p.duracao_horas), p.registro, p.unidade])).toEqual([
      ['Desligar', 1, 'eletrico', 0.5, 'VERIFICACAO', null],
      ['Medir', 2, null, 1.5, 'LEITURA', 'V'],
    ]);
    const porRecurso = new Map(i.recursos.map((x) => [x.recurso_id.trim(), x]));
    expect(Number(porRecurso.get(eletricista)!.duracao_horas)).toBe(3);
    expect(Number(porRecurso.get(cabo)!.fator_perda)).toBe(0.1);
    expect(i.maquinarios.map((m) => [m.maquinario_id.trim(), Number(m.duracao_horas)])).toEqual([[munck, 10]]);
  });

  it('o erro de um item aponta a linha dele na aba', async () => {
    const r = await importacao.importar(
      instrucoes,
      [
        ficha({
          recursos: [
            { _linha: 14, grupo: 'recursos', recurso: `${PREFIXO} Eletricista`, quantidade: 1 },
            { _linha: 15, grupo: 'recursos', recurso: 'Encanador', quantidade: 1 },
          ],
          maquinarios: [{ _linha: 18, maquinario: 'Betoneira', quantidade: 1 }],
        }),
      ],
      false,
      usuario,
    );

    expect(r.erros).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ aba: '01', linha: 15, mensagem: expect.stringContaining('Não existe recurso chamado "Encanador"') }),
        expect.objectContaining({ aba: '01', linha: 18, mensagem: expect.stringContaining('Não existe maquinário chamado "Betoneira"') }),
      ]),
    );
  });

  // O mesmo nome pode existir nas duas: RECURSOS não acha material, MATERIAIS não acha mão de obra
  it('o material só casa na seção MATERIAIS, e o recurso só na RECURSOS', async () => {
    const r = await importacao.importar(
      instrucoes,
      [ficha({ recursos: [{ _linha: 14, grupo: 'recursos', recurso: `${PREFIXO} Cabo`, quantidade: 1 }] })],
      false,
      usuario,
    );

    expect(r.erros).toEqual([expect.objectContaining({ linha: 14, mensagem: expect.stringContaining('Não existe recurso chamado') })]);
  });

  it('erro de validação do item também aponta a linha (passo sem descrição, disciplina fora da lista)', async () => {
    const r = await importacao.importar(
      instrucoes,
      [ficha({ sub_instrucoes: [{ _linha: 9, descricao: 'Ok', tipo: 'hidraulico' }, { _linha: 10, descricao: '' }] })],
      false,
      usuario,
    );

    expect(r.erros).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ linha: 9, campo: 'sub_instrucoes.0.tipo' }),
        expect.objectContaining({ linha: 10, campo: 'sub_instrucoes.1.descricao' }),
      ]),
    );
  });

  it('reimportar sem mexer não muda nada — nem com ordem antiga com buraco, nem reativando', async () => {
    await importacao.importar(instrucoes, [ficha({ status: 'INATIVA' })], true, usuario);
    const i = (await doBanco())!;
    await prisma.sub_instrucoes.update({ where: { id: i.sub_instrucoes[1].id }, data: { ordem: 7 } });

    const r = await importacao.importar(instrucoes, [ficha({ status: 'INATIVA', codigo: i.codigo }, i.id.trim())], true, usuario);

    expect(r).toMatchObject({ inalterados: 1, erros: [] });
    expect((await doBanco())!).toMatchObject({ status: 'INATIVA', ativo: false });
  });

  it('mudar só um item de lista conta como alterado e grava', async () => {
    await importacao.importar(instrucoes, [ficha()], true, usuario);
    const id = (await doBanco())!.id.trim();

    const r = await importacao.importar(
      instrucoes,
      [ficha({ maquinarios: [{ maquinario: `${PREFIXO} Munck`, quantidade: 1, duracao_horas: 20 }] }, id)],
      true,
      usuario,
    );

    expect(r).toMatchObject({ alterados: 1, erros: [] });
    expect(Number((await doBanco())!.maquinarios[0].duracao_horas)).toBe(20);
  });

  // A planilha de lá traz os IDs de lá (números): não casam com nenhum daqui, e vale o nome
  it('o ID do item de outro sistema não atrapalha: o item casa pelo nome', async () => {
    const r = await importacao.importar(
      instrucoes,
      [
        ficha({
          recursos: [{ _linha: 14, grupo: 'recursos', recurso: `${PREFIXO} Eletricista`, recurso_ref: '17', quantidade: 1, duracao_horas: 2 }],
          maquinarios: [{ _linha: 18, maquinario: `${PREFIXO} Munck`, maquinario_ref: '3', quantidade: 1 }],
        }),
      ],
      true,
      usuario,
    );

    expect(r).toMatchObject({ novos: 1, erros: [] });
    expect((await doBanco())!.recursos.map((x) => x.recurso_id.trim())).toEqual([eletricista]);
  });

  it('a planilha do AupusProject só tem ATIVO: NÃO vira Inativa; ATIVO contra o STATUS é erro', async () => {
    await importacao.importar(instrucoes, [ficha({ status: undefined, ativo: false })], true, usuario);
    expect((await doBanco())!).toMatchObject({ status: 'INATIVA', ativo: false });

    const r = await importacao.importar(instrucoes, [ficha({ status: 'ATIVA', ativo: false })], false, usuario);
    expect(r.erros).toEqual([expect.objectContaining({ campo: 'ativo', mensagem: expect.stringContaining('não bate com o STATUS') })]);
  });

  // O índice único vale para as removidas também: conferir só as vivas dava 500 no banco
  it('código de outra instrução, removida inclusive, é erro na linha', async () => {
    await importacao.importar(instrucoes, [ficha({ codigo: 'TST-IMP-INSTR-1' })], true, usuario);
    const outra = (await doBanco())!;
    await prisma.instrucoes.update({ where: { id: outra.id }, data: { nome: `${NOME} removida`, deleted_at: new Date() } });

    const r = await importacao.importar(instrucoes, [ficha({ codigo: 'TST-IMP-INSTR-1' })], false, usuario);

    expect(r.erros).toEqual([expect.objectContaining({ mensagem: expect.stringContaining('é de uma instrução removida') })]);
  });

  // A planilha de lá não tem REGISTRO nem EXIGE FOTO: o passo chega sem as chaves (a daqui as manda sempre)
  it('o passo que chega sem o registro (planilha de lá) mantém a leitura e a foto do passo daqui de mesma descrição', async () => {
    await importacao.importar(
      instrucoes,
      [ficha({ sub_instrucoes: [{ _linha: 9, descricao: 'Medir tensão', registro: 'LEITURA', unidade: 'V', valor_minimo: 580, valor_maximo: 620, exige_foto: true }] })],
      true,
      usuario,
    );
    const id = (await doBanco())!.id.trim();

    const r = await importacao.importar(
      instrucoes,
      [ficha({ sub_instrucoes: [{ _linha: 9, descricao: 'MEDIR  TENSÃO', tipo: 'eletrico', duracao_horas: 1 }, { _linha: 10, descricao: 'Passo novo de lá' }] }, id)],
      true,
      usuario,
    );

    expect(r).toMatchObject({ alterados: 1, erros: [] });
    const passos = (await doBanco())!.sub_instrucoes;
    expect(passos.map((p) => [p.descricao, p.tipo, p.registro, p.unidade, Number(p.valor_minimo), p.exige_foto])).toEqual([
      ['MEDIR  TENSÃO', 'eletrico', 'LEITURA', 'V', 580, true],
      ['Passo novo de lá', null, 'VERIFICACAO', null, 0, false],
    ]);
  });

  // A tela só mostra o campo que a cobrança pede; gravar limparia o valor calado
  it('valor num campo que a cobrança do item não usa é erro na linha (km no eletricista, horas no cabo)', async () => {
    const r = await importacao.importar(
      instrucoes,
      [
        ficha({
          recursos: [
            { _linha: 14, grupo: 'recursos', recurso: `${PREFIXO} Eletricista`, duracao_horas: 2, distancia_km: 30 },
            { _linha: 22, grupo: 'materiais', recurso: `${PREFIXO} Cabo`, quantidade: 5, fornecido_pelo_cliente: true },
          ],
          maquinarios: [{ _linha: 18, maquinario: `${PREFIXO} Munck`, distancia_km: 50 }],
        }),
      ],
      false,
      usuario,
    );

    expect(r.erros).toEqual([
      expect.objectContaining({ linha: 14, mensagem: expect.stringContaining('DISTÂNCIA [KM] não vale para a cobrança por hora') }),
      expect.objectContaining({ linha: 18, mensagem: expect.stringContaining('DISTÂNCIA [KM] não vale para a cobrança por diária') }),
    ]);
  });

  it('o mesmo item duas vezes na instrução é erro, não duas linhas somando', async () => {
    const r = await importacao.importar(
      instrucoes,
      [
        ficha({
          recursos: [
            { _linha: 14, grupo: 'recursos', recurso: `${PREFIXO} Eletricista`, quantidade: 1, duracao_horas: 2 },
            { _linha: 15, grupo: 'recursos', recurso: `${PREFIXO} Eletricista`, quantidade: 1, duracao_horas: 4 },
          ],
        }),
      ],
      false,
      usuario,
    );

    expect(r.erros).toEqual([expect.objectContaining({ mensagem: expect.stringContaining('aparece duas vezes') })]);
  });
});
