import { PermissionScopeService, PrismaService } from '@/core';
import { InstrucoesService } from '@/modules/instrucoes/instrucoes.service';
import { RecursosService } from '@/modules/recursos/recursos.service';
import { PropagacaoPlanosService } from '@/modules/planos-manutencao/propagacao-planos.service';
import { variantesDeIds } from '@/modules/tarefas/ids';
import { ImportacaoService } from '../importacao.service';
import { RecursoDaPlanilha, RegistroImportado, UsuarioDaImportacao } from '../importacao.types';
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
    new RecursosService(prisma),
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

  /**
   * SN-98 (decisão do usuário, 23/out/2026): o recurso que as linhas citam é
   * criado (categoria da REFERÊNCIAS) ou tem o cadastro acertado (cobrança e
   * preço das linhas) antes da instrução — na mesma transação, com a prévia
   * desfazendo junto e o bloco "Outros cadastros" dizendo o que muda.
   */
  describe('recursos citados pela planilha', () => {
    const citado = (extra: Partial<RecursoDaPlanilha>): RecursoDaPlanilha => ({
      nome: `${PREFIXO} Ajudante`,
      id: null,
      grupo: 'recursos',
      categoria: 'MAO_DE_OBRA',
      base_calculo: 'hora',
      preco: 30.77,
      unidade: null,
      aba: '01',
      linha: 16,
      problemas: [],
      ...extra,
    });
    // Alterar o cadastro do recurso é da tela de Recursos
    const comRecursos: UsuarioDaImportacao = { ...usuario, permissions: ['manutencao.manage', 'recursos.manage'] };
    const comAjudante = () =>
      ficha({ recursos: [{ _linha: 16, grupo: 'recursos', recurso: `${PREFIXO} Ajudante`, quantidade: 2, duracao_horas: 4.5 }], maquinarios: [] });
    const ajudante = () => prisma.recursos.findFirst({ where: { nome: `${PREFIXO} Ajudante`, deleted_at: null } });
    afterEach(async () => {
      await limpar();
      await prisma.recursos.deleteMany({ where: { nome: { in: [`${PREFIXO} Ajudante`, `${PREFIXO} Medidor`] } } });
    });

    it('o que não existe é criado com a categoria da REFERÊNCIAS, e a instrução já o usa', async () => {
      const r = await importacao.importar(instrucoes, [comAjudante()], true, usuario, { recursos: [citado({})] });

      expect(r).toMatchObject({ confirmado: true, novos: 1, erros: [] });
      expect(r.outros_cadastros).toEqual([
        { cadastro: 'recurso', acao: 'novo', nome: `${PREFIXO} Ajudante`, detalhe: 'Mão de obra, por hora, R$ 30,77', aba: '01', linha: 16 },
      ]);
      const criado = (await ajudante())!;
      expect([criado.categoria, criado.base_calculo, Number(criado.preco_unitario)]).toEqual(['MAO_DE_OBRA', 'hora', 30.77]);
      expect((await doBanco())!.recursos.map((x) => x.recurso_id.trim())).toEqual([criado.id.trim()]);
    });

    it('a prévia mostra e desfaz: o recurso não fica no cadastro', async () => {
      const r = await importacao.importar(instrucoes, [comAjudante()], false, usuario, { recursos: [citado({})] });

      expect(r).toMatchObject({ confirmado: false, novos: 1, erros: [] });
      expect(r.outros_cadastros).toHaveLength(1);
      expect(await ajudante()).toBeNull();
    });

    it('o que existe com cobrança ou preço diferente tem o cadastro acertado', async () => {
      await prisma.recursos.create({
        data: { categoria: 'MAO_DE_OBRA', base_calculo: 'diaria', rubrica: 'instrucoes', nome: `${PREFIXO} Ajudante`, preco_unitario: 25 },
      });

      const r = await importacao.importar(instrucoes, [comAjudante()], true, comRecursos, { recursos: [citado({})] });

      expect(r.erros).toEqual([]);
      expect(r.outros_cadastros).toEqual([
        expect.objectContaining({ acao: 'alterado', detalhe: 'cobrança por diária → por hora · preço R$ 25,00 → R$ 30,77' }),
      ]);
      const acertado = (await ajudante())!;
      expect([acertado.base_calculo, Number(acertado.preco_unitario)]).toEqual(['hora', 30.77]);
    });

    it('sem recursos.manage, o cadastro diferente fica como está, com aviso (criar segue como o "+" do formulário)', async () => {
      await prisma.recursos.create({
        data: { categoria: 'MAO_DE_OBRA', base_calculo: 'hora', rubrica: 'instrucoes', nome: `${PREFIXO} Ajudante`, preco_unitario: 25 },
      });

      const r = await importacao.importar(instrucoes, [comAjudante()], true, usuario, { recursos: [citado({})] });

      expect(r.erros).toEqual([]);
      expect(r.outros_cadastros).toEqual([]);
      expect(r.avisos).toEqual([
        expect.objectContaining({ linha: 16, mensagem: expect.stringContaining('pede a permissão da tela de Recursos (recursos.manage)') }),
      ]);
      expect(Number((await ajudante())!.preco_unitario)).toBe(25);
    });

    it('o ID DO ITEM de um recurso que hoje tem outro nome é erro: não cria o duplicado', async () => {
      const renomeado = await prisma.recursos.create({
        data: { categoria: 'MAO_DE_OBRA', base_calculo: 'hora', rubrica: 'instrucoes', nome: `${PREFIXO} Medidor`, preco_unitario: 25 },
      });

      const r = await importacao.importar(instrucoes, [ficha({ recursos: [], maquinarios: [] })], false, comRecursos, {
        recursos: [citado({ id: renomeado.id })],
      });

      expect(r.erros).toEqual([expect.objectContaining({ linha: 16, mensagem: expect.stringContaining(`é do recurso "${PREFIXO} Medidor"`) })]);
      expect(r.outros_cadastros).toEqual([]);
    });

    it('com o nome trocado para outro que existe, vale o nome (o ID antigo não trava)', async () => {
      const antigo = await prisma.recursos.create({
        data: { categoria: 'MAO_DE_OBRA', base_calculo: 'hora', rubrica: 'instrucoes', nome: `${PREFIXO} Medidor`, preco_unitario: 25 },
      });
      await prisma.recursos.create({
        data: { categoria: 'MAO_DE_OBRA', base_calculo: 'hora', rubrica: 'instrucoes', nome: `${PREFIXO} Ajudante`, preco_unitario: 30.77 },
      });

      const r = await importacao.importar(instrucoes, [comAjudante()], false, comRecursos, { recursos: [citado({ id: antigo.id })] });

      expect(r).toMatchObject({ erros: [], outros_cadastros: [] });
    });

    it('duas linhas no mesmo recurso, só a segunda diz o preço: vale o preço dela', async () => {
      await prisma.recursos.create({
        data: { categoria: 'MAO_DE_OBRA', base_calculo: 'hora', rubrica: 'instrucoes', nome: `${PREFIXO} Ajudante`, preco_unitario: 25 },
      });

      const r = await importacao.importar(instrucoes, [ficha({ recursos: [], maquinarios: [] })], true, comRecursos, {
        recursos: [citado({ id: '12', preco: null }), citado({ id: '40', preco: 35, aba: '02', linha: 18 })],
      });

      expect(r.erros).toEqual([]);
      expect(r.outros_cadastros).toEqual([expect.objectContaining({ detalhe: 'preço R$ 25,00 → R$ 35,00', aba: '02', linha: 18 })]);
      expect(Number((await ajudante())!.preco_unitario)).toBe(35);
    });

    it('a categoria da REFERÊNCIAS diferente da do cadastro não muda o recurso: aviso', async () => {
      await prisma.recursos.create({
        data: { categoria: 'MAO_DE_OBRA', base_calculo: 'hora', rubrica: 'instrucoes', nome: `${PREFIXO} Ajudante`, preco_unitario: 30.77 },
      });

      const r = await importacao.importar(instrucoes, [ficha({ recursos: [], maquinarios: [] })], false, comRecursos, {
        recursos: [citado({ categoria: 'DESPESA_CAMPO' })],
      });

      expect(r.outros_cadastros).toEqual([]);
      expect(r.avisos).toEqual([expect.objectContaining({ linha: 16, mensagem: expect.stringContaining('A categoria não muda pela planilha') })]);
    });

    it('o removido que a linha aponta pelo ID vale como está: não cria outro nem acerta', async () => {
      const removido = await prisma.recursos.create({
        data: {
          categoria: 'MAO_DE_OBRA', base_calculo: 'hora', rubrica: 'instrucoes', nome: `${PREFIXO} Ajudante`, preco_unitario: 25, deleted_at: new Date(),
        },
      });

      const r = await importacao.importar(instrucoes, [ficha({ recursos: [], maquinarios: [] })], false, comRecursos, {
        recursos: [citado({ id: removido.id })],
      });

      expect(r).toMatchObject({ erros: [], avisos: [], outros_cadastros: [] });
    });

    it('duas linhas (IDs de outro sistema) que chegam ao mesmo recurso com preços diferentes: erro na segunda', async () => {
      await prisma.recursos.create({
        data: { categoria: 'MAO_DE_OBRA', base_calculo: 'hora', rubrica: 'instrucoes', nome: `${PREFIXO} Ajudante`, preco_unitario: 25 },
      });

      const r = await importacao.importar(instrucoes, [ficha({ recursos: [], maquinarios: [] })], false, comRecursos, {
        recursos: [citado({ id: '12', preco: 30 }), citado({ id: '40', preco: 35, aba: '02', linha: 18 })],
      });

      expect(r.erros).toEqual([
        expect.objectContaining({ aba: '02', linha: 18, mensagem: expect.stringContaining('é o mesmo recurso da aba 01, linha 16') }),
      ]);
    });

    it('a REFERÊNCIAS que o front não leu só é erro para o recurso novo', async () => {
      const problemas = ['CATEGORIA "MO" não é uma das categorias.'];

      const novo = await importacao.importar(instrucoes, [ficha({ recursos: [], maquinarios: [] })], false, comRecursos, {
        recursos: [citado({ categoria: null, problemas })],
      });
      expect(novo.erros).toEqual([expect.objectContaining({ linha: 16, mensagem: expect.stringContaining('CATEGORIA "MO"') })]);

      await prisma.recursos.create({
        data: { categoria: 'MAO_DE_OBRA', base_calculo: 'hora', rubrica: 'instrucoes', nome: `${PREFIXO} Ajudante`, preco_unitario: 30.77 },
      });
      const existente = await importacao.importar(instrucoes, [ficha({ recursos: [], maquinarios: [] })], false, comRecursos, {
        recursos: [citado({ categoria: null, problemas })],
      });
      expect(existente).toMatchObject({ erros: [], outros_cadastros: [] });
    });

    it('igual ao cadastro: nada em "Outros cadastros"', async () => {
      await prisma.recursos.create({
        data: { categoria: 'MAO_DE_OBRA', base_calculo: 'hora', rubrica: 'instrucoes', nome: `${PREFIXO} Ajudante`, preco_unitario: 30.77 },
      });

      const r = await importacao.importar(instrucoes, [comAjudante()], false, usuario, { recursos: [citado({})] });

      expect(r).toMatchObject({ erros: [], outros_cadastros: [] });
    });

    it('sem categoria na REFERÊNCIAS, o recurso novo é erro na linha que o cita', async () => {
      const r = await importacao.importar(instrucoes, [comAjudante()], false, usuario, { recursos: [citado({ categoria: null })] });

      expect(r.erros).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ aba: '01', linha: 16, mensagem: expect.stringContaining('a aba REFERÊNCIAS não diz a categoria dele') }),
        ]),
      );
      expect(r.outros_cadastros).toEqual([]);
    });

    it('instrumento com o custo pela amortização: avisa e não muda o cadastro', async () => {
      await prisma.recursos.create({
        data: {
          categoria: 'INSTRUMENTO',
          base_calculo: 'diaria',
          rubrica: 'instrucoes',
          nome: `${PREFIXO} Medidor`,
          valor_aquisicao: 38700,
          prazo_retorno_meses: 12,
          custos_anuais: 2500,
          meta_utilizacao_horas: 150,
          horas_por_diaria: 8,
        },
      });

      const r = await importacao.importar(instrucoes, [ficha({ recursos: [], maquinarios: [] })], false, usuario, {
        recursos: [citado({ nome: `${PREFIXO} Medidor`, categoria: 'INSTRUMENTO', base_calculo: 'diaria', preco: 10 })],
      });

      expect(r.outros_cadastros).toEqual([]);
      expect(r.avisos).toEqual([expect.objectContaining({ linha: 16, mensagem: expect.stringContaining('vem da amortização') })]);
    });

    it('nome repetido no cadastro (categorias diferentes): o ID DO ITEM desempata; sem ele, é erro', async () => {
      const dados = { base_calculo: 'diaria', rubrica: 'instrucoes', nome: `${PREFIXO} Ajudante`, preco_unitario: 25 } as const;
      await prisma.recursos.create({ data: { ...dados, categoria: 'MAO_DE_OBRA' } });
      const despesa = await prisma.recursos.create({ data: { ...dados, categoria: 'DESPESA_CAMPO' } });

      const peloId = await importacao.importar(instrucoes, [ficha({ recursos: [], maquinarios: [] })], true, comRecursos, {
        recursos: [citado({ id: `${despesa.id.trim()} `, categoria: 'DESPESA_CAMPO' })],
      });
      expect(peloId.erros).toEqual([]);
      const depois = await prisma.recursos.findMany({ where: { nome: `${PREFIXO} Ajudante` }, orderBy: { categoria: 'asc' } });
      expect(depois.map((x) => [x.categoria, Number(x.preco_unitario)])).toEqual([
        ['MAO_DE_OBRA', 25],
        ['DESPESA_CAMPO', 30.77],
      ]);

      const semId = await importacao.importar(instrucoes, [ficha({ recursos: [], maquinarios: [] })], false, comRecursos, { recursos: [citado({})] });
      expect(semId.erros).toEqual([expect.objectContaining({ linha: 16, mensagem: expect.stringContaining('há 2 com esse nome') })]);
    });
  });
});
