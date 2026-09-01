import { PrismaClient } from '@prisma/client';
import { categoriaDoEquipamento } from './categoria-do-equipamento';

/**
 * De onde sai a categoria de um equipamento — contra Postgres de verdade.
 *
 * A pergunta parece trivial e nao e: no modelo novo a categoria e da POSICAO,
 * mas o equipamento continua tendo um modelo, que tambem tem categoria. As duas
 * podem divergir, e qual delas vale decide a qual template de plano o
 * equipamento pode ser vinculado.
 */
describe('categoriaDoEquipamento (banco real)', () => {
  const prisma = new PrismaClient();

  const ID_PROPRIETARIO = 'TESTECATPROPRIETARIO00001';
  const ID_PLANTA = 'TESTECATPLANTA0000000001';
  const ID_UNIDADE = 'TESTECATUNIDADE000000001';
  const ID_CAT_POSICAO = 'TESTECATDAPOSICAO0000001';
  const ID_CAT_MODELO = 'TESTECATDOMODELO00000001';
  const ID_TIPO = 'TESTECATTIPO000000000001';

  let posicaoId: string;

  beforeAll(async () => {
    await prisma.usuarios.upsert({
      where: { id: ID_PROPRIETARIO },
      update: {},
      create: { id: ID_PROPRIETARIO, nome: 'Prop teste cat', email: 'cat.teste@exemplo.local' },
    });
    await prisma.plantas.upsert({
      where: { id: ID_PLANTA },
      update: {},
      create: {
        id: ID_PLANTA, nome: 'Planta cat', proprietario_id: ID_PROPRIETARIO,
        cnpj: '00000000000272', localizacao: 'T', horario_funcionamento: '8-18',
        logradouro: 'R 1', cidade: 'Goiania', uf: 'GO', cep: '74000000',
      },
    });
    await prisma.unidades.upsert({
      where: { id: ID_UNIDADE },
      update: {},
      create: {
        id: ID_UNIDADE, planta_id: ID_PLANTA, nome: 'Unid cat', tipo: 'Carga',
        estado: 'GO', cidade: 'Goiania', latitude: 0, longitude: 0, potencia: 0,
      },
    });
    await prisma.categorias_equipamentos.upsert({
      where: { id: ID_CAT_POSICAO }, update: {},
      create: { id: ID_CAT_POSICAO, nome: 'Categoria da posicao' },
    });
    await prisma.categorias_equipamentos.upsert({
      where: { id: ID_CAT_MODELO }, update: {},
      create: { id: ID_CAT_MODELO, nome: 'Categoria do modelo' },
    });
    await prisma.tipos_equipamentos.upsert({
      where: { id: ID_TIPO }, update: {},
      create: {
        id: ID_TIPO, codigo: 'TESTE_CAT_TIPO', nome: 'Tipo de teste',
        categoria_id: ID_CAT_MODELO, fabricante: 'Teste',
      },
    });
  });

  beforeEach(async () => {
    await prisma.ativos_funcionais_equipamentos.deleteMany({});
    await prisma.equipamentos.deleteMany({ where: { unidade_id: ID_UNIDADE } });
    await prisma.ativos_funcionais.deleteMany({ where: { unidade_id: ID_UNIDADE } });

    const posicao = await prisma.ativos_funcionais.create({
      data: { nome: 'Posicao cat', categoria_id: ID_CAT_POSICAO, unidade_id: ID_UNIDADE },
    });
    posicaoId = posicao.id.trim();
  });

  afterAll(async () => { await prisma.$disconnect(); });

  it('usa a categoria da POSICAO quando o equipamento tem posicao', async () => {
    const eq = await prisma.equipamentos.create({
      data: {
        nome: 'Eq com posicao', classificacao: 'UC', criticidade: '3',
        unidade_id: ID_UNIDADE, tipo_equipamento_id: ID_TIPO,
        ativo_funcional_id: posicaoId,
      },
    });

    // O modelo aponta para outra categoria de proposito: e o caso que prova
    // qual das duas vale.
    const categoria = await categoriaDoEquipamento(prisma as any, eq.id);
    expect(categoria).toBe(ID_CAT_POSICAO);
  });

  it('cai para a categoria do modelo enquanto o equipamento nao tem posicao', async () => {
    // Durante a migracao a maioria dos equipamentos esta assim. Devolver null
    // aqui impediria de vincular plano em tudo que ainda nao migrou.
    const eq = await prisma.equipamentos.create({
      data: {
        nome: 'Eq sem posicao', classificacao: 'UC', criticidade: '3',
        unidade_id: ID_UNIDADE, tipo_equipamento_id: ID_TIPO,
      },
    });

    const categoria = await categoriaDoEquipamento(prisma as any, eq.id);
    expect(categoria).toBe(ID_CAT_MODELO);
  });

  it('devolve null quando nao ha posicao nem modelo', async () => {
    const eq = await prisma.equipamentos.create({
      data: {
        nome: 'Eq sem nada', classificacao: 'UC', criticidade: '3',
        unidade_id: ID_UNIDADE,
      },
    });

    expect(await categoriaDoEquipamento(prisma as any, eq.id)).toBeNull();
  });

  it('ignora equipamento removido', async () => {
    const eq = await prisma.equipamentos.create({
      data: {
        nome: 'Eq removido', classificacao: 'UC', criticidade: '3',
        unidade_id: ID_UNIDADE, ativo_funcional_id: posicaoId,
        deleted_at: new Date(),
      },
    });

    expect(await categoriaDoEquipamento(prisma as any, eq.id)).toBeNull();
  });

  it('tolera id com espaco em branco', async () => {
    const eq = await prisma.equipamentos.create({
      data: {
        nome: 'Eq trim', classificacao: 'UC', criticidade: '3',
        unidade_id: ID_UNIDADE, ativo_funcional_id: posicaoId,
      },
    });

    // Os ids sao Char(26) e voltam do banco com padding — comparar sem trim
    // falha calado, e ja custou bug neste projeto.
    expect(await categoriaDoEquipamento(prisma as any, `  ${eq.id}  `)).toBe(ID_CAT_POSICAO);
  });
});
