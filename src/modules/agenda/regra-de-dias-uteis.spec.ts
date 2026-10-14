import { PrismaService } from '@/core';
import { regraDeDiasUteis, proximoDiaUtil } from './dias-uteis';

/**
 * De onde vem a regra de cada planta, contra Postgres de verdade: a
 * configuração da planta vence a geral, e o feriado de uma planta não vale
 * para a outra.
 */
describe('regraDeDiasUteis (banco real)', () => {
  const prisma = new PrismaService();
  const PREFIXO = 'TESTE-DIAS-UTEIS';
  const DONO = 'testediasuteisdono00000001';
  const PLANTA_X = 'testediasuteisplantax00001';
  const PLANTA_Y = 'testediasuteisplantay00001';

  const limpar = async () => {
    await prisma.feriados.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
    await prisma.configuracoes_dias_uteis.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
  };

  beforeAll(async () => {
    await limpar();
    await prisma.usuarios.upsert({
      where: { id: DONO },
      update: {},
      create: { id: DONO, nome: 'Dono', email: 'dono@dias-uteis.teste', role: 'proprietario' },
    });
    for (const [id, cnpj] of [
      [PLANTA_X, '99.000.000/0001-01'],
      [PLANTA_Y, '99.000.000/0001-02'],
    ]) {
      await prisma.plantas.upsert({
        where: { id },
        update: {},
        create: {
          id,
          nome: `${PREFIXO} ${id}`,
          cnpj,
          localizacao: 'x',
          horario_funcionamento: '08-18',
          logradouro: 'Rua',
          cidade: 'Goiânia',
          uf: 'GO',
          cep: '74000-000',
          proprietario_id: DONO,
        },
      });
    }

    await prisma.feriados.create({
      data: { nome: `${PREFIXO} geral`, data: new Date('2026-10-19T00:00:00Z'), tipo: 'NACIONAL', geral: true },
    });
    await prisma.feriados.create({
      data: {
        nome: `${PREFIXO} só da X`,
        data: new Date('2026-10-20T00:00:00Z'),
        tipo: 'MUNICIPAL',
        geral: false,
        feriado_plantas: { create: { planta_id: PLANTA_X } },
      },
    });
    await prisma.configuracoes_dias_uteis.create({
      data: {
        nome: `${PREFIXO} X trabalha sábado`,
        sabado: true,
        geral: false,
        configuracao_plantas: { create: { planta_id: PLANTA_X } },
      },
    });
  });

  afterAll(async () => {
    await limpar();
    await prisma.plantas.deleteMany({ where: { id: { in: [PLANTA_X, PLANTA_Y] } } });
    await prisma.usuarios.deleteMany({ where: { id: DONO } });
    await prisma.$disconnect();
  });

  const nomes = (r: { feriados: { nome?: string }[] }) =>
    r.feriados.map((f) => f.nome).filter((n) => n?.startsWith(PREFIXO)).sort();

  it('a planta com configuração própria usa a dela e soma os feriados gerais e os seus', async () => {
    const r = await regraDeDiasUteis(prisma, PLANTA_X);

    expect(r.diasDaSemana[6]).toBe(true);
    expect(r.configuracao?.nome).toBe(`${PREFIXO} X trabalha sábado`);
    expect(nomes(r)).toEqual([`${PREFIXO} geral`, `${PREFIXO} só da X`]);
  });

  it('o feriado de uma planta não vale para a outra', async () => {
    const r = await regraDeDiasUteis(prisma, PLANTA_Y);

    expect(nomes(r)).toEqual([`${PREFIXO} geral`]);
    expect(r.diasDaSemana[6]).toBe(false);
  });

  it('id com o espaço do Char(26) dá a mesma regra', async () => {
    const r = await regraDeDiasUteis(prisma, `${PLANTA_X}`.padEnd(26, ' '));
    expect(nomes(r)).toHaveLength(2);
  });

  it('domingo 18/10 vai para terça na Y (segunda é feriado geral) e para quarta na X (terça é feriado dela)', async () => {
    const domingo = new Date('2026-10-18T13:00:00Z');

    expect(proximoDiaUtil(domingo, await regraDeDiasUteis(prisma, PLANTA_Y)).toISOString()).toBe('2026-10-20T13:00:00.000Z');
    expect(proximoDiaUtil(domingo, await regraDeDiasUteis(prisma, PLANTA_X)).toISOString()).toBe('2026-10-21T13:00:00.000Z');
  });
});
