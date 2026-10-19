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

  // SN-66: o transform manda o dia ("AAAA-MM-DD"); o Prisma recusava e o lote inteiro dava 500
  it('as datas chegam como o dia: gravam a meia-noite; data inválida é 400', async () => {
    await equipamentos.salvarComponentesUARLote(UC, [
      { id: A, nome: 'A', data_instalacao: '2026-04-01', garantia_ate: '2031-04-01' },
      { id: B, nome: 'B', garantia_ate: null },
    ] as never);

    const a = await prisma.equipamentos.findUniqueOrThrow({ where: { id: A } });
    expect([a.data_instalacao?.toISOString(), a.garantia_ate?.toISOString()]).toEqual(['2026-04-01T00:00:00.000Z', '2031-04-01T00:00:00.000Z']);
    await expect(equipamentos.salvarComponentesUARLote(UC, [{ id: A, nome: 'A', garantia_ate: '31/04/2031' }] as never)).rejects.toThrow(
      'Data inválida em garantia_ate',
    );
  });

  // SN-64: o lote não passa pelo pipe; a regra da matriz tem de valer aqui também
  it('criticidade pela matriz: grava as notas; nível diferente sem motivo é 400 e não grava nada', async () => {
    await equipamentos.salvarComponentesUARLote(UC, [
      { id: A, nome: 'A', criticidade: '4', criticidade_impacto: 5, criticidade_probabilidade: 1 },
      { id: B, nome: 'B', criticidade: '5', criticidade_impacto: 5, criticidade_probabilidade: 1, criticidade_motivo: ' Único da usina ' },
    ] as never);
    const gravados = await prisma.equipamentos.findMany({ where: { id: { in: [A, B] } }, orderBy: { nome: 'asc' } });
    expect(gravados.map((e) => [e.criticidade, e.criticidade_impacto, e.criticidade_probabilidade, e.criticidade_motivo])).toEqual([
      ['4', 5, 1, null],
      ['5', 5, 1, 'Único da usina'],
    ]);

    // Só o nível muda: a conta é com as notas gravadas
    await expect(
      equipamentos.salvarComponentesUARLote(UC, [
        { id: A, nome: 'A renomeado' },
        { id: B, nome: 'B', criticidade: '5', criticidade_motivo: null },
      ] as never),
    ).rejects.toThrow('B: A matriz sugere 4 (Alta) para impacto 5 e probabilidade 1. Para gravar 5, informe o motivo.');
    expect(await vivos()).toEqual([[A, 'A'], [B, 'B']]);
  });

  // Revisão do SN-75: o corpo do lote não passa pelo pipe
  it('o item não grava em outro equipamento nem o que tem rota própria (posição, dono, MQTT, foto fora do upload)', async () => {
    await equipamentos.salvarComponentesUARLote(UC, [
      {
        id: A,
        nome: 'A',
        dados_tecnicos: [{ campo: 'tensao', valor: '380', tipo: 'number', equipamento_id: UC }],
        proprietario_id: DONO,
        topico_mqtt: 'outro/topico',
        mqtt_habilitado: true,
      },
      { id: B, nome: 'B' },
    ] as never);

    expect((await prisma.equipamentos_dados_tecnicos.findMany({ where: { equipamento_id: { in: [A, UC] } } })).map((d) => d.equipamento_id.trim())).toEqual([A]);
    const a = await prisma.equipamentos.findUniqueOrThrow({ where: { id: A } });
    expect([a.proprietario_id, a.topico_mqtt, a.mqtt_habilitado]).toEqual([null, null, false]);

    await expect(equipamentos.salvarComponentesUARLote(UC, [{ id: A, nome: 'A', foto_url: 'dist/main.js' }] as never)).rejects.toThrow(
      'A: foto_url inválida',
    );
    await prisma.equipamentos_dados_tecnicos.deleteMany({ where: { equipamento_id: A } });
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
