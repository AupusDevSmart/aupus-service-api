import { PermissionScopeService, PrismaService } from '@/core';
import { ClassificacaoEquipamento, CreateEquipamentoDto, CriticidadeEquipamento } from './dto/create-equipamento.dto';
import { EquipamentosService } from './equipamentos.service';

/**
 * A criticidade pela matriz impacto × probabilidade (SN-64) nos caminhos de
 * gravação do equipamento: criar, editar (PATCH parcial) e criar em lote. A
 * regra em si está em `criticidade-pela-matriz.spec.ts`; aqui é que cada
 * caminho a aplica sobre o que fica gravado.
 */
describe('criticidade do equipamento pela matriz (banco real)', () => {
  const prisma = new PrismaService();
  const equipamentos = new EquipamentosService(prisma, new PermissionScopeService(prisma));
  // 25 caracteres, como os ids cuid antigos, para provar o trim
  const ID = (s: string) => `testecritmatriz${s}`.padEnd(25, '0').slice(0, 25);
  const DONO = ID('dono');
  const PLANTA = ID('planta');
  const UNIDADE = ID('unidade');
  const NOME = 'TESTE-CRIT-MATRIZ';

  const uc = (extra: Partial<CreateEquipamentoDto> = {}): CreateEquipamentoDto => ({
    nome: `${NOME} UC`,
    classificacao: ClassificacaoEquipamento.UC,
    criticidade: CriticidadeEquipamento.MEDIA,
    unidade_id: UNIDADE,
    ...extra,
  });
  const avaliacao = async (id: string) => {
    const e = await prisma.equipamentos.findUniqueOrThrow({ where: { id } });
    return [e.criticidade, e.criticidade_impacto, e.criticidade_probabilidade, e.criticidade_motivo];
  };

  const apagar = async () => {
    await prisma.equipamentos.deleteMany({ where: { unidade_id: UNIDADE } });
    await prisma.unidades.deleteMany({ where: { id: UNIDADE } });
    await prisma.plantas.deleteMany({ where: { id: PLANTA } });
    await prisma.usuarios.deleteMany({ where: { id: DONO } });
  };

  beforeAll(async () => {
    await apagar();
    await prisma.usuarios.create({ data: { id: DONO, nome: 'Dono', email: `${DONO}@crit-matriz.teste` } });
    await prisma.plantas.create({
      data: { id: PLANTA, nome: 'Planta matriz', cnpj: '83.000.000/0001-01', localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: DONO },
    });
    await prisma.unidades.create({ data: { id: UNIDADE, planta_id: PLANTA, nome: 'Unidade', tipo: 'UFV', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 1 } });
  });

  beforeEach(() => prisma.equipamentos.deleteMany({ where: { unidade_id: UNIDADE } }));

  afterAll(async () => {
    await apagar();
    await prisma.$disconnect();
  });

  it('criar com o nível sugerido grava as notas sem motivo, mesmo se veio um', async () => {
    const criado = await equipamentos.create(uc({ criticidade: CriticidadeEquipamento.ALTA, criticidade_impacto: 5, criticidade_probabilidade: 1, criticidade_motivo: 'sobrou' }));

    expect(await avaliacao(criado.id)).toEqual(['4', 5, 1, null]);
  });

  it('criar com outro nível exige o motivo', async () => {
    await expect(equipamentos.create(uc({ criticidade: CriticidadeEquipamento.MUITO_ALTA, criticidade_impacto: 5, criticidade_probabilidade: 1 }))).rejects.toThrow(
      'A matriz sugere 4 (Alta) para impacto 5 e probabilidade 1. Para gravar 5, informe o motivo.',
    );
    expect(await prisma.equipamentos.count({ where: { unidade_id: UNIDADE } })).toBe(0);
  });

  it('PATCH parcial: trocar só uma nota confere com o resto gravado, e o motivo sai quando volta a bater', async () => {
    const criado = await equipamentos.create(uc({ criticidade: CriticidadeEquipamento.ALTA, criticidade_impacto: 5, criticidade_probabilidade: 1 }));

    // Impacto 3 com probabilidade 1: a matriz dá 2, e o nível gravado é 4
    await expect(equipamentos.update(criado.id, { criticidade_impacto: 3 })).rejects.toThrow(
      'A matriz sugere 2 (Baixa) para impacto 3 e probabilidade 1. Para gravar 4, informe o motivo.',
    );
    await equipamentos.update(criado.id, { criticidade_impacto: 3, criticidade_motivo: 'Único da usina' });
    expect(await avaliacao(criado.id)).toEqual(['4', 3, 1, 'Único da usina']);
    // O motivo gravado continua valendo enquanto o nível difere
    await equipamentos.update(criado.id, { criticidade_probabilidade: 3 });
    expect(await avaliacao(criado.id)).toEqual(['4', 3, 3, 'Único da usina']);
    // Impacto 5 com probabilidade 3: a matriz dá 4, o nível gravado
    await equipamentos.update(criado.id, { criticidade_impacto: 5 });
    expect(await avaliacao(criado.id)).toEqual(['4', 5, 3, null]);
  });

  it('editar outro campo não confere a criticidade (dado de antes não trava)', async () => {
    const criado = await equipamentos.create(uc());
    await prisma.equipamentos.update({ where: { id: criado.id }, data: { criticidade: 'A' } });

    await equipamentos.update(criado.id, { fabricante: 'WEG' });
    expect((await prisma.equipamentos.findUniqueOrThrow({ where: { id: criado.id } })).criticidade).toBe('A');
  });

  it('criar em lote aplica a regra ao bloco comum', async () => {
    await expect(
      equipamentos.criarEmLote({ ...uc({ criticidade: CriticidadeEquipamento.MUITO_BAIXA, criticidade_impacto: 4, criticidade_probabilidade: 4 }), itens: [{ nome: `${NOME} 1` }] } as never),
    ).rejects.toThrow(/A matriz sugere 4 \(Alta\)/);

    await equipamentos.criarEmLote({
      ...uc({ criticidade: CriticidadeEquipamento.ALTA, criticidade_impacto: 4, criticidade_probabilidade: 4 }),
      itens: [{ nome: `${NOME} 1` }, { nome: `${NOME} 2` }],
    } as never);
    const lote = await prisma.equipamentos.findMany({ where: { unidade_id: UNIDADE }, orderBy: { nome: 'asc' } });
    expect(lote.map((e) => [e.nome, e.criticidade, e.criticidade_impacto, e.criticidade_probabilidade])).toEqual([
      [`${NOME} 1`, '4', 4, 4],
      [`${NOME} 2`, '4', 4, 4],
    ]);
  });

  it('o banco recusa nota sozinha ou fora da escala (a trava para escrita fora da API)', async () => {
    const criado = await equipamentos.create(uc());
    await expect(prisma.equipamentos.update({ where: { id: criado.id }, data: { criticidade_impacto: 3 } })).rejects.toThrow(
      /equipamentos_criticidade_matriz_check/,
    );
    await expect(
      prisma.equipamentos.update({ where: { id: criado.id }, data: { criticidade_impacto: 6, criticidade_probabilidade: 1 } }),
    ).rejects.toThrow(/equipamentos_criticidade_matriz_check/);
  });
});
