import { PrismaClient } from '@prisma/client';
import { migrarEquipamentosParaPosicoes } from './migrar-equipamentos';

/**
 * A migracao dos equipamentos existentes para posicao + fisico.
 *
 * Roda uma vez por ambiente, contra dado real. Por isso o que ela precisa provar
 * nao e "o codigo compila": e que os criterios de exclusao valem, que os campos
 * certos sobem para a posicao, e que rodar duas vezes nao duplica nada — porque
 * numa migracao a segunda execucao acontece, nem que seja por engano.
 */
describe('migrarEquipamentosParaPosicoes (banco real)', () => {
  const prisma = new PrismaClient();

  const ID_PROP = 'TESTEMIGPROPRIETARIO00001';
  const ID_PLANTA = 'TESTEMIGPLANTA0000000001';
  const ID_UNIDADE = 'TESTEMIGUNIDADE000000001';
  const ID_CATEGORIA = 'TESTEMIGCATEGORIA0000001';
  const ID_TIPO = 'TESTEMIGTIPO000000000001';

  beforeAll(async () => {
    await prisma.usuarios.upsert({
      where: { id: ID_PROP }, update: {},
      create: { id: ID_PROP, nome: 'Prop migracao', email: 'migracao.teste@exemplo.local' },
    });
    await prisma.plantas.upsert({
      where: { id: ID_PLANTA }, update: {},
      create: {
        id: ID_PLANTA, nome: 'Planta migracao', proprietario_id: ID_PROP,
        cnpj: '00000000000353', localizacao: 'T', horario_funcionamento: '8-18',
        logradouro: 'R 1', cidade: 'Goiania', uf: 'GO', cep: '74000000',
      },
    });
    await prisma.unidades.upsert({
      where: { id: ID_UNIDADE }, update: {},
      create: {
        id: ID_UNIDADE, planta_id: ID_PLANTA, nome: 'Unidade migracao', tipo: 'Carga',
        estado: 'GO', cidade: 'Goiania', latitude: 0, longitude: 0, potencia: 0,
      },
    });
    await prisma.categorias_equipamentos.upsert({
      where: { id: ID_CATEGORIA }, update: {},
      create: { id: ID_CATEGORIA, nome: 'Categoria migracao' },
    });
    await prisma.tipos_equipamentos.upsert({
      where: { id: ID_TIPO }, update: {},
      create: {
        id: ID_TIPO, codigo: 'TESTE_MIG_TIPO', nome: 'Tipo migracao',
        categoria_id: ID_CATEGORIA, fabricante: 'Teste',
      },
    });
  });

  beforeEach(async () => {
    // Ordem importa: o equipamento aponta para a posicao por FK. Apagar posicao
    // com equipamento ainda apontando viola a constraint, e o teste falha por
    // sujeira de limpeza — nao por defeito no codigo.
    await prisma.ativos_funcionais_equipamentos.deleteMany({});
    await prisma.equipamentos.updateMany({ data: { ativo_funcional_id: null, ativo_na_posicao: false } });
    await prisma.equipamentos.deleteMany({ where: { unidade_id: ID_UNIDADE } });
    await prisma.equipamentos.deleteMany({ where: { nome: { startsWith: 'MIG ' } } });
    await prisma.ativos_funcionais.deleteMany({ where: { unidade_id: ID_UNIDADE } });
  });

  afterAll(async () => { await prisma.$disconnect(); });

  const criarUC = (nome: string, extra: any = {}) =>
    prisma.equipamentos.create({
      data: {
        nome, classificacao: 'UC', criticidade: '3',
        unidade_id: ID_UNIDADE, tipo_equipamento_id: ID_TIPO,
        localizacao: 'Sala 1', localizacao_especifica: 'Painel A',
        ...extra,
      },
    });

  it('cria uma posicao e um vinculo aberto para cada UC', async () => {
    const uc = await criarUC('MIG Inversor 1');

    await migrarEquipamentosParaPosicoes(prisma as any);

    const eq = await prisma.equipamentos.findUnique({ where: { id: uc.id } });
    expect(eq?.ativo_funcional_id).not.toBeNull();
    expect(eq?.ativo_na_posicao).toBe(true);

    const vinculos = await prisma.ativos_funcionais_equipamentos.findMany({
      where: { equipamento_id: uc.id },
    });
    expect(vinculos).toHaveLength(1);
    expect(vinculos[0].removido_em).toBeNull();
  });

  it('sobe nome, categoria, instalacao e localizacao para a posicao', async () => {
    const uc = await criarUC('MIG Motor 3/11');
    await migrarEquipamentosParaPosicoes(prisma as any);

    const eq = await prisma.equipamentos.findUnique({
      where: { id: uc.id },
      include: { ativo_funcional: true },
    });

    expect(eq?.ativo_funcional?.nome).toBe('MIG Motor 3/11');
    expect(eq?.ativo_funcional?.categoria_id.trim()).toBe(ID_CATEGORIA);
    expect(eq?.ativo_funcional?.unidade_id.trim()).toBe(ID_UNIDADE);
    expect(eq?.ativo_funcional?.localizacao).toBe('Sala 1');
    expect(eq?.ativo_funcional?.localizacao_especifica).toBe('Painel A');
  });

  it('nao cria posicao para UAR', async () => {
    const pai = await criarUC('MIG UC pai');
    await prisma.equipamentos.create({
      data: {
        nome: 'MIG Barramento', classificacao: 'UAR', criticidade: '3',
        unidade_id: ID_UNIDADE, equipamento_pai_id: pai.id,
      },
    });

    const relatorio = await migrarEquipamentosParaPosicoes(prisma as any);

    // O UAR e peca do equipamento, nao posicao da instalacao.
    const uar = await prisma.equipamentos.findFirst({ where: { nome: 'MIG Barramento' } });
    expect(relatorio.detalhes.some(d => d.id === uar!.id.trim() && /peca/.test(d.motivo))).toBe(true);
    expect(uar?.ativo_funcional_id).toBeNull();
  });

  it('deixa de fora quem nao tem instalacao', async () => {
    // `ativos_funcionais.unidade_id` e NOT NULL: posicao sem instalacao nao existe.
    await prisma.equipamentos.create({
      data: { nome: 'MIG Sem unidade', classificacao: 'UC', criticidade: '3', tipo_equipamento_id: ID_TIPO },
    });

    const relatorio = await migrarEquipamentosParaPosicoes(prisma as any);

    const semUnidade = await prisma.equipamentos.findFirst({ where: { nome: "MIG Sem unidade" } });
    expect(semUnidade?.ativo_funcional_id).toBeNull();
    expect(relatorio.detalhes.some(d => d.id === semUnidade!.id.trim() && /instalacao/.test(d.motivo))).toBe(true);
  });

  it('deixa de fora quem nao tem tipo, porque nao ha categoria', async () => {
    await prisma.equipamentos.create({
      data: { nome: 'MIG Sem tipo', classificacao: 'UC', criticidade: '3', unidade_id: ID_UNIDADE },
    });

    const relatorio = await migrarEquipamentosParaPosicoes(prisma as any);

    // Afirmacao sobre o REGISTRO, nao sobre o total: o banco de teste e
    // compartilhado entre as suites, e contagem global depende de quem rodou
    // antes.
    const semTipo = await prisma.equipamentos.findFirst({ where: { nome: "MIG Sem tipo" } });
    expect(semTipo?.ativo_funcional_id).toBeNull();
    expect(relatorio.detalhes.some(d => d.id === semTipo!.id.trim() && /sem tipo/.test(d.motivo))).toBe(true);
  });

  it('rodar duas vezes nao duplica', async () => {
    await criarUC('MIG Idempotente');

    await migrarEquipamentosParaPosicoes(prisma as any);
    const segunda = await migrarEquipamentosParaPosicoes(prisma as any);

    const eq = await prisma.equipamentos.findFirst({ where: { nome: "MIG Idempotente" } });
    expect(segunda.detalhes.some(d => d.id === eq!.id.trim() && /ja tem posicao/.test(d.motivo))).toBe(true);

    // uma posicao, nao duas
    const posicoes = await prisma.ativos_funcionais.count({ where: { unidade_id: ID_UNIDADE } });
    expect(posicoes).toBe(1);

    const vinculos = await prisma.ativos_funcionais_equipamentos.count({
      where: { equipamento_id: eq!.id },
    });
    expect(vinculos).toBe(1);
  });

  it('nao grava nada quando roda em modo simulacao', async () => {
    await criarUC('MIG Simulacao');

    const relatorio = await migrarEquipamentosParaPosicoes(prisma as any, { simular: true });

    expect(relatorio.migrados).toBeGreaterThan(0); // conta o que faria
    expect(await prisma.ativos_funcionais.count({ where: { unidade_id: ID_UNIDADE } })).toBe(0);
  });
});
