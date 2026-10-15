import { PermissionScopeService, PrismaService } from '@/core';
import { PlanosManutencaoService } from './planos-manutencao.service';
import { PropagacaoPlanosService } from './propagacao-planos.service';

/**
 * A lista de planos vinculados (`?vinculados=true`, as cópias por equipamento)
 * respeita o escopo por planta. Antes o `user` chegava e era ignorado: o técnico
 * e o cliente, que têm `manutencao.view`, viam os planos e os nomes dos
 * equipamentos das plantas dos outros (achado no SN-36). Contra Postgres real.
 */
describe('planos vinculados pelo escopo da planta (banco real)', () => {
  const prisma = new PrismaService();
  const planos = new PlanosManutencaoService(prisma, new PermissionScopeService(prisma), new PropagacaoPlanosService(prisma));

  const ID = (s: string) => `testeplanoescopo${s}`.padEnd(26, '0').slice(0, 26);
  const DONO_A = ID('donoa');
  const DONO_B = ID('donob');
  const TECNICO_B = ID('tecnicob');
  const PLANTA_A = ID('plantaa');
  const PLANTA_B = ID('plantab');
  const UNIDADE_A = ID('unidadea');
  const UNIDADE_B = ID('unidadeb');
  const UC_A = ID('uca');
  const UAR_A = ID('uara');
  const UC_B = ID('ucb');
  const PREFIXO = 'TESTE-PLANO-ESCOPO';

  const apagar = async () => {
    await prisma.planos_manutencao.deleteMany({ where: { nome: { startsWith: PREFIXO }, equipamento_id: { not: null } } });
    await prisma.planos_manutencao.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
    await prisma.equipamentos.deleteMany({ where: { id: { in: [UAR_A] } } });
    await prisma.equipamentos.deleteMany({ where: { id: { in: [UC_A, UC_B] } } });
    await prisma.unidades.deleteMany({ where: { id: { in: [UNIDADE_A, UNIDADE_B] } } });
    await prisma.planta_operadores.deleteMany({ where: { usuario_id: TECNICO_B } });
    await prisma.plantas.deleteMany({ where: { id: { in: [PLANTA_A, PLANTA_B] } } });
    await prisma.usuarios.deleteMany({ where: { id: { in: [DONO_A, DONO_B, TECNICO_B] } } });
  };

  const planta = (id: string, dono: string, cnpj: string) =>
    prisma.plantas.create({
      data: { id, nome: `${PREFIXO} ${id}`, cnpj, localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: dono },
    });
  const unidade = (id: string, plantaId: string) =>
    prisma.unidades.create({ data: { id, planta_id: plantaId, nome: `${PREFIXO} ${id}`, tipo: 'UFV', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 1 } });

  beforeAll(async () => {
    await apagar();
    for (const id of [DONO_A, DONO_B, TECNICO_B]) await prisma.usuarios.create({ data: { id, nome: id, email: `${id}@plano-escopo.teste` } });
    await planta(PLANTA_A, DONO_A, '94.000.000/0001-01');
    await planta(PLANTA_B, DONO_B, '94.000.000/0001-02');
    await prisma.planta_operadores.create({ data: { usuario_id: TECNICO_B, planta_id: PLANTA_B } });
    await unidade(UNIDADE_A, PLANTA_A);
    await unidade(UNIDADE_B, PLANTA_B);
    await prisma.equipamentos.create({ data: { id: UC_A, nome: 'Inversor A', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE_A } });
    await prisma.equipamentos.create({ data: { id: UAR_A, nome: 'Ventoinha A', classificacao: 'UAR', criticidade: '3', equipamento_pai_id: UC_A } });
    await prisma.equipamentos.create({ data: { id: UC_B, nome: 'Inversor B', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE_B } });

    const template = await prisma.planos_manutencao.create({ data: { nome: `${PREFIXO} template` } });
    for (const [equipamento, nome] of [[UC_A, 'A'], [UAR_A, 'componente A'], [UC_B, 'B']]) {
      await prisma.planos_manutencao.create({ data: { nome: `${PREFIXO} ${nome}`, equipamento_id: equipamento, plano_origem_id: template.id } });
    }
  });

  afterAll(async () => {
    await apagar();
    await prisma.$disconnect();
  });

  const vinculados = async (user?: { id: string; role: string }) =>
    (await planos.listar({ page: 1, limit: 100, vinculados: true, search: PREFIXO } as never, user)).data
      .map((p) => p.nome)
      .sort();

  it('cliente vê só os planos da planta dele (o componente pelo UC pai)', async () => {
    expect(await vinculados({ id: DONO_A, role: 'proprietario' })).toEqual([`${PREFIXO} A`, `${PREFIXO} componente A`]);
  });

  it('técnico vê só os planos das plantas em que atua', async () => {
    expect(await vinculados({ id: TECNICO_B, role: 'operador' })).toEqual([`${PREFIXO} B`]);
  });

  it('técnico sem planta não vê nenhum', async () => {
    expect(await vinculados({ id: DONO_B, role: 'operador' })).toEqual([]);
  });

  it('quem vê todas as plantas vê todos', async () => {
    expect(await vinculados({ id: DONO_A, role: 'admin' })).toHaveLength(3);
  });

  it('a lista de templates continua sem escopo (template não tem planta)', async () => {
    const templates = (await planos.listar({ page: 1, limit: 100, search: PREFIXO } as never, { id: TECNICO_B, role: 'operador' })).data;
    expect(templates.map((p) => p.nome)).toEqual([`${PREFIXO} template`]);
  });
});
