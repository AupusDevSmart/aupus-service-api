import { PermissionScopeService, PrismaService } from '@/core';
import { EquipamentosService } from './equipamentos.service';

/**
 * Salvar os componentes do UC de uma vez (PUT /:ucId/componentes/batch, o
 * "Salvar" da lista de componentes no sheet do UC). Quem existe vai com o id e
 * continua com ele; quem não veio é apagado. E é tudo ou nada: o apagar rodava
 * fora de transação, e um erro no meio deixava componentes apagados e outros
 * já alterados (revisão do SN-12).
 */
describe('componentes do UC em lote (banco real)', () => {
  const prisma = new PrismaService();
  const equipamentos = new EquipamentosService(prisma, new PermissionScopeService(prisma));
  // 25 caracteres, como os ids cuid antigos, para provar o trim
  const ID = (s: string) => `testelotecomp${s}`.padEnd(25, '0').slice(0, 25);
  const DONO = ID('dono');
  const PLANTA = ID('planta');
  const UNIDADE = ID('unidade');
  const UC = ID('uc');
  const A = ID('a');
  const B = ID('b');

  const vivos = async () =>
    (await prisma.equipamentos.findMany({ where: { equipamento_pai_id: UC, deleted_at: null }, orderBy: { nome: 'asc' } }))
      .map((e) => [e.id.trim(), e.nome]);

  const apagarComponentes = () => prisma.equipamentos.deleteMany({ where: { equipamento_pai_id: UC } });
  const apagar = async () => {
    await apagarComponentes();
    await prisma.equipamentos.deleteMany({ where: { id: UC } });
    await prisma.unidades.deleteMany({ where: { id: UNIDADE } });
    await prisma.plantas.deleteMany({ where: { id: PLANTA } });
    await prisma.usuarios.deleteMany({ where: { id: DONO } });
  };

  beforeAll(async () => {
    await apagar();
    await prisma.usuarios.create({ data: { id: DONO, nome: 'Dono', email: `${DONO}@lote-comp.teste` } });
    await prisma.plantas.create({
      data: { id: PLANTA, nome: 'Planta lote', cnpj: '82.000.000/0001-01', localizacao: 'x', horario_funcionamento: '08-18', logradouro: 'Rua', cidade: 'Goiânia', uf: 'GO', cep: '74000-000', proprietario_id: DONO },
    });
    await prisma.unidades.create({ data: { id: UNIDADE, planta_id: PLANTA, nome: 'Unidade', tipo: 'UFV', estado: 'GO', cidade: 'Goiânia', latitude: 0, longitude: 0, potencia: 1 } });
    await prisma.equipamentos.create({ data: { id: UC, nome: 'Inversor', classificacao: 'UC', criticidade: '3', unidade_id: UNIDADE } });
  });

  beforeEach(async () => {
    await apagarComponentes();
    for (const [id, nome] of [[A, 'A'], [B, 'B']]) {
      await prisma.equipamentos.create({ data: { id, nome, classificacao: 'UAR', criticidade: '3', equipamento_pai_id: UC, unidade_id: UNIDADE } });
    }
  });

  afterAll(async () => {
    await apagar();
    await prisma.$disconnect();
  });

  it('quem vai com o id continua com o mesmo id', async () => {
    await equipamentos.salvarComponentesUARLote(UC, [
      { id: A, nome: 'A renomeado' },
      { id: B, nome: 'B' },
    ]);

    expect(await vivos()).toEqual([[A, 'A renomeado'], [B, 'B']]);
  });

  it('erro no meio não apaga nem altera nada', async () => {
    await expect(
      equipamentos.salvarComponentesUARLote(UC, [
        { id: A, nome: 'A renomeado' },
        { id: ID('inexistente'), nome: 'X' },
      ]),
    ).rejects.toThrow();

    expect(await vivos()).toEqual([[A, 'A'], [B, 'B']]);
  });
});
