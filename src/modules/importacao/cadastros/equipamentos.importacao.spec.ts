import { EquipamentosService, PermissionScopeService, PrismaService } from '@/core';
import { PlanosManutencaoService } from '@/modules/planos-manutencao/planos-manutencao.service';
import { PropagacaoPlanosService } from '@/modules/planos-manutencao/propagacao-planos.service';
import { ImportacaoService } from '../importacao.service';
import { RegistroImportado, UsuarioDaImportacao } from '../importacao.types';
import { EquipamentosImportacao } from './equipamentos.importacao';

/**
 * Equipamentos pela planilha — a ficha da UC com dados técnicos, componentes
 * UAR e o plano. O que mais importa provar: o vínculo de plano faz o mesmo que
 * a tela, e reimportar sem mexer não toca nas tarefas herdadas.
 */
describe('Importação de equipamentos (banco real)', () => {
  const prisma = new PrismaService();
  const escopo = new PermissionScopeService(prisma);
  const importacao = new ImportacaoService(prisma);
  const equipamentos = new EquipamentosImportacao(
    new EquipamentosService(prisma, escopo),
    new PlanosManutencaoService(prisma, escopo, new PropagacaoPlanosService(prisma)),
    escopo,
    prisma,
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
        id: INSTRUCAO, tag: 'TST-IMP-EQ1', nome: 'Inspeção do inversor', descricao: 'Teste', categoria: 'INSPECAO',
        tipo_manutencao: 'PREVENTIVA', condicao_ativo: 'QUALQUER', criticidade: 3, duracao_estimada: 1, tempo_estimado: 60,
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
      status: 'Ativo',
      mcpse: false,
      plano: 'plano do inversor (teste)',
      dados_tecnicos: [{ _linha: 30, campo: 'potencia', valor: '75', tipo: 'number', unidade: 'kW' }],
      componentes: [{ _linha: 35, nome: 'String 01', criticidade: '3', fornecedor: 'Fornecedor X' }],
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
            componentes: [{ id: componente.id.trim(), nome: 'String 01', criticidade: '3', fornecedor: 'Fornecedor X' }],
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
});
