import { EquipamentosService, PermissionScopeService, PrismaService } from '@/core';
import { PlanosManutencaoService } from '@/modules/planos-manutencao/planos-manutencao.service';
import { PropagacaoPlanosService } from '@/modules/planos-manutencao/propagacao-planos.service';
import { TarefasService } from '@/modules/tarefas/tarefas.service';
import { ImportacaoService } from '../importacao.service';
import { PlanoDaPlanilha, RegistroImportado, UsuarioDaImportacao } from '../importacao.types';
import { EquipamentosImportacao } from './equipamentos.importacao';
import { PlanosImportacao } from './planos.importacao';

/**
 * Equipamentos pela planilha — a ficha da UC com dados técnicos, componentes
 * UAR e o plano. O que mais importa provar: o vínculo de plano faz o mesmo que
 * a tela, e reimportar sem mexer não toca nas tarefas herdadas.
 */
describe('Importação de equipamentos (banco real)', () => {
  const prisma = new PrismaService();
  const escopo = new PermissionScopeService(prisma);
  const importacao = new ImportacaoService(prisma);
  const propagacao = new PropagacaoPlanosService(prisma);
  const planosService = new PlanosManutencaoService(prisma, escopo, propagacao);
  const equipamentos = new EquipamentosImportacao(
    new EquipamentosService(prisma, escopo),
    planosService,
    escopo,
    prisma,
    new PlanosImportacao(planosService, new TarefasService(prisma, escopo, propagacao), prisma),
  );

  const P = 'TESTEIMPEQUIP';
  const DONO = `${P}DONO000000001`.padEnd(26, '0').slice(0, 26);
  const PLANTA = `${P}PLANTA0000001`.padEnd(26, '0').slice(0, 26);
  const UNIDADE = `${P}UNIDADE000001`.padEnd(26, '0').slice(0, 26);
  const UNIDADE_2 = `${P}UNIDADE000002`.padEnd(26, '0').slice(0, 26);
  const CATEGORIA = `${P}CATEGORIA0001`.padEnd(26, '0').slice(0, 26);
  const MODELO = `${P}MODELO0000001`.padEnd(26, '0').slice(0, 26);
  const TEMPLATE = `${P}TEMPLATE00001`.padEnd(26, '0').slice(0, 26);
  const INSTRUCAO = `${P}INSTRUCAO0001`.padEnd(26, '0').slice(0, 26);

  const admin: UsuarioDaImportacao = { id: DONO, role: 'admin', permissions: ['equipamentos.manage', 'manutencao.manage'] };

  beforeAll(async () => {
    await prisma.usuarios.upsert({ where: { id: DONO }, update: {}, create: { id: DONO, nome: 'Dono equip', email: 'dono.equip@importacao.teste' } });
    await prisma.plantas.upsert({
      where: { id: PLANTA }, update: { deleted_at: null },
      create: {
        id: PLANTA, nome: 'Planta Equip Importação', cnpj: '94.000.000/0001-01', proprietario_id: DONO, localizacao: 'Teste',
        horario_funcionamento: '8-18', logradouro: 'Rua 1', cidade: 'Goiânia', uf: 'GO', cep: '74000-000',
      },
    });
    for (const [id, nome] of [[UNIDADE, 'UFV Importação'], [UNIDADE_2, 'Carga Importação']]) {
      await prisma.unidades.upsert({
        where: { id }, update: { deleted_at: null },
        create: { id, planta_id: PLANTA, nome, tipo: 'Geração', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 0 },
      });
    }
    await prisma.categorias_equipamentos.upsert({ where: { id: CATEGORIA }, update: {}, create: { id: CATEGORIA, nome: 'Inversor Importação' } });
    await prisma.tipos_equipamentos.upsert({
      where: { id: MODELO }, update: {},
      create: { id: MODELO, codigo: 'TST_IMP_INVERSOR', nome: 'Inversor de teste', categoria_id: CATEGORIA, fabricante: 'Fabricante Teste' },
    });
    await prisma.instrucoes.upsert({
      where: { id: INSTRUCAO }, update: { deleted_at: null },
      create: {
        id: INSTRUCAO, codigo: 'TST-IMP-EQ1', nome: 'Inspeção do inversor', descricao: 'Teste',
      },
    });
    await prisma.planos_manutencao.upsert({
      where: { id: TEMPLATE }, update: { deleted_at: null },
      create: { id: TEMPLATE, nome: 'Plano do inversor (teste)', categoria_id: CATEGORIA, versao: '1.0' },
    });
    await prisma.tarefas.deleteMany({ where: { plano_manutencao_id: TEMPLATE } });
    await prisma.tarefas.create({
      data: { plano_manutencao_id: TEMPLATE, tag: 'TST-IMP-EQ-T1', nome: 'Inspeção mensal', instrucao_id: INSTRUCAO, frequencia: 'MENSAL', criticidade: 3, ordem: 1 },
    });
  });

  const limpar = async () => {
    const ucs = await prisma.equipamentos.findMany({ where: { unidade_id: { in: [UNIDADE, UNIDADE_2] } }, select: { id: true } });
    const ids = ucs.map((u) => u.id);
    const copias = await prisma.planos_manutencao.findMany({ where: { equipamento_id: { in: ids.map((i) => i.trim()) } } });
    await prisma.tarefas.deleteMany({ where: { plano_manutencao_id: { in: copias.map((c) => c.id) } } });
    await prisma.planos_manutencao.deleteMany({ where: { id: { in: copias.map((c) => c.id) } } });
    await prisma.equipamentos_dados_tecnicos.deleteMany({ where: { equipamento_id: { in: ids } } });
    await prisma.equipamentos.deleteMany({ where: { equipamento_pai_id: { in: ids } } });
    await prisma.equipamentos.deleteMany({ where: { id: { in: ids } } });
  };

  beforeEach(limpar);
  afterAll(async () => {
    await limpar();
    await prisma.tarefas.deleteMany({ where: { plano_manutencao_id: TEMPLATE } });
    await prisma.propagacoes_plano.deleteMany({ where: { plano_id: TEMPLATE } });
    await prisma.planos_manutencao.deleteMany({ where: { id: TEMPLATE } });
    await prisma.instrucoes.deleteMany({ where: { id: INSTRUCAO } });
    await prisma.tipos_equipamentos.deleteMany({ where: { id: MODELO } });
    await prisma.categorias_equipamentos.deleteMany({ where: { id: CATEGORIA } });
    await prisma.unidades.deleteMany({ where: { id: { in: [UNIDADE, UNIDADE_2] } } });
    await prisma.plantas.deleteMany({ where: { id: PLANTA } });
    await prisma.usuarios.deleteMany({ where: { id: DONO } });
    await prisma.$disconnect();
  });

  const ficha = (dados: Record<string, unknown> = {}, id: string | null = null): RegistroImportado => ({
    id,
    aba: '01',
    linha: 1,
    atualizado_em: null,
    dados: {
      nome: 'Inversor 01',
      planta: 'Planta Equip Importação',
      unidade: 'UFV Importação',
      modelo: 'TST_IMP_INVERSOR',
      criticidade: '4',
      numero_serie: 'SN-123',
      localizacao: 'Casa de inversores',
      valor_contabil: 15000.5,
      data_imobilizacao: '2026-03-15',
      // SN-66
      data_instalacao: '2026-04-01',
      garantia_ate: '2031-04-01',
      fornecedor: 'Distribuidora Solar',
      centro_custo: 'CC-UFV1',
      status: 'Ativo',
      mcpse: false,
      plano: 'plano do inversor (teste)',
      dados_tecnicos: [{ _linha: 30, campo: 'potencia', valor: '75', tipo: 'number', unidade: 'kW' }],
      componentes: [{ _linha: 35, nome: 'String 01', criticidade: '3', fornecedor: 'Fornecedor X', garantia_ate: '2028-01-10', centro_custo: 'CC-STR' }],
      ...dados,
    },
  });

  const uc = () => prisma.equipamentos.findFirst({ where: { unidade_id: UNIDADE, classificacao: 'UC' } });
  const copiaDoPlano = async () => {
    const e = (await uc())!;
    return prisma.planos_manutencao.findFirst({ where: { equipamento_id: e.id.trim(), deleted_at: null } });
  };
  const tarefasDaCopia = async () => {
    const copia = (await copiaDoPlano())!;
    return prisma.tarefas.findMany({ where: { plano_manutencao_id: copia.id, deleted_at: null } });
  };

  it('a prévia não cria a UC nem a cópia do plano', async () => {
    const r = await importacao.importar(equipamentos, [ficha()], false, admin);

    expect(r).toMatchObject({ novos: 1, erros: [] });
    expect(await uc()).toBeNull();
  });

  it('confirmar cria a UC com modelo, dados técnicos, componente e o plano vinculado (tarefas herdadas)', async () => {
    const r = await importacao.importar(equipamentos, [ficha()], true, admin);

    expect(r).toMatchObject({ confirmado: true, novos: 1, erros: [] });
    const e = (await uc())!;
    expect(e).toMatchObject({ tipo_equipamento: 'TST_IMP_INVERSOR', fabricante: 'Fabricante Teste', criticidade: '4' });
    expect(e.data_imobilizacao?.toISOString()).toBe('2026-03-15T00:00:00.000Z');
    expect(e).toMatchObject({ fornecedor: 'Distribuidora Solar', centro_custo: 'CC-UFV1' });
    expect([e.data_instalacao?.toISOString(), e.garantia_ate?.toISOString()]).toEqual(['2026-04-01T00:00:00.000Z', '2031-04-01T00:00:00.000Z']);
    expect(await prisma.equipamentos_dados_tecnicos.count({ where: { equipamento_id: e.id } })).toBe(1);
    expect(await prisma.equipamentos.count({ where: { equipamento_pai_id: e.id, classificacao: 'UAR' } })).toBe(1);
    expect((await copiaDoPlano())?.plano_origem_id?.trim()).toBe(TEMPLATE);
    expect((await tarefasDaCopia()).map((t) => t.origem_status)).toEqual(['HERDADA']);
  });

  it('reimportar sem mexer não muda nada — tarefa herdada continua herdada, criticidade antiga fica', async () => {
    await importacao.importar(equipamentos, [ficha()], true, admin);
    const e = (await uc())!;
    await prisma.equipamentos.update({ where: { id: e.id }, data: { criticidade: 'A' } });
    const [componente] = await prisma.equipamentos.findMany({ where: { equipamento_pai_id: e.id } });

    const r = await importacao.importar(
      equipamentos,
      [
        ficha(
          {
            criticidade: 'A',
            plano_ref: TEMPLATE,
            componentes: [
              { id: componente.id.trim(), nome: 'String 01', criticidade: '3', fornecedor: 'Fornecedor X', garantia_ate: '2028-01-10', centro_custo: 'CC-STR' },
            ],
          },
          e.id.trim(),
        ),
      ],
      true,
      admin,
    );

    expect(r).toMatchObject({ inalterados: 1, alterados: 0, erros: [] });
    expect((await tarefasDaCopia()).map((t) => t.origem_status)).toEqual(['HERDADA']);
  });

  // SN-66: a garantia e o centro de custo entram no retrato (mudou = alterado)
  it('trocar a garantia da UC e o centro de custo do componente é alteração, e grava', async () => {
    await importacao.importar(equipamentos, [ficha()], true, admin);
    const e = (await uc())!;
    const [componente] = await prisma.equipamentos.findMany({ where: { equipamento_pai_id: e.id } });

    const r = await importacao.importar(
      equipamentos,
      [
        ficha(
          {
            garantia_ate: '2032-04-01',
            plano_ref: TEMPLATE,
            componentes: [
              { id: componente.id.trim(), nome: 'String 01', criticidade: '3', fornecedor: 'Fornecedor X', garantia_ate: '2028-01-10', centro_custo: 'CC-NOVO' },
            ],
          },
          e.id.trim(),
        ),
      ],
      true,
      admin,
    );

    expect(r).toMatchObject({ alterados: 1, erros: [] });
    expect((await uc())!.garantia_ate?.toISOString()).toBe('2032-04-01T00:00:00.000Z');
    expect((await prisma.equipamentos.findUniqueOrThrow({ where: { id: componente.id } })).centro_custo).toBe('CC-NOVO');
  });

  // SN-64: as notas e o motivo entram no retrato; a regra da matriz é a do sheet
  it('avaliar a criticidade pela planilha: sem motivo para o nível diferente é erro; com ele grava, e reimportar não muda nada', async () => {
    await importacao.importar(equipamentos, [ficha()], true, admin);
    const e = (await uc())!;
    const [componente] = await prisma.equipamentos.findMany({ where: { equipamento_pai_id: e.id } });
    const avaliada = (motivo: string | null) =>
      ficha(
        {
          criticidade: '4',
          criticidade_impacto: 2,
          criticidade_probabilidade: 2,
          criticidade_motivo: motivo,
          plano_ref: TEMPLATE,
          componentes: [
            {
              id: componente.id.trim(), nome: 'String 01', criticidade: '3', fornecedor: 'Fornecedor X', garantia_ate: '2028-01-10',
              centro_custo: 'CC-STR', criticidade_impacto: 3, criticidade_probabilidade: 3,
            },
          ],
        },
        e.id.trim(),
      );

    const semMotivo = await importacao.importar(equipamentos, [avaliada(null)], false, admin);
    expect(semMotivo.erros).toEqual([
      expect.objectContaining({ mensagem: expect.stringContaining('A matriz sugere 2 (Baixa) para impacto 2 e probabilidade 2. Para gravar 4, informe o motivo.') }),
    ]);

    const r = await importacao.importar(equipamentos, [avaliada('Alimenta a subestação')], true, admin);
    expect(r).toMatchObject({ alterados: 1, erros: [] });
    const gravada = (await uc())!;
    expect([gravada.criticidade, gravada.criticidade_impacto, gravada.criticidade_probabilidade, gravada.criticidade_motivo]).toEqual([
      '4', 2, 2, 'Alimenta a subestação',
    ]);
    const c = await prisma.equipamentos.findUniqueOrThrow({ where: { id: componente.id } });
    expect([c.criticidade_impacto, c.criticidade_probabilidade, c.criticidade_motivo]).toEqual([3, 3, null]);

    const deNovo = await importacao.importar(equipamentos, [avaliada('Alimenta a subestação')], true, admin);
    expect(deNovo).toMatchObject({ inalterados: 1, alterados: 0, erros: [] });
  });

  it('a matriz no componente: o erro sai na linha dele, com o nome; o novo sem nível fica com o sugerido', async () => {
    await importacao.importar(equipamentos, [ficha()], true, admin);
    const e = (await uc())!;
    const [componente] = await prisma.equipamentos.findMany({ where: { equipamento_pai_id: e.id } });
    const comComponentes = (componentes: Array<Record<string, unknown>>) =>
      ficha({ plano_ref: TEMPLATE, componentes }, e.id.trim());
    const existente = { id: componente.id.trim(), nome: 'String 01', criticidade: '3', fornecedor: 'Fornecedor X', garantia_ate: '2028-01-10', centro_custo: 'CC-STR' };

    const r = await importacao.importar(
      equipamentos,
      [comComponentes([{ _linha: 35, ...existente, criticidade: '5', criticidade_impacto: 3, criticidade_probabilidade: 3 }])],
      false,
      admin,
    );
    expect(r.erros).toEqual([
      expect.objectContaining({ linha: 35, mensagem: 'String 01: A matriz sugere 3 (Média) para impacto 3 e probabilidade 3. Para gravar 5, informe o motivo.' }),
    ]);

    const novo = await importacao.importar(
      equipamentos,
      [comComponentes([{ _linha: 35, ...existente }, { _linha: 36, nome: 'String 02', criticidade_impacto: 5, criticidade_probabilidade: 1 }])],
      true,
      admin,
    );
    expect(novo).toMatchObject({ alterados: 1, erros: [] });
    const criado = await prisma.equipamentos.findFirstOrThrow({ where: { equipamento_pai_id: e.id, nome: 'String 02' } });
    expect([criado.criticidade, criado.criticidade_impacto, criado.criticidade_probabilidade]).toEqual(['4', 5, 1]);
  });

  it('a unidade de uma UC não se troca; componente de outra UC é erro na linha dele', async () => {
    await importacao.importar(equipamentos, [ficha()], true, admin);
    const e = (await uc())!;

    const r = await importacao.importar(
      equipamentos,
      [ficha({ unidade: 'Carga Importação', componentes: [{ _linha: 35, id: 'componentedeoutrauc0000001', nome: 'X' }] }, e.id.trim())],
      false,
      admin,
    );

    expect(r.erros).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ campo: 'unidade', mensagem: expect.stringContaining('não se troca') }),
        expect.objectContaining({ linha: 35, mensagem: expect.stringContaining('não é desta UC') }),
      ]),
    );
  });

  it('erro do dado técnico aponta a linha dele', async () => {
    const r = await importacao.importar(
      equipamentos,
      [ficha({ dados_tecnicos: [{ _linha: 31, campo: '', valor: '1', tipo: 'number' }] })],
      false,
      admin,
    );

    expect(r.erros[0]).toMatchObject({ linha: 31, campo: 'dados_tecnicos.0.campo' });
  });

  it('quem tem escopo não cria UC em unidade fora das suas plantas', async () => {
    const proprietario: UsuarioDaImportacao = { id: 'outrodonoforadoescopo0001', role: 'proprietario', permissions: ['equipamentos.manage'] };

    const r = await importacao.importar(equipamentos, [ficha({ plano: null })], false, proprietario);

    expect(r.erros[0]).toMatchObject({ campo: 'unidade' });
    expect(await uc()).toBeNull();
  });

  /**
   * SN-98 (decisão do usuário, 23/out/2026): o plano da coluna PLANO que não
   * existe é criado antes do equipamento — o template da CATEGORIA da aba, com as
   * TAREFAS DO PLANO — e o equipamento é vinculado a ele no mesmo confirmar.
   */
  describe('planos citados pela planilha', () => {
    const NOVO = 'Plano novo pela planilha (teste)';
    const citado = (extra: Partial<PlanoDaPlanilha> = {}): PlanoDaPlanilha => ({
      nome: NOVO,
      categoria: 'Inversor Importação',
      tarefas: [{ nome: 'Inspeção semestral', instrucao: 'TST-IMP-EQ1', frequencia: 'SEMESTRAL', frequencia_personalizada: null, criticidade: 4 }],
      aba: '01',
      linha: 25,
      linha_das_tarefas: 40,
      plano_ref: null,
      equipamento_id: null,
      problemas: [],
      ...extra,
    });
    const outraTarefa = { nome: 'Limpeza mensal', instrucao: 'TST-IMP-EQ1', frequencia: 'MENSAL', frequencia_personalizada: null, criticidade: 2 };
    const template = () => prisma.planos_manutencao.findFirst({ where: { nome: NOVO, plano_origem_id: null, deleted_at: null } });
    afterEach(async () => {
      await limpar();
      const criados = await prisma.planos_manutencao.findMany({ where: { nome: NOVO } });
      await prisma.tarefas.deleteMany({ where: { plano_manutencao_id: { in: criados.map((c) => c.id) } } });
      await prisma.propagacoes_plano.deleteMany({ where: { plano_id: { in: criados.map((c) => c.id) } } });
      await prisma.planos_manutencao.deleteMany({ where: { nome: NOVO } });
    });

    it('o que não existe é criado na categoria da aba, com as tarefas, e o equipamento já é vinculado a ele', async () => {
      const r = await importacao.importar(equipamentos, [ficha({ plano: NOVO })], true, admin, { planos: [citado()] });

      expect(r).toMatchObject({ confirmado: true, novos: 1, erros: [] });
      expect(r.outros_cadastros).toEqual([
        { cadastro: 'plano', acao: 'novo', nome: NOVO, detalhe: 'categoria Inversor Importação, 1 tarefa', aba: '01', linha: 25 },
      ]);
      const t = (await template())!;
      expect(t.categoria_id?.trim()).toBe(CATEGORIA);
      const tarefasDoTemplate = await prisma.tarefas.findMany({ where: { plano_manutencao_id: t.id, deleted_at: null } });
      expect(tarefasDoTemplate.map((x) => [x.nome, x.instrucao_id?.trim(), x.frequencia, x.criticidade])).toEqual([
        ['Inspeção semestral', INSTRUCAO, 'SEMESTRAL', 4],
      ]);
      expect((await copiaDoPlano())!.plano_origem_id?.trim()).toBe(t.id.trim());
      expect((await tarefasDaCopia()).map((x) => [x.nome, x.origem_status])).toEqual([['Inspeção semestral', 'HERDADA']]);
    });

    it('a prévia mostra e desfaz: o plano não fica', async () => {
      const r = await importacao.importar(equipamentos, [ficha({ plano: NOVO })], false, admin, { planos: [citado()] });

      expect(r).toMatchObject({ novos: 1, erros: [] });
      expect(r.outros_cadastros).toHaveLength(1);
      expect(await template()).toBeNull();
    });

    it('o que já existe não é recriado nem mexido', async () => {
      const r = await importacao.importar(equipamentos, [ficha()], false, admin, {
        planos: [citado({ nome: 'Plano do inversor (teste)', tarefas: [] })],
      });

      expect(r).toMatchObject({ erros: [], outros_cadastros: [] });
    });

    it('no que já existe, tarefas diferentes entre abas e linha ilegível não são erro (as cópias customizadas)', async () => {
      const r = await importacao.importar(equipamentos, [ficha()], false, admin, {
        planos: [
          citado({ nome: 'Plano do inversor (teste)', equipamento_id: 'E1' }),
          citado({
            nome: 'plano do INVERSOR (teste)', aba: '02', equipamento_id: 'E2', tarefas: [outraTarefa],
            problemas: [{ linha: 44, mensagem: 'PERIODICIDADE "A cada ? dias" ...' }],
          }),
        ],
      });
      // Equipamentos que já existem: as tarefas são as da cópia de cada um, e não há o que avisar
      expect(r.avisos).toEqual([]);

      expect(r).toMatchObject({ erros: [], outros_cadastros: [] });
    });

    it('equipamento novo com tarefas que não são as do plano que existe: aviso de que ficam de fora', async () => {
      const doPlano = { nome: 'Inspeção mensal', instrucao: 'Inspeção do inversor', frequencia: 'MENSAL', frequencia_personalizada: null, criticidade: 3 };

      const diferentes = await importacao.importar(equipamentos, [ficha()], false, admin, {
        planos: [citado({ nome: 'Plano do inversor (teste)', tarefas: [doPlano, outraTarefa] })],
      });
      expect(diferentes.avisos).toEqual([expect.objectContaining({ aba: '01', linha: 40, mensagem: expect.stringContaining('ficam de fora') })]);
      expect(diferentes.outros_cadastros).toEqual([]);

      // As do plano (a instrução pelo código ou pelo nome): nada a avisar
      const iguais = await importacao.importar(equipamentos, [ficha()], false, admin, {
        planos: [citado({ nome: 'Plano do inversor (teste)', tarefas: [{ ...doPlano, instrucao: 'tst-imp-eq1' }] })],
      });
      expect(iguais.avisos).toEqual([]);
    });

    it('o ID DO PLANO de um template que hoje tem outro nome é erro (o renomeado): não cria o duplicado', async () => {
      const r = await importacao.importar(equipamentos, [ficha({ plano: NOVO })], false, admin, { planos: [citado({ plano_ref: `${TEMPLATE} ` })] });

      expect(r.erros).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ aba: '01', linha: 25, mensagem: expect.stringContaining('é do plano "Plano do inversor (teste)"') }),
        ]),
      );
      expect(r.outros_cadastros).toEqual([]);
      expect(await template()).toBeNull();
    });

    it('equipamento que tem plano e vai para um que a importação cria: aviso (pode ser o renomeado sem o ID DO PLANO)', async () => {
      await importacao.importar(equipamentos, [ficha()], true, admin);
      const id = (await uc())!.id.trim();

      const r = await importacao.importar(equipamentos, [ficha({ plano: NOVO }, id)], false, admin, { planos: [citado({ equipamento_id: id })] });

      expect(r.outros_cadastros).toEqual([expect.objectContaining({ nome: NOVO, acao: 'novo' })]);
      expect(r.avisos).toEqual(
        expect.arrayContaining([expect.objectContaining({ aba: '01', linha: 25, mensagem: expect.stringContaining('sai do plano "Plano do inversor (teste)"') })]),
      );
    });

    it('o plano de hoje do equipamento não é recriado: a cópia com outro nome, e o template dela excluído', async () => {
      await importacao.importar(equipamentos, [ficha()], true, admin);
      const id = (await uc())!.id.trim();
      const copia = (await copiaDoPlano())!;
      const comoExportado = (plano: string) => [ficha({ plano }, id)];

      // A cópia com o nome de antes da propagação
      await prisma.planos_manutencao.update({ where: { id: copia.id }, data: { nome: NOVO } });
      const daCopia = await importacao.importar(equipamentos, comoExportado(NOVO), false, admin, { planos: [citado({ equipamento_id: id })] });
      expect(daCopia).toMatchObject({ erros: [], outros_cadastros: [] });
      expect(await template()).toBeNull();
      await prisma.planos_manutencao.update({ where: { id: copia.id }, data: { nome: 'Plano do inversor (teste)' } });

      // O template excluído: a exportação escreve o nome dele (ou o da cópia), e ele não volta
      await prisma.planos_manutencao.update({ where: { id: TEMPLATE }, data: { deleted_at: new Date() } });
      try {
        const doExcluido = await importacao.importar(equipamentos, comoExportado('Plano do inversor (teste)'), false, admin, {
          planos: [citado({ nome: 'Plano do inversor (teste)', equipamento_id: id, plano_ref: TEMPLATE })],
        });
        expect(doExcluido).toMatchObject({ erros: [], outros_cadastros: [] });
      } finally {
        await prisma.planos_manutencao.update({ where: { id: TEMPLATE }, data: { deleted_at: null } });
      }
    });

    it('no novo, a aba com a seção vazia aceita as tarefas da outra', async () => {
      const r = await importacao.importar(equipamentos, [ficha({ plano: NOVO })], false, admin, {
        planos: [citado({ tarefas: [], categoria: null }), citado({ aba: '02' })],
      });

      expect(r).toMatchObject({ erros: [] });
      expect(r.outros_cadastros).toEqual([expect.objectContaining({ nome: NOVO, detalhe: 'categoria Inversor Importação, 1 tarefa', aba: '01' })]);
    });

    it('no novo, abas com tarefas ou categorias diferentes são erro na aba que discorda', async () => {
      const r = await importacao.importar(equipamentos, [ficha({ plano: NOVO })], false, admin, {
        planos: [citado(), citado({ aba: '02', tarefas: [outraTarefa] }), citado({ aba: '03', categoria: 'Outra categoria' })],
      });

      expect(r.erros).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ aba: '02', linha: 40, mensagem: expect.stringContaining('diferentes das da aba 01') }),
          expect.objectContaining({ aba: '03', linha: 25, mensagem: expect.stringContaining('categoria Outra categoria') }),
        ]),
      );
      expect(r.outros_cadastros).toEqual([]);
    });

    it('no novo, a linha de tarefa que o front não leu é erro onde ela está', async () => {
      const r = await importacao.importar(equipamentos, [ficha({ plano: NOVO })], false, admin, {
        planos: [citado({ problemas: [{ linha: 42, mensagem: 'PERIODICIDADE "Toda hora" não é uma das periodicidades.' }] })],
      });

      expect(r.erros).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ aba: '01', linha: 42, mensagem: 'Plano "Plano novo pela planilha (teste)": PERIODICIDADE "Toda hora" não é uma das periodicidades.' }),
        ]),
      );
      expect(await template()).toBeNull();
    });

    it('a instrução que não existe é erro, com a tarefa no texto', async () => {
      const r = await importacao.importar(equipamentos, [ficha({ plano: NOVO })], false, admin, {
        planos: [citado({ tarefas: [{ nome: 'Limpeza', instrucao: 'INSTRUÇÃO QUE NÃO EXISTE', frequencia: 'MENSAL', frequencia_personalizada: null, criticidade: 3 }] })],
      });

      expect(r.erros).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ aba: '01', linha: 40, mensagem: expect.stringMatching(/^Plano "Plano novo pela planilha \(teste\)": tarefa 1 \(Limpeza\): /) }),
        ]),
      );
      expect(await template()).toBeNull();
    });

    it('sem manutencao.manage, criar o plano é recusado', async () => {
      const semPlanos: UsuarioDaImportacao = { ...admin, permissions: ['equipamentos.manage'] };

      const r = await importacao.importar(equipamentos, [ficha({ plano: NOVO })], false, semPlanos, { planos: [citado()] });

      expect(r.erros).toEqual(expect.arrayContaining([expect.objectContaining({ linha: 25, mensagem: expect.stringContaining('manutencao.manage') })]));
    });
  });
});
